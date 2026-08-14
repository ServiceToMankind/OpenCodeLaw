/**
 * Text comparison for provenance analysis.
 *
 * Used to decide whether a provision in the constitution already carries an
 * Act's prescribed text, still carries the pre-Act text, or matches neither.
 *
 * ORDER IS LOAD-BEARING. Tags must be stripped before punctuation, and they
 * must be replaced with a space rather than removed. Stripping punctuation
 * first collapses `<br>` to the literal token `br`, which injects a word into
 * the middle of the string and produces a false NOT-APPLIED — the worst
 * failure mode available here, because acting on it would re-apply an
 * amendment already in force. See tests/text-compare.test.mjs.
 */

/** Replace every HTML tag with a space. Never with the empty string: `a<br>b` must not become `ab`. */
export function stripTags (s) {
  return String(s ?? '').replace(/<[^>]*>/g, ' ')
}

/** Fold the typographic variants the PDFs and the YAML spell differently. */
export function foldUnicode (s) {
  return s
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/…/g, '...')
}

/**
 * Remove enumerators. The Acts number clauses `(1)`, `(a)`; the YAML uses
 * `1.`, `- (a)`, or carries the number in a section title. None of that is
 * operative text, and leaving it in makes identical provisions look different.
 */
export function stripEnumerators (s) {
  return s
    .replace(/^[ \t]*[-*•][ \t]*/gm, ' ')        // markdown bullets
    .replace(/\(\s*[0-9]{1,3}\s*\)/g, ' ')            // (1) (12)
    .replace(/\(\s*[a-z]\s*\)/gi, ' ')                // (a) (b)
    .replace(/\(\s*[ivxl]{1,5}\s*\)/gi, ' ')          // (iv)
    .replace(/^[ \t]*[0-9]{1,3}[.)][ \t]+/gm, ' ')    // 1.  12)
    .replace(/^[ \t]*[a-z][.)][ \t]+/gim, ' ')        // a.  b)
}

/**
 * Canonical comparison form. Aggressive by design: it must see through
 * formatting, numbering and typography, because the same provision is spelled
 * one way in a PDF and another way in YAML.
 */
export function normalise (s) {
  return stripEnumerators(foldUnicode(stripTags(s)))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function tokens (s) {
  const n = normalise(s)
  return n ? n.split(' ') : []
}

/** Levenshtein distance over token sequences. */
function tokenDistance (a, b) {
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    prev = cur
  }
  return prev[b.length]
}

/** 1.0 = identical after normalisation, 0.0 = nothing in common. */
export function similarity (a, b) {
  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.length && !tb.length) return 1
  if (!ta.length || !tb.length) return 0
  return 1 - tokenDistance(ta, tb) / Math.max(ta.length, tb.length)
}

export const MATCH_THRESHOLD = 0.94

/**
 * Three-way verdict.
 *
 * `current` is the text in the constitution today, `enacted` is what the Act
 * prescribes, `prior` is the text as it stood before the Act (null where the
 * Act inserts a provision that did not previously exist).
 *
 * DIVERGENT means the text matches neither: someone edited the constitution
 * outside the amendment process. It is never resolved automatically.
 */
export function classify (current, enacted, prior) {
  const hasCurrent = normalise(current).length > 0
  const simEnacted = enacted == null ? 0 : similarity(current, enacted)
  const simPrior = prior == null ? (hasCurrent ? 0 : 1) : similarity(current, prior)

  let verdict
  if (!hasCurrent && prior == null) {
    verdict = 'NOT-APPLIED'                     // insertion that has not happened yet
  } else if (simEnacted >= MATCH_THRESHOLD && simEnacted >= simPrior) {
    verdict = 'ALREADY-APPLIED'
  } else if (simPrior >= MATCH_THRESHOLD && simPrior > simEnacted) {
    verdict = 'NOT-APPLIED'
  } else {
    verdict = 'DIVERGENT'
  }

  return { verdict, simEnacted, simPrior }
}
