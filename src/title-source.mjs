/**
 * Classifies every provision title as `enacted` or `editorial`.
 *
 * A reader of a constitution is entitled to know which headings carry legal
 * force. Act 1 titles Article 11's clause (2) `Establishment`; it gives clause
 * (1) no title at all, and the lowercase `units` currently above it is
 * something an editor typed. Both render at the same weight today.
 *
 * Two rules, both narrower than "the title appears in the Act text":
 *
 *  1. Only an Act ALREADY APPLIED to that provision can enact its title.
 *     Crediting an unapplied Act would claim legal force for a heading that
 *     is not yet in effect — Act 2 retitles Article 14 to `Leaves`, but Act 2
 *     has not been applied, so `Sabbatical Leave` remains editorial.
 *
 *  2. The title must appear as a HEADING, not anywhere in the prose. A
 *     substring test marks Article 11's `units` as enacted, because the Act's
 *     clause (1) happens to open "The units of the NGO…", and marks Article
 *     15's `Resignation` as enacted off the phrase "the resignation letter".
 *
 * Anything unverifiable is `editorial`. Never guess.
 */
import { normalise } from './text-compare.mjs'

/** Clause headings an Act states: the text between `(N)` and the first break. */
export function clauseHeadings (text) {
  const marks = [...String(text ?? '').matchAll(/^[ \t]*\((\d+)\)/gm)]
  return marks.map((m, i) => {
    const body = text.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : undefined)
    const first = body.split('\n')[0].replace(/^[ \t]*\(\d+\)[ \t]*/, '').trim()
    // A heading is a short label, optionally followed by a colon. Anything that
    // runs on into a sentence is prose, not a heading.
    const label = first.split(':')[0].trim()
    return { number: Number(m[1]), label, isHeading: label.length > 0 && label.length <= 48 && !/[.]$/.test(label) }
  })
}

/**
 * @param doc      the constitution
 * @param actSpans map of provision id -> Act provisions targeting it
 * @param applied  set of act ids whose text is actually in force in this doc
 */
export function classifyTitles (doc, actSpans, applied) {
  const out = new Map()
  const eq = (a, b) => normalise(a) === normalise(b) && normalise(a).length > 0

  for (const art of doc.articles ?? []) {
    // Only Acts this article records as having amended it.
    const spans = (actSpans[art.id] ?? []).filter(p => applied.has(p.actId))

    const artEnacted = spans.some(p => p.enacted_title && eq(p.enacted_title, art.title))
    out.set(art.id, artEnacted ? 'enacted' : 'editorial')

    for (const sec of art.sections ?? []) {
      const secEnacted = spans.some(p =>
        clauseHeadings(p.text).some(h => h.isHeading && eq(h.label, sec.title)))
      out.set(sec.id, secEnacted ? 'enacted' : 'editorial')
    }
  }
  return out
}
