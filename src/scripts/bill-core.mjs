/**
 * The bill rules that both the CLI and the browser need.
 *
 * Nothing here touches the filesystem, ajv, or node:crypto — so the same file
 * runs in Node and is served to the pages, for the same reason bill-serialise
 * is: a second implementation of `classifyOperation` or of the Article 16(3)
 * arithmetic would be free to drift, and the drift would not surface until a
 * meeting had already voted.
 *
 * `src/bill.mjs` re-exports every symbol below, so Node-side callers are
 * unaffected by where these live.
 *
 * What is NOT here, deliberately:
 *   - the substantive hash, because hashing is sha256 and the two runtimes
 *     spell that differently (node:crypto, synchronous; SubtleCrypto, async).
 *     The SUBJECT of the hash is shared — see bill-serialise.mjs — and that is
 *     the part that could drift. A digest cannot.
 *   - schema validation, which is the compiled ajv validator on both sides:
 *     one schema, one compiler, two build targets.
 */
import { normalise } from '../text-compare.mjs'

/** The three bodies Article 16(3) names. All are required; none is inferred. */
export const REQUIRED_BODIES = ['board', 'intermediate-board', 'units']

/**
 * Article 16(3) requires "2/3rd present and voting of the board, the
 * intermediate board and units of the NGO collectively".
 *
 * "Collectively" bears two readings: a pooled vote of all three sitting
 * together, or 2/3 within each body. Until the board adopts one by resolution,
 * enactment requires the STRICTER reading — 2/3 in each body separately — and
 * both tallies are recorded, so an Act cannot later be challenged under
 * whichever reading is adopted.
 *
 * Abstentions are excluded from the denominator: the text says present AND
 * VOTING.
 */
export const THRESHOLD = 2 / 3

/** What each removing operation leaves behind on the provision it acts on. */
export const OPERATION_STATUS = Object.freeze({ omit: 'omitted', reserve: 'reserved' })

/** id → { node, kind, parent }, for every provision a bill can target. */
export function provisionIndex (doc) {
  const m = new Map()
  if (doc?.preamble) m.set(doc.preamble.id, { node: doc.preamble, kind: 'preamble' })
  for (const a of doc?.articles ?? []) {
    m.set(a.id, { node: a, kind: 'article' })
    for (const s of a.sections ?? []) m.set(s.id, { node: s, kind: 'section', parent: a })
  }
  return m
}

/** Everything a reader sees under a provision, for the three-way comparison. */
export const fullText = node => node
  ? [node.content ?? '', ...(node.sections ?? []).flatMap(s => [s.title ?? '', s.content ?? ''])].join('\n').trim()
  : ''

/** The text an operation results in, in the same shape as fullText. */
export const operationText = op =>
  [op.text ?? '', ...(op.sections ?? []).flatMap(s => [s.title ?? '', s.text ?? ''])].join('\n').trim()

/**
 * The three-way check that makes application idempotent.
 *
 *   current == proposed  → already applied, safe no-op
 *   current == base      → apply
 *   neither              → divergence, abort
 *
 * Re-running an applied Act cannot corrupt anything, which is the defect that
 * made re-running Act 1 of 2024 unsafe: its clause edits were line splices into
 * text that no longer existed after the first run.
 *
 * The propose page calls this with a baseText for the version the proposer
 * drafted against, which is what turns "the constitution moved" into three
 * distinct outcomes instead of one blanket refusal.
 */
export function classifyOperation (op, currentNode, baseText = null) {
  const proposed = normalise(operationText(op))
  const current = normalise(fullText(currentNode))

  if (op.operation === 'insert') {
    // Absent: insert it. Present and already reading as the Act prescribes:
    // this Act has been applied, and re-running it must be a no-op like every
    // other operation. Present and reading as something else: another
    // provision occupies that number, and inserting would overwrite it.
    if (!currentNode) return 'apply'
    return current === proposed ? 'already-applied' : 'divergent'
  }
  if (['omit', 'reserve'].includes(op.operation)) {
    // The provision is not deleted — its number is never reused, so the entry
    // remains carrying a status. "Already applied" is that status being set,
    // not the node being gone.
    if (!currentNode) return 'already-applied'
    // The operation is `omit`; the status it leaves behind is `omitted`.
    // Comparing the two directly made re-applying an omission look like work
    // forever — and the lifecycle test agreed, because it wrote the same wrong
    // status the check expected. Both sides now name the mapping once.
    return currentNode.status === OPERATION_STATUS[op.operation] ? 'already-applied' : 'apply'
  }
  if (op.operation === 'retitle') {
    return normalise(currentNode?.title ?? '') === normalise(op.title) ? 'already-applied' : 'apply'
  }
  if (current === proposed) return 'already-applied'
  if (baseText != null && current === normalise(baseText)) return 'apply'
  if (baseText == null) return 'apply'
  return 'divergent'
}

// ---------------------------------------------------------------------------
// Article 16(3)
// ---------------------------------------------------------------------------

export function tally (approvals = []) {
  const perBody = REQUIRED_BODIES.map(body => {
    const a = approvals.find(x => x.body === body)
    const forVotes = a?.for ?? null
    const against = a?.against ?? null
    const voting = forVotes == null || against == null ? null : forVotes + against
    const ratio = voting ? forVotes / voting : null
    return {
      body,
      recorded: !!a,
      date: a?.date ?? null,
      present: a?.present ?? null,
      for: forVotes,
      against,
      abstain: a?.abstain ?? null,
      voting,
      ratio,
      passes: ratio != null && ratio >= THRESHOLD,
      evidence: a?.evidence ?? null,
      billSha256: a?.bill_sha256 ?? null,
      meeting: a?.meeting ?? null
    }
  })

  const complete = perBody.every(b => b.recorded && b.voting != null)
  const pooledFor = perBody.reduce((n, b) => n + (b.for ?? 0), 0)
  const pooledVoting = perBody.reduce((n, b) => n + (b.voting ?? 0), 0)
  const pooledRatio = pooledVoting ? pooledFor / pooledVoting : null

  return {
    perBody,
    complete,
    pooled: { for: pooledFor, voting: pooledVoting, ratio: pooledRatio, passes: pooledRatio != null && pooledRatio >= THRESHOLD },
    // The stricter reading governs.
    passes: complete && perBody.every(b => b.passes),
    missingBodies: perBody.filter(b => !b.recorded).map(b => b.body),
    missingEvidence: perBody.filter(b => b.recorded && !b.evidence?.path).map(b => b.body),
    failedBodies: perBody.filter(b => b.recorded && b.voting != null && !b.passes).map(b => b.body)
  }
}

// ---------------------------------------------------------------------------

/**
 * What the bill would change, per operation, with before and after.
 * This is what an approval meeting reads.
 *
 * Takes the constitution document or an index of it, so the pages — which hold
 * the document as JSON rather than YAML — build the same manifest the CLI
 * prints rather than a lookalike.
 */
export function buildBillManifest (bill, docOrIndex) {
  const provisions = docOrIndex instanceof Map ? docOrIndex : provisionIndex(docOrIndex)
  return (bill.operations ?? []).map(op => {
    const existing = provisions.get(op.target)
    const before = existing ? fullText(existing.node) : null
    const after = ['omit', 'reserve'].includes(op.operation) ? null : operationText(op)
    return {
      id: op.id,
      operation: op.operation,
      target: op.target,
      scope: op.scope,
      exists: !!existing,
      title_before: existing?.node.title ?? null,
      title_after: op.title ?? existing?.node.title ?? null,
      before,
      after,
      unchanged: before != null && after != null && normalise(before) === normalise(after)
    }
  })
}

/**
 * The sentence a meeting reads into its minutes.
 *
 * The hash is passed in rather than computed, because the two runtimes compute
 * a digest differently and this sentence must be one string in one place: it is
 * read aloud, and it is what a vote binds to.
 */
export function resolutionSentenceFor (bill, hash) {
  const b = bill.bill
  const name = b.number ? `Bill ${b.number} of ${b.year}` : `the draft bill "${b.short_title}"`
  return `This meeting resolves on ${name}, substantive hash ${hash}.`
}
