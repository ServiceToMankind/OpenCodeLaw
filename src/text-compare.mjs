/**
 * Two comparators, because "is this the same text?" is two different questions.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FORENSIC — one side came out of a PDF.
 *
 * `normalise` and everything built on it fold whitespace, case, typography and
 * enumerator formatting, because the same provision is spelled one way in a
 * scanned Act and another way in YAML. Against extraction noise that tolerance
 * is not a compromise, it is the whole job.
 *
 * ORDER IS LOAD-BEARING here. Tags must be stripped before punctuation, and
 * they must be replaced with a space rather than removed. Stripping punctuation
 * first collapses `<br>` to the literal token `br`, which injects a word into
 * the middle of the string and produces a false NOT-APPLIED — the worst failure
 * mode available, because acting on it would re-apply an amendment already in
 * force. See tests/text-compare.test.mjs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OPERATIVE — both sides are canonical YAML strings.
 *
 * `operativeEqual` is exact. Nothing here is noise: the stored string IS the
 * source of truth. A renumbered clause is an amendment, `units` → `Units` is a
 * retitle, and folding either away means an Act that changes them classifies as
 * already applied, writes nothing, reports success and bumps the version.
 *
 * That was not hypothetical. The forensic fold was promoted into
 * `classifyOperation`, the apply loop and the self-audit — and because the
 * audit folded with the thing it audited, it was structurally blind to
 * everything the fold removed.
 *
 * The one tolerance kept is the trailing newline, and only because YAML
 * genuinely cannot represent that distinction: a `|` block always round-trips
 * with exactly one. Every other "cosmetic equivalence" is an undecidable swamp
 * this project does not enter.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { blockText } from './scripts/bill-serialise.mjs'

/**
 * Operative equality: exact, after the one normalisation YAML forces on us.
 *
 * Case-sensitive. Enumerators significant. Punctuation significant. Tags
 * significant.
 */
export const operativeEqual = (a, b) => blockText(a) === blockText(b)

/** Forensic equality: the tolerant fold. Only where one side came from a PDF. */
export const forensicEqual = (a, b) => normalise(a) === normalise(b)

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

/**
 * How well `needle` appears somewhere inside `haystack`.
 *
 * Used for clause-scope amendments, where an Act replaces clause (4) of an
 * article whose current text is one undivided block. Slicing the constitution
 * into clauses to compare like with like would mean guessing where a clause
 * begins; sliding the Act's clause over the article instead requires no guess.
 */
export function containment (needle, haystack) {
  const n = tokens(needle)
  const h = tokens(haystack)
  if (!n.length) return 1
  if (!h.length) return 0
  if (h.length <= n.length) return similarity(needle, haystack)

  let best = 0
  const width = n.length
  // Stride must be fine enough to land on the true alignment. At width/8 the
  // window straddled the clause boundary and scored five exact-match Article 6
  // clauses at 90-94%, which reads in PROVENANCE.md as unexplained drift.
  // Token-by-token wherever the haystack is small enough to afford it.
  const stride = h.length <= 4000 ? 1 : Math.max(1, Math.floor(width / 16))
  for (let start = 0; start + 1 <= h.length; start += stride) {
    for (const w of [Math.round(width * 0.85), width, Math.round(width * 1.2)]) {
      const window = h.slice(start, start + w)
      if (!window.length) continue
      const score = 1 - tokenDistance(n, window) / Math.max(n.length, window.length)
      if (score > best) best = score
      if (best === 1) return 1
    }
  }
  return best
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
