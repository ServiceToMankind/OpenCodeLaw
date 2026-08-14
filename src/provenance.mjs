#!/usr/bin/env node
/**
 * Builds PROVENANCE.md: for every provision the three Acts touch, a comparison
 * of the text in the constitution today, the text the Act prescribes, and the
 * text as it stood before the Act.
 *
 * This is an analysis tool. It changes no constitutional text and never
 * resolves a DIVERGENT verdict — it only reports one.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { loadActs } from './acts-parse.mjs'
import { classify, similarity, containment, normalise, MATCH_THRESHOLD } from './text-compare.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const load = rel => yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { schema: yaml.CORE_SCHEMA })

const ACT_META = {
  'first-constitution-amendment-act-2024.txt': { id: 'act-1-2024', label: 'Act 1 of 2024', short: 'Membership Act, 2024' },
  'second-constitution-amendment-act-2024.txt': { id: 'act-2-2024', label: 'Act 2 of 2024', short: null },
  'third-constitution-amendment-act-2024.txt': { id: 'act-3-2024', label: 'Act 3 of 2024', short: 'Finance Act, 2024' }
}

/** Everything a reader sees under a provision: its body plus each section's heading and body. */
function fullText (node) {
  if (!node) return null
  const parts = [node.content ?? '']
  for (const s of node.sections ?? []) parts.push(s.title ?? '', s.content ?? '')
  return parts.join('\n').trim()
}

function findProvision (doc, target) {
  if (target === 'preamble') return doc.preamble
  const n = Number(target.replace('art-', ''))
  return doc.articles.find(a => a.number === n) ?? null
}

/** Split an Act's clause-scope segment on its own `(N)` markers. */
function splitClauses (text) {
  const re = /^[ \t]*\((\d+)\)/gm
  const marks = [...text.matchAll(re)]
  if (!marks.length) return null
  return marks.map((m, i) => ({
    number: Number(m[1]),
    text: text.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : undefined).trim()
  }))
}

/**
 * Three measures, because one is not enough to tell the three verdicts apart:
 *
 *   simEnacted     how closely the provision reads as the Act prescribes
 *   containEnacted whether the Act's words appear here at all, even if the
 *                  provision also retains text the Act deleted
 *   drift          whether the provision has changed since before the Acts
 *
 * `drift` is what distinguishes NOT-APPLIED from DIVERGENT. Judging on
 * similarity-to-the-Act alone reports a provision that is word-for-word its
 * own pre-Act text as DIVERGENT, purely because the Act rewrote it heavily —
 * which is the definition of NOT-APPLIED, not of an unauthorised edit.
 */
export function verdictFor (current, enacted, prior, { contained }) {
  const hasCurrent = normalise(current).length > 0
  const drift = prior == null ? (hasCurrent ? 0 : 1) : similarity(current, prior)
  const containEnacted = containment(enacted, current)
  const simEnacted = contained ? containEnacted : similarity(current, enacted)

  let verdict
  if (!hasCurrent) verdict = 'NOT-APPLIED'                    // insertion not yet made
  else if (simEnacted >= MATCH_THRESHOLD) verdict = 'ALREADY-APPLIED'
  else if (drift >= MATCH_THRESHOLD) verdict = 'NOT-APPLIED'  // word-for-word the pre-Act text
  else verdict = 'DIVERGENT'

  return { verdict, simEnacted, drift, containEnacted }
}

function analyse () {
  const current = load('constitution/current.yaml')
  const prior = load('constitution/versions/v1.0.0.yaml')
  const acts = loadActs(ROOT)
  const rows = []

  for (const act of acts) {
    const meta = ACT_META[path.basename(act.file)]
    for (const p of act.provisions) {
      const cur = findProvision(current, p.target)
      const pri = findProvision(prior, p.target)
      const curText = fullText(cur)
      const priText = fullText(pri)

      const clauses = p.scope === 'clause' ? splitClauses(p.text) : null

      // The heading names which clauses the Act amends. If the body does not
      // yield exactly those, a clause has been lost in extraction and every
      // verdict below it is incomplete. Fail loudly rather than under-report.
      if (p.scope === 'clause') {
        const expected = p.clauses.split(',').map(Number).sort((a, b) => a - b)
        const found = (clauses ?? []).map(c => c.number).sort((a, b) => a - b)
        if (expected.join() !== found.join()) {
          throw new Error(
            `${p.target}: heading names clause(s) ${expected.join(', ')} but the body yields ` +
            `${found.length ? found.join(', ') : 'none'} (${act.file} line ${p.source_line}). ` +
            'Extraction is incomplete; do not trust any verdict until this is resolved.'
          )
        }
      }

      if (clauses) {
        for (const c of clauses) {
          rows.push({
            act: meta, target: p.target, clause: c.number, scope: 'clause',
            operation: p.operation, source_line: p.source_line,
            enacted_title: p.enacted_title,
            currentTitle: cur?.title ?? null, priorTitle: pri?.title ?? null,
            current: curText, enacted: c.text, prior: priText,
            ...verdictFor(curText, c.text, priText, { contained: true })
          })
        }
      } else {
        const sectionsText = (cur?.sections ?? []).flatMap(s => [s.title ?? '', s.content ?? '']).join('\n').trim()
        const breakdown = (cur?.sections?.length && cur?.content)
          ? {
              bodyInAct: containment(cur.content, p.text),
              sectionsVsAct: similarity(sectionsText, p.text),
              bodyVsPrior: pri?.content ? similarity(cur.content, pri.content) : 0
            }
          : null
        rows.push({
          breakdown,
          act: meta, target: p.target, clause: null, scope: 'article',
          operation: p.operation, source_line: p.source_line,
          enacted_title: p.enacted_title,
          currentTitle: cur?.title ?? null, priorTitle: pri?.title ?? null,
          current: curText, enacted: p.text, prior: priText,
          ...verdictFor(curText, p.text, priText, { contained: false })
        })
      }
    }
  }
  return { rows, current, prior }
}

// ---------------------------------------------------------------------------

const MARK = { 'ALREADY-APPLIED': '🟢', 'NOT-APPLIED': '🟡', DIVERGENT: '🔴' }
const pct = n => (n * 100).toFixed(1) + '%'
const fence = s => '```\n' + (s && s.trim() ? s.trim() : '(no text)') + '\n```'

function render ({ rows }) {
  const counts = rows.reduce((a, r) => ({ ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {})
  const divergent = rows.filter(r => r.verdict === 'DIVERGENT')
  const out = []

  out.push('# Provenance')
  out.push('')
  out.push('**Status:** unsigned. No constitutional text has been changed.')
  out.push(`**Generated:** \`npm run provenance\` · branch \`rebuild/v3\` · ${rows.length} comparisons`)
  out.push('')
  out.push('For every provision the three Acts touch: the text in `constitution/current.yaml` today,')
  out.push('the text the Act prescribes, and a verdict. Regenerate with `npm run provenance`.')
  out.push('')
  out.push('| Verdict | Meaning | Count |')
  out.push('|---|---|---|')
  out.push(`| 🟢 ALREADY-APPLIED | Current text matches the Act's prescribed text | ${counts['ALREADY-APPLIED'] ?? 0} |`)
  out.push(`| 🟡 NOT-APPLIED | Current text is the pre-Act text, or the insertion has not been made | ${counts['NOT-APPLIED'] ?? 0} |`)
  out.push(`| 🔴 DIVERGENT | Matches neither — edited outside the amendment process | ${counts.DIVERGENT ?? 0} |`)
  out.push('')

  out.push('## Method')
  out.push('')
  out.push('Comparison runs on `src/text-compare.mjs`. Tags are stripped **before** punctuation and')
  out.push('replaced with a space, so inline `<br>` in the specs cannot inject a stray `br` token and')
  out.push('produce a false NOT-APPLIED. `tests/text-compare.test.mjs` asserts this against the real')
  out.push('Article 9 pair; if that fixture fails, no verdict in this file may be trusted.')
  out.push('')
  out.push('Enumerator style (`(1)` vs `1.`) and typography (curly vs straight quotes) are folded, so')
  out.push('a provision is not reported as changed merely for being formatted differently.')
  out.push('')
  out.push('- **Article scope** — whole-provision similarity, body plus every section heading and body.')
  out.push('- **Clause scope** — containment: whether the Act\'s clause appears anywhere in the current')
  out.push('  provision. The constitution stores several of these articles as one undivided block, and')
  out.push('  slicing it into clauses would mean guessing where each clause begins.')
  out.push('')
  out.push(`Match threshold ${MATCH_THRESHOLD}. Pre-Act baseline is \`constitution/versions/v1.0.0.yaml\`,`)
  out.push('the last version that demonstrably predates all three Acts.')
  out.push('')

  if (divergent.length) {
    out.push('## 🔴 DIVERGENT — stop here')
    out.push('')
    out.push(`${divergent.length} provision(s) match neither the Act nor the pre-Act text. These are not`)
    out.push('classified further and must not be resolved without a decision from the board.')
    out.push('')
    for (const r of divergent) {
      out.push(`- **${r.target}${r.clause ? ` clause (${r.clause})` : ''}** (${r.act.label}) — ` +
        `reads as the Act ${pct(r.simEnacted)}, the Act's words are ${pct(r.containEnacted)} present, ` +
        `${pct(r.drift)} unchanged since v1.`)
      if (r.breakdown) {
        out.push('')
        out.push(`  Splitting the provision shows where the divergence sits:`)
        out.push('')
        out.push(`  | Part | Matches the Act | Matches pre-Act text |`)
        out.push(`  |---|---|---|`)
        out.push(`  | Sections | **${pct(r.breakdown.sectionsVsAct)}** | — |`)
        out.push(`  | Article body | ${pct(r.breakdown.bodyInAct)} | ${pct(r.breakdown.bodyVsPrior)} |`)
        out.push('')
        out.push(`  The Act's text is present in full; the article additionally retains a body the Act`)
        out.push(`  does not enact. Under a full substitution that body would have been deleted.`)
        out.push('')
      }
    }
    out.push('')
  }

  out.push('## Summary')
  out.push('')
  out.push('| | Act | Provision | Op | Scope | Current title | Act title | Reads as Act | Act words present | Unchanged since v1 | Verdict |')
  out.push('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) {
    const name = `\`${r.target}\`${r.clause ? ` (${r.clause})` : ''}`
    out.push(`| ${MARK[r.verdict]} | ${r.act.label} | ${name} | ${r.operation} | ${r.scope} | ` +
      `${r.currentTitle ? `${r.currentTitle}` : '—'} | ${r.enacted_title ?? '—'} | ` +
      `${pct(r.simEnacted)} | ${pct(r.containEnacted)} | ${pct(r.drift)} | **${r.verdict}** |`)
  }
  out.push('')

  out.push('## Provision by provision')
  out.push('')
  let lastAct = null
  for (const r of rows) {
    if (r.act.label !== lastAct) {
      out.push(`### ${r.act.label}${r.act.short ? ` — *${r.act.short}*` : ''}`)
      out.push('')
      lastAct = r.act.label
    }
    const head = `${r.target}${r.clause ? ` clause (${r.clause})` : ''}`
    out.push(`#### ${MARK[r.verdict]} ${head} — ${r.verdict}`)
    out.push('')
    out.push(`\`${r.operation}\` · ${r.scope} scope · source \`${r.act.id}\` line ${r.source_line}`)
    out.push('')
    out.push(`Reads as the Act **${pct(r.simEnacted)}** · Act's words present ${pct(r.containEnacted)} · ` +
      `unchanged since v1 ${pct(r.drift)}`)
    if (r.currentTitle !== r.enacted_title && r.enacted_title) {
      out.push('')
      out.push(`> Title: current \`${r.currentTitle ?? '—'}\` → enacted \`${r.enacted_title}\``)
    }
    out.push('')
    out.push('<details><summary>Current text — <code>constitution/current.yaml</code></summary>')
    out.push('')
    out.push(fence(r.current))
    out.push('')
    out.push('</details>')
    out.push('')
    out.push('<details><summary>Enacted text — as the Act prescribes it</summary>')
    out.push('')
    out.push(fence(r.enacted))
    out.push('')
    out.push('</details>')
    out.push('')
  }

  out.push('## Sign-off')
  out.push('')
  out.push('Applying an amendment already in force would duplicate or revert a provision, so every')
  out.push('🟡 NOT-APPLIED row must be confirmed before Phase 3 applies anything.')
  out.push('')
  for (const r of rows) {
    out.push(`- [ ] ${MARK[r.verdict]} \`${r.target}${r.clause ? `(${r.clause})` : ''}\` — ${r.act.label} — ${r.verdict}`)
  }
  out.push('')
  return out.join('\n')
}

// Importing this module (for `verdictFor`, in tests) must not rewrite the
// report on disk. Generation happens only when the script is run directly.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (invokedDirectly) {
  const result = analyse()
  fs.writeFileSync(path.join(ROOT, 'PROVENANCE.md'), render(result))

  const counts = result.rows.reduce((a, r) => ({ ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {})
  console.log(`PROVENANCE.md — ${result.rows.length} comparisons`)
  for (const [k, v] of Object.entries(counts)) console.log(`  ${MARK[k]} ${k.padEnd(16)} ${v}`)
  if (counts.DIVERGENT) {
    console.log('\nDIVERGENT provisions (not classified further):')
    for (const r of result.rows.filter(x => x.verdict === 'DIVERGENT')) {
      console.log(`  ${r.target}${r.clause ? `(${r.clause})` : ''}  ${r.act.label}  ` +
        `reads-as-act=${pct(r.simEnacted)} act-words-present=${pct(r.containEnacted)} unchanged-since-v1=${pct(r.drift)}`)
    }
  }
}
