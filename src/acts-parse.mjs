/**
 * Slices the extracted Act text into the provisions each Act enacts.
 *
 * Scope follows the rule the drafter already used, confirmed against all three
 * Acts: a heading naming clauses ("Amendment to Article 6, clause 1,2,3,4 and
 * 5") amends only those clauses; a heading naming only the article, followed by
 * the article's own restated heading and a complete clause run, substitutes the
 * whole article.
 */

import fs from 'node:fs'
import path from 'node:path'

/** Page furniture repeated on every page of every Act. Never operative text. */
const FURNITURE = [
  /^\s*Flat no:-.*$/gm,
  /^\s*Website:-.*$/gm,
  /^\s*Act No\.\s*:.*$/gm
]

const HEADING = /^\s*(\d+)\s*\.\s*(Amendment\s+(?:to|of)|Insertion\s+of\s+new)\s+(.*?):?\s*$/

export function parseAct (absPath) {
  // Form feeds mark PDF page breaks. They are not line terminators in JS
  // regexes, so a clause that happens to start a new page reads as
  // "\f      (6) ..." and never matches a `^[ \t]*\(` anchor — which silently
  // dropped Article 7 clause (6) from the analysis entirely.
  //
  // Stripped to nothing rather than to a newline: all 11 form feeds in the
  // corpus sit at a line start, so removing them fixes the anchor while
  // keeping line numbers identical to the file on disk. Inserting newlines
  // would shift every subsequent line, and `source_lines` in the act register
  // is an audit trail a human opens in an editor.
  let text = fs.readFileSync(absPath, 'utf8').replace(/\f/g, '')

  // The Statement of Objects and Reasons is explanatory, not enacting.
  const sor = text.search(/STATEMENT\s+OF\s+OBJECTS\s+AND\s+REASONS/i)
  const statement = sor >= 0 ? text.slice(sor) : ''
  if (sor >= 0) text = text.slice(0, sor)

  const lines = text.split('\n')
  const marks = []
  lines.forEach((line, i) => {
    const m = line.match(HEADING)
    if (m) marks.push({ line: i + 1, index: i, kind: m[2], subject: m[3].trim(), raw: line.trim() })
  })

  const provisions = []
  for (const [k, mark] of marks.entries()) {
    const end = k + 1 < marks.length ? marks[k + 1].index : lines.length
    let body = lines.slice(mark.index + 1, end).join('\n')
    for (const re of FURNITURE) body = body.replace(re, '')

    const subject = mark.subject
    const isPreamble = /^preamble/i.test(subject)
    const artNo = isPreamble ? null : Number(subject.match(/Article\s+(\d+)/i)?.[1])
    const clauseMatch = subject.match(/clause[s]?\s+([0-9,\s and]+)/i)
    const inserts = /^Insertion/i.test(mark.kind)

    const { text, restatedTitle } = cleanBody(body, artNo, isPreamble)

    provisions.push({
      order: mark.line,
      source_line: mark.line,
      end_line: end,
      raw_heading: mark.raw,
      target: isPreamble ? 'preamble' : `art-${artNo}`,
      article_number: artNo,
      operation: inserts ? 'insert' : 'substitute',
      scope: clauseMatch ? 'clause' : 'article',
      clauses: clauseMatch ? clauseMatch[1].replace(/\s+and\s+/g, ',').replace(/\s/g, '').replace(/,+/g, ',').replace(/,$/, '') : null,
      // Title the Act gives the provision: from the heading ("- Exit Process")
      // or from the article heading the Act restates above its clauses.
      enacted_title: subject.match(/-\s*(.+)$/)?.[1]?.trim() ?? restatedTitle,
      text
    })
  }

  return { provisions, statement: statement.replace(/\n{3,}/g, '\n\n').trim() }
}

/**
 * Drops the article heading the Act restates ("9. Board Members") so the body
 * compares against the constitution's `content`, which does not repeat its own
 * title. Collapses the hard line wrapping the PDF layout introduces.
 */
export function cleanBody (body, articleNumber, isPreamble = false) {
  // PDF extraction leaves the odd punctuation-only line; it is never operative.
  const lines = body.split('\n')
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => !/^\s*[.,;:]\s*$/.test(l))

  let restatedTitle = null
  const firstIdx = lines.findIndex(l => l.trim())

  if (firstIdx >= 0) {
    const first = lines[firstIdx].trim()
    if (isPreamble && /^preamble$/i.test(first)) {
      restatedTitle = first
      lines.splice(firstIdx, 1)
    } else if (articleNumber != null) {
      // Only the article's OWN number counts. Matching any "N." would eat
      // clause 1 of an Act that numbers its clauses `1.` instead of `(1)`,
      // which silently deleted the first clause of Articles 20 and 21.
      const m = first.match(new RegExp(`^${articleNumber}\\s*\\.\\s*(.+)$`))
      if (m && m[1].length <= 60 && !/\.$/.test(m[1].trim())) {
        restatedTitle = m[1].trim()
        lines.splice(firstIdx, 1)
      }
    }
  }

  return {
    text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    restatedTitle
  }
}

export function loadActs (root) {
  const dir = path.join(root, 'acts/text')
  return fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort().map(f => ({
    file: `acts/text/${f}`,
    ...parseAct(path.join(dir, f))
  }))
}
