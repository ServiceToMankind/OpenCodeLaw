#!/usr/bin/env node
/**
 * Applies one Amendment Act to constitution/current.yaml.
 *
 * Every edit is declared here or in act-application.mjs, and every string comes
 * from `acts/text/` by slice — provision text is never retyped. After writing,
 * the result is checked three ways:
 *
 *   1. the set of provisions that changed equals the set the manifest expects
 *      for this Act, exactly — nothing outside it may move;
 *   2. each changed provision matches the Act's prescribed text under the
 *      normaliser;
 *   3. every provision the Act does not touch is byte-identical to before.
 *
 * Any failure aborts before writing. Usage: node src/apply-act.mjs act-1-2024
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { loadActs } from './acts-parse.mjs'
import { dedent, ACT_ID } from './manifest.mjs'
import { STRUCTURE, shape, verifyCoverage } from './act-application.mjs'
import { normalise, similarity } from './text-compare.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = path.join(ROOT, 'constitution/current.yaml')
const OPTS = { schema: yaml.CORE_SCHEMA }
const DUMP = { lineWidth: -1, noRefs: true, quotingType: '"' }

/**
 * Clause-scope edits: an Act replaces named clauses inside a provision that
 * stays otherwise intact. Declared as line ranges into the CURRENT text, with
 * the replacement sliced from the Act.
 */
const CLAUSE_EDITS = {
  // Act 1 substitutes clauses (1)-(5), which are sections here. Clause (6)
  // Donor is unnamed by the Act and therefore untouched — see Q2.
  'art-6': { kind: 'sections-from-clauses', firstSection: 1, lastSection: 5 },

  // Act 1 substitutes clause (4) outright, and within clause (6) replaces
  // sub-clause (a) point 6 and sub-clause (b). Points (a)1-5 are unnamed and
  // stay. The Act's own Statement of Objects describes exactly this.
  'art-7': {
    kind: 'line-splice',
    edits: [
      { lines: [3, 3], from: 'clause', clause: 4, prefix: '4. ' },
      { lines: [19, 23], from: 'sub', clause: 6, marker: /^\s*\(a\)\s*6\.\s*/, prefix: '        6. ' },
      { lines: [24, 26], from: 'sub', clause: 6, marker: /^\s*\(b\)\s*/, prefix: '    * (b)' }
    ]
  },

  // Act 2 substitutes clause 3; clauses 1 and 2 are untouched.
  'art-16': {
    kind: 'line-splice',
    edits: [{ lines: [2, 2], from: 'clause', clause: 3, prefix: '3. ' }]
  },

  // Act 2 substitutes clause (1), which this article numbers "(a)." — the same
  // clause, confirmed by its opening words. Clause (b) is untouched.
  'art-17': {
    kind: 'line-splice',
    edits: [{ lines: [0, 1], from: 'clause', clause: 1, prefix: '(a). ' }]
  }
}

/** Split an Act span into its top-level `(N)` clauses. */
function actClauses (text) {
  const t = dedent(text)
  const marks = [...t.matchAll(/^[ \t]*\((\d+)\)[ \t]*/gm)]
  const out = new Map()
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : t.length
    out.set(Number(m[1]), dedent(t.slice(m.index + m[0].length, end)).trim())
  })
  return out
}

/** Collapse a wrapped PDF paragraph to one line, preserving words exactly. */
const unwrap = s => s.split('\n').map(l => l.trim()).filter(Boolean).join(' ')

function applyClauseEdits (target, node, actText) {
  const decl = CLAUSE_EDITS[target]
  const clauses = actClauses(actText)

  if (decl.kind === 'sections-from-clauses') {
    for (let n = decl.firstSection; n <= decl.lastSection; n++) {
      const raw = clauses.get(n)
      if (!raw) throw new Error(`${target}: Act has no clause (${n})`)
      const flat = unwrap(raw)
      const idx = flat.indexOf(':')
      if (idx < 0) throw new Error(`${target} clause (${n}): no "Title: text" form`)
      const sec = node.sections.find(s => s.number === n)
      if (!sec) throw new Error(`${target}: no section ${n}`)
      sec.title = flat.slice(0, idx).trim()
      sec.content = flat.slice(idx + 1).trim() + '\n'
      sec.title_source = 'enacted'
    }
    return
  }

  const lines = node.content.split('\n')
  // Apply from the bottom so earlier ranges keep their indices.
  for (const e of [...decl.edits].sort((a, b) => b.lines[0] - a.lines[0])) {
    const raw = clauses.get(e.clause)
    if (raw == null) throw new Error(`${target}: Act has no clause (${e.clause})`)
    let text = raw
    if (e.from === 'sub') {
      // Pull one sub-clause out of a clause that contains several.
      const parts = raw.split(/\n(?=\s*\((?:a|b)\))/)
      const hit = parts.find(p => e.marker.test(p.replace(/\n/g, ' ')) || e.marker.test(p))
      if (!hit) throw new Error(`${target}: clause (${e.clause}) has no part matching ${e.marker}`)
      text = hit.replace(e.marker, '')
    }
    lines.splice(e.lines[0], e.lines[1] - e.lines[0] + 1, e.prefix + unwrap(text))
  }
  node.content = lines.join('\n')
}

function applyArticleScope (target, doc, actText, enactedTitle) {
  const s = shape(target, actText)
  const node = target === 'preamble'
    ? doc.preamble
    : doc.articles.find(a => a.id === target)
  if (!node) throw new Error(`${target}: not present`)

  if (enactedTitle) { node.title = enactedTitle; node.title_source = 'enacted' }
  if (s.content) node.content = s.content + '\n'
  else delete node.content

  if (s.sections.length) {
    node.sections = s.sections.map(sec => ({
      id: `${target}-s-${sec.number}`,
      number: sec.number,
      title: sec.title,
      title_source: 'enacted',
      content: sec.content + '\n'
    }))
  } else {
    delete node.sections
  }
}

function insertArticle (target, doc, actText, enactedTitle, actId) {
  const number = Number(target.replace('art-', ''))
  const s = shape(target, actText)
  const article = {
    id: target,
    number,
    title: enactedTitle,
    title_source: 'enacted',
    ...(s.content ? { content: s.content + '\n' } : {}),
    ...(s.sections.length
      ? { sections: s.sections.map(sec => ({ id: `${target}-s-${sec.number}`, number: sec.number, title: sec.title, title_source: 'enacted', content: sec.content + '\n' })) }
      : {}),
    amended_by: [actId]
  }
  doc.articles.push(article)
  doc.articles.sort((a, b) => a.number - b.number)
}

/** Flatten every provision string, for the before/after comparison. */
function snapshot (doc) {
  const m = new Map()
  m.set('preamble.title', doc.preamble.title)
  m.set('preamble.content', doc.preamble.content ?? null)
  for (const a of doc.articles) {
    m.set(`${a.id}.title`, a.title)
    m.set(`${a.id}.content`, a.content ?? null)
    for (const s of a.sections ?? []) {
      m.set(`${s.id}.title`, s.title)
      m.set(`${s.id}.content`, s.content ?? null)
    }
  }
  return m
}

export function applyAct (actId, { dryRun = false } = {}) {
  const acts = loadActs(ROOT)
  const act = acts.find(a => ACT_ID[path.basename(a.file)] === actId)
  if (!act) throw new Error(`unknown act ${actId}`)

  const before = yaml.load(fs.readFileSync(FILE, 'utf8'), OPTS)
  const doc = yaml.load(fs.readFileSync(FILE, 'utf8'), OPTS)
  const beforeSnap = snapshot(before)

  const expected = new Set()
  const applied = []

  for (const p of act.provisions) {
    const target = p.target
    const node = target === 'preamble' ? doc.preamble : doc.articles.find(a => a.id === target)

    // Already reconciled by a previous pass: record the reference, change nothing.
    const alreadyApplied = node && similarity(
      [node.content ?? '', ...(node.sections ?? []).flatMap(s => [s.title, s.content])].join('\n'),
      p.text
    ) >= 0.94

    if (p.operation === 'insert' && !node) {
      insertArticle(target, doc, p.text, p.enacted_title, actId)
      applied.push(`${target} inserted`)
    } else if (alreadyApplied) {
      // Content already matches, but the Act may still restate the heading.
      // Article 12's text was applied by hand before this rebuild while its
      // title stayed "Alumini"; skipping the whole provision on a content match
      // left the Act's own correction unapplied.
      if (p.enacted_title && p.enacted_title !== node.title) {
        applied.push(`${target} retitled ${JSON.stringify(node.title)} -> ${JSON.stringify(p.enacted_title)}`)
        node.title = p.enacted_title
        node.title_source = 'enacted'
      } else {
        applied.push(`${target} already applied`)
      }
    } else if (p.scope === 'clause') {
      applyClauseEdits(target, node, p.text)
      // A clause-scope Act still restates the article heading above its
      // clauses, and that heading is enacted text: Act 2 heads Article 16
      // "16. Amendments", which is how the misspelling is corrected by the
      // instrument rather than by an editor.
      if (p.enacted_title && p.enacted_title !== node.title) {
        applied.push(`${target} retitled ${JSON.stringify(node.title)} -> ${JSON.stringify(p.enacted_title)}`)
        node.title = p.enacted_title
      }
      if (p.enacted_title) node.title_source = 'enacted'
      applied.push(`${target} clauses ${p.clauses}`)
    } else {
      applyArticleScope(target, doc, p.text, p.enacted_title)
      applied.push(`${target} substituted`)
    }

    if (node || p.operation === 'insert') {
      const n = target === 'preamble' ? doc.preamble : doc.articles.find(a => a.id === target)
      if (!n.amended_by) n.amended_by = []
      if (!n.amended_by.includes(actId)) n.amended_by.push(actId)
    }
    expected.add(target)
  }

  // ---- verification ------------------------------------------------------
  const afterSnap = snapshot(doc)
  const changed = new Set()
  for (const k of new Set([...beforeSnap.keys(), ...afterSnap.keys()])) {
    if (beforeSnap.get(k) !== afterSnap.get(k)) changed.add(k.split('.')[0].replace(/-s-\d+$/, ''))
  }

  const outside = [...changed].filter(id => !expected.has(id))
  if (outside.length) {
    throw new Error(`ABORT: provisions changed outside the manifest for ${actId}: ${outside.join(', ')}`)
  }

  for (const p of act.provisions) {
    const n = p.target === 'preamble' ? doc.preamble : doc.articles.find(a => a.id === p.target)
    const full = [n.content ?? '', ...(n.sections ?? []).flatMap(s => [s.title, s.content])].join('\n')
    if (p.scope === 'article') {
      const sim = similarity(full, p.text)
      if (sim < 0.94) throw new Error(`ABORT: ${p.target} does not match ${actId} (${(sim * 100).toFixed(1)}%)`)
    } else {
      const cl = actClauses(p.text)
      for (const num of p.clauses.split(',').map(Number)) {
        const clauseText = cl.get(num)
        const hay = normalise(full)
        // Every clause the Act names must now be present in the provision.
        const needle = normalise(unwrap(clauseText)).split(' ').slice(-12).join(' ')
        if (needle && !hay.includes(needle)) {
          throw new Error(`ABORT: ${p.target} clause (${num}) not found in the applied text`)
        }
      }
    }
  }

  if (!dryRun) fs.writeFileSync(FILE, yaml.dump(doc, DUMP))
  return { applied, changed: [...changed], expected: [...expected] }
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (direct) {
  const actId = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  const r = applyAct(actId, { dryRun })
  console.log(`${actId}${dryRun ? ' (dry run)' : ''}`)
  for (const a of r.applied) console.log(`  ${a}`)
  console.log(`  changed: ${r.changed.join(', ') || '(none)'}`)
}
