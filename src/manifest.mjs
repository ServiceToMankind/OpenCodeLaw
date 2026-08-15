#!/usr/bin/env node
/**
 * The expected-change manifest.
 *
 * Built from `acts/text/` BEFORE any provision is written, and used to gate
 * every commit that applies an Act: a provision may change only if the manifest
 * says that Act changes it, and it must then match the Act's prescribed text.
 * Anything else aborts.
 *
 * Roughly twenty provisions change across three Acts. An unexpected diff in
 * that volume is precisely what nobody catches by eye, and the difference
 * between a mechanical transcription and a rewrite is whether it was declared
 * in advance.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { loadActs } from './acts-parse.mjs'
import { clauseHeadings } from './title-source.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const ACT_ID = {
  'first-constitution-amendment-act-2024.txt': 'act-1-2024',
  'second-constitution-amendment-act-2024.txt': 'act-2-2024',
  'third-constitution-amendment-act-2024.txt': 'act-3-2024'
}

/** Strip the common indent the PDF layout adds, without touching relative indent. */
export function dedent (text) {
  const lines = String(text).replace(/\s+$/, '').split('\n')
  const indents = lines.filter(l => l.trim()).map(l => l.match(/^[ \t]*/)[0].length)
  const min = indents.length ? Math.min(...indents) : 0
  return lines.map(l => l.slice(min)).join('\n').replace(/[ \t]+$/gm, '')
}

/**
 * Derive an article's shape from the Act's own clause layout. Never invented:
 *
 *  - text before the first clause marker is the article body;
 *  - a clause whose first line is a short label ("(1) Eligibility") becomes a
 *    section with that heading;
 *  - a clause that opens straight into a sentence stays in the body, numbering
 *    and all, because the Act did not give it a heading.
 *
 * So Act 2's Article 8 yields five sections, and its Article 20 yields none.
 */
export function deriveStructure (actText) {
  const text = dedent(actText)

  // Top-level clauses only. The marker must start the line with no indent:
  // Article 8's "1. Stipend" is a clause, the indented "1. The student should
  // fill out…" nested inside its Selection Process is not, and allowing leading
  // whitespace pulled both in as siblings.
  const markers = [...text.matchAll(/^(?:\((\d+)\)|(\d+)\.)[ \t]*/gm)]
  if (!markers.length) return { content: text, sections: [] }

  const label = m => {
    const first = text.slice(m.index + m[0].length).split('\n')[0].trim()
    return first.split(':')[0].trim()
  }
  const looksLikeHeading = l => l.length > 0 && l.length <= 48 && !/[.;]$/.test(l)

  // Sections only when the Act headed EVERY top-level clause. A mixed run is a
  // numbered list, not a set of headed subdivisions: Article 9's clause (5)
  // opens "The board consists of the following members:", which is short enough
  // to look like a heading on its own but sits among five full sentences.
  const allHeaded = markers.every(m => looksLikeHeading(label(m)))
  if (!allHeaded) return { content: text, sections: [] }

  const body = text.slice(0, markers[0].index).trim()
  const sections = markers.map((m, i) => {
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length
    const lines = text.slice(m.index + m[0].length, end).split('\n')
    return {
      number: Number(m[1] ?? m[2]),
      title: lines[0].split(':')[0].trim(),
      content: dedent(lines.slice(1).join('\n')).trim()
    }
  })
  return { content: body, sections }
}

export function buildManifest () {
  const acts = loadActs(ROOT)
  const current = yaml.load(fs.readFileSync(path.join(ROOT, 'constitution/current.yaml'), 'utf8'), { schema: yaml.CORE_SCHEMA })
  const byId = new Map(current.articles.map(a => [a.id, a]))

  const entries = []
  for (const act of acts) {
    const actId = ACT_ID[path.basename(act.file)]
    for (const p of act.provisions) {
      const existing = p.target === 'preamble' ? current.preamble : byId.get(p.target)
      const structure = p.scope === 'article' ? deriveStructure(p.text) : null
      entries.push({
        act: actId,
        source: `${act.file}:${p.source_line}-${p.end_line}`,
        target: p.target,
        operation: p.operation,
        scope: p.scope,
        clauses: p.clauses ?? null,
        enacted_title: p.enacted_title ?? null,
        current_title: existing?.title ?? null,
        exists: !!existing,
        prescribed: dedent(p.text),
        structure
      })
    }
  }
  return entries
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (direct) {
  const entries = buildManifest()
  const json = process.argv.includes('--json')
  if (json) { console.log(JSON.stringify(entries, null, 2)); process.exit(0) }

  for (const e of entries) {
    const rename = e.enacted_title && e.current_title && e.enacted_title !== e.current_title
    console.log(`\n${e.act}  ${e.target}  ${e.operation}/${e.scope}${e.clauses ? ` cl=${e.clauses}` : ''}  ${e.exists ? '' : '(NEW)'}`)
    if (rename) console.log(`    TITLE: ${JSON.stringify(e.current_title)} -> ${JSON.stringify(e.enacted_title)}`)
    if (e.structure) {
      console.log(`    body: ${e.structure.content ? JSON.stringify(e.structure.content.slice(0, 64)) + '…' : '(none)'}`)
      for (const s of e.structure.sections) {
        console.log(`    s-${s.number}: ${JSON.stringify(s.title)}  ${s.content.length} chars`)
      }
      if (!e.structure.sections.length) console.log('    sections: none — the Act headed no clause')
    }
  }
  console.log(`\n${entries.length} provisions across ${new Set(entries.map(e => e.act)).size} Acts`)
}
