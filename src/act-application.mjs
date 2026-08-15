/**
 * How each Act's prescribed text maps onto the constitution's structure.
 *
 * Declared explicitly, by line range into the dedented Act span. Two reasons it
 * is not inferred:
 *
 *  - PDF layout indentation is not a structural signal. Inferring from it read
 *    Article 9's sentences as section titles, collapsed Article 10's three
 *    clauses into one, and found none of Article 8's five — in both directions,
 *    from the same heuristic.
 *  - Provision text is never retyped here. Every string is a slice of
 *    `acts/text/`, and `verifyCoverage` asserts the slices reconstruct the
 *    whole span, so no text can be dropped, duplicated or invented.
 *
 * Line numbers refer to the dedented span, as printed by `node src/manifest.mjs`.
 */

import { normalise } from './text-compare.mjs'
import { dedent } from './manifest.mjs'

/**
 * `body`      — inclusive [from, to] line range for the article's own text
 * `sections`  — each with the line range of its text; `titleLine` is the line
 *               carrying the Act's clause marker and heading
 */
export const STRUCTURE = {
  // --- Act 2 -------------------------------------------------------------
  preamble: { body: [0, 3], sections: [] },
  'art-3': { body: [0, 1], sections: [] },
  'art-4': { body: [0, 1], sections: [] },
  'art-5': { body: [0, 1], sections: [] },

  'art-8': {
    body: [0, 2],
    sections: [
      { number: 1, titleLine: 3, title: 'Stipend', body: [4, 5] },
      { number: 2, titleLine: 6, title: 'Duration', body: [7, 7] },
      { number: 3, titleLine: 8, title: 'Eligibility', body: [9, 10] },
      { number: 4, titleLine: 12, title: 'Selection Process', body: [13, 16] },
      { number: 5, titleLine: 17, title: 'Roles and Responsibilities', body: [18, 20] }
    ]
  },

  // Act 2 restructures Article 14: one clause, headed. Sabbatical Leave stops
  // being the article and becomes clause (1) of "Leaves".
  'art-14': {
    body: null,
    sections: [
      { number: 1, titleLine: 0, title: 'Sabbatical Leave', body: [1, 3] }
    ]
  },

  // Act 2 restructures Article 15 from three sections to two. The section ids
  // survive but change meaning; recorded in RECONCILIATION.md.
  'art-15': {
    body: null,
    sections: [
      { number: 1, titleLine: 0, title: 'Voluntary', body: [1, 2] },
      { number: 2, titleLine: 3, title: 'Involuntary', body: [4, 4] }
    ]
  },

  'art-20': { body: [0, 3], sections: [] },

  // --- Act 3 -------------------------------------------------------------
  'art-13': { body: [0, 9], sections: [] },
  'art-21': { body: [0, 11], sections: [] }
}

const slice = (lines, range) =>
  range ? dedent(lines.slice(range[0], range[1] + 1).join('\n')).trim() : null

/** Apply a declared structure to an Act span. Returns { content, sections }. */
export function shape (target, actText) {
  const decl = STRUCTURE[target]
  if (!decl) throw new Error(`no declared structure for ${target}`)
  const lines = dedent(actText).split('\n')
  return {
    content: slice(lines, decl.body),
    sections: decl.sections.map(s => ({
      number: s.number,
      title: s.title,
      content: slice(lines, s.body)
    }))
  }
}

/**
 * Every word of the Act span must land somewhere, exactly once.
 *
 * Compares the reconstructed provision against the whole span under the
 * normaliser, which folds enumerators and punctuation — so a clause marker
 * consumed as a heading still matches. A dropped line, a duplicated one or an
 * invented phrase all fail here.
 */
export function verifyCoverage (target, actText) {
  const { content, sections } = shape(target, actText)
  const rebuilt = [content ?? '', ...sections.flatMap(s => [s.title, s.content])].join('\n')
  const a = normalise(rebuilt)
  const b = normalise(actText)
  return { ok: a === b, rebuilt: a, span: b }
}
