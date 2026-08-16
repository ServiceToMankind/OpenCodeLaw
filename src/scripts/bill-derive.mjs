/**
 * Deriving a bill's operations from an edited copy of the constitution.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE REFRAME
 *
 *   The proposer edits the law. The machine writes the bill.
 *
 * Phase 8's page asked an author to describe a change: pick an operation, pick
 * a target, fill a text box. That surface assumed the author knew what an
 * "operation" was. This one does not exist: the author opens a copy of the
 * constitution, changes the words they want changed, and the operations are
 * DERIVED by comparing their copy against the original.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nothing behind the surface moved. The bill YAML is still the source of truth,
 * the substantive hash is still computed the same way, and every operation
 * still carries the COMPLETE resulting text of its target — which here is true
 * by construction twice over: the text is literally what is in the editor's
 * box, and a diff was never taken.
 *
 * Two rules in this file are not style. Both exist because
 * `classifyOperation` compares `fullText(node)` with `operationText(op)`:
 *
 *  1. A substitute on an article that has clauses carries EVERY clause, and an
 *     article left with none says `sections: []`. An operation that names no
 *     clauses can never compare equal to the provision it produced — it would
 *     classify as `apply` forever, and once a base text is in play, as
 *     `divergent`. The schema once described that form as leaving the clauses
 *     "untouched"; it is now a validator error (`incomplete-substitution`),
 *     because a format that permits a bill which can never verify as applied is
 *     a format defect. This rule therefore no longer protects only bills the
 *     editor built.
 *
 *  2. An edit confined to one clause targets THAT CLAUSE, not its article.
 *     A clause has no subdivisions, so its text compares exactly, and the
 *     before/after a meeting reads is the clause rather than six of them.
 *
 * Renumbering and reordering have no representation here at all. There is no
 * function that could emit one — which is a stronger guarantee than a rejected
 * input, because there is nothing to reject.
 */
import {
  classifyOperation, fullText, operationText, provisionIndex, applyOperation, OPERATION_STATUS
} from './bill-core.mjs'
import { blockText } from './bill-serialise.mjs'

/** Provisions that hold no text: their number is kept, deliberately empty. */
const EMPTIED = new Set(['omitted', 'reserved'])

const clone = v => (typeof structuredClone === 'function'
  ? structuredClone(v)
  : JSON.parse(JSON.stringify(v)))

/**
 * The working copy the editor edits.
 *
 * Shaped exactly like the constitution document, so `fullText`, `provisionIndex`
 * and `buildBillManifest` read it without translation. A translation layer
 * between what the editor holds and what the rules read is precisely where a
 * second interpretation of "the text of a provision" would grow.
 */
export function modelFromDoc (doc) {
  return {
    version: doc.info?.version ?? doc.version ?? null,
    preamble: clone(doc.preamble),
    articles: (doc.articles ?? []).map(a => clone(a))
  }
}

export const isEmptied = node => EMPTIED.has(node?.status)

/** The next free article number. Assigned, never chosen. */
export function nextArticleNumber (model) {
  const numbers = (model.articles ?? []).map(a => Number(a.number)).filter(Number.isFinite)
  return (numbers.length ? Math.max(...numbers) : 0) + 1
}

/** Numbers held deliberately empty, which an insertion may occupy instead. */
export function reservedNumbers (model) {
  return (model.articles ?? []).filter(a => a.status === 'reserved').map(a => a.number)
}

/** The next free clause number within an article. Also assigned, never chosen. */
export function nextClauseNumber (article) {
  const numbers = (article.sections ?? []).map(s => Number(s.number)).filter(Number.isFinite)
  return (numbers.length ? Math.max(...numbers) : 0) + 1
}

// ---------------------------------------------------------------------------
// Editing the model
//
// Every mutation the editor can perform is a function here, so the set of
// possible edits is a list one can read, and `renumber` is not on it.
// ---------------------------------------------------------------------------

export function addArticle (model, { number = null, title = '', text = '' } = {}) {
  const n = number ?? nextArticleNumber(model)
  const existing = model.articles.find(a => Number(a.number) === Number(n))
  // A reserved number is the one slot an insertion may occupy: the number was
  // held open for exactly this. Anything else would overwrite a provision.
  if (existing && existing.status !== 'reserved') {
    throw new Error(`Article ${n} already exists.`)
  }
  const node = {
    id: `art-${n}`,
    number: Number(n),
    title,
    title_source: 'enacted',
    content: text,
    sections: [],
    added: true
  }
  if (existing) model.articles.splice(model.articles.indexOf(existing), 1, node)
  else model.articles.push(node)
  model.articles.sort((a, b) => a.number - b.number)
  return node
}

export function addClause (article, { title = '', text = '' } = {}) {
  const n = nextClauseNumber(article)
  const node = { id: `${article.id}-s-${n}`, number: n, title, title_source: 'enacted', content: text }
  article.sections ??= []
  article.sections.push(node)
  article.sections.sort((a, b) => a.number - b.number)
  return node
}

/**
 * Removal marks; it never splices.
 *
 * An article's number is a permanent citation handle. Every Act, every minute
 * and every shared link points at it, so a removed provision keeps its number
 * and the articles after it do not move.
 *
 * It is expressed exactly as the APPLIER expresses it — a status on the node —
 * rather than in a private vocabulary. A `removed` flag here and a status there
 * meant a carried-over omission arrived on rebase as a flag nothing read, and
 * the proposer was told their change survived while the generated bill dropped
 * it.
 */
export function removeArticle (article, reason = '') {
  article.status = OPERATION_STATUS.omit
  if (reason) article.note = reason
  else delete article.note
  return article
}

export function restoreArticle (article) {
  delete article.status
  delete article.note
  return article
}

/**
 * Removing a clause marks it too. A clause's number is an anchor like any
 * other: `art-6-s-2` appears in minutes and in links, and dropping it from the
 * list would destroy that citation silently.
 */
export function removeClause (article, clause, reason = '') {
  clause.status = OPERATION_STATUS.omit
  if (reason) clause.note = reason
  else delete clause.note
  return article
}

export function restoreClause (article, clause) {
  delete clause.status
  delete clause.note
  return clause
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

const changed = (a, b) => blockText(a) !== blockText(b)
const titleChanged = (a, b) => String(a ?? '') !== String(b ?? '')

/**
 * Every clause of a provision, as it will stand — the OMISSION ACCOUNTING.
 *
 * A clause that is going is carried as a tombstone, not dropped. Silence over a
 * clause used to mean deletion: its node vanished, its number was free to be
 * reused, and `art-6-s-2` in somebody's minutes stopped resolving with nothing
 * in the document to say it ever had. A meeting must be able to read exactly
 * what dies, so the operation says it.
 */
const sectionsOf = node => (node.sections ?? []).map(s => isEmptied(s)
  ? { number: Number(s.number), title: String(s.title ?? 'Omitted'), status: OPERATION_STATUS.omit, ...(s.note ? { note: s.note } : {}) }
  : { number: Number(s.number), title: String(s.title ?? ''), text: blockText(s.content) })

/**
 * Have clauses been ADDED?
 *
 * Not "has one been marked as going" — a clause that is going is a finding of
 * its own, targeting that clause, so a meeting reads one clause and not six.
 * The tombstone is carried in `sections` only when the article is being
 * restated anyway.
 */
function clauseSetChanged (baseNode, node) {
  const key = n => (n.sections ?? []).map(s => Number(s.number)).join(',')
  return key(baseNode) !== key(node)
}

/**
 * The edited model, expressed as bill operations, in document order.
 *
 * Operation ids are positional and therefore deterministic: the same edits
 * always derive the same bill, so the substantive hash is stable across a
 * reload and a restored autosave. A random or time-based id would move the hash
 * without anything having been proposed differently.
 */
export function deriveOperations (baseDoc, model) {
  const base = provisionIndex(baseDoc)
  const ops = []
  const add = op => { ops.push({ ...op, id: `op-${ops.length + 1}` }) }

  /** Returns what it emitted: 'substitute' subsumes clauses, 'retitle' does not. */
  const emit = (node, baseNode, scope) => {
    const textMoved = changed(baseNode.content, node.content)
    const headingMoved = titleChanged(baseNode.title, node.title)
    const structural = scope === 'article' && clauseSetChanged(baseNode, node)
    const carriesClauses = scope === 'article' &&
      ((node.sections ?? []).length > 0 || (baseNode.sections ?? []).length > 0)

    if (textMoved || structural) {
      add({
        operation: 'substitute',
        target: node.id,
        scope,
        ...(headingMoved ? { title: node.title } : {}),
        text: blockText(node.content),
        ...(carriesClauses ? { sections: sectionsOf(node) } : {})
      })
      return 'substitute'
    }
    if (headingMoved) {
      add({ operation: 'retitle', target: node.id, scope, title: node.title })
      return 'retitle'
    }
    return null
  }

  if (model.preamble && base.has(model.preamble.id)) {
    emit(model.preamble, base.get(model.preamble.id).node, 'article')
  }

  for (const article of model.articles ?? []) {
    const entry = base.get(article.id)

    // A number that did not exist is an insertion. A number that DID exist —
    // one held reserved, or omitted by an earlier Act — is not: reviving a
    // provision is stating its text, which is a substitution. Deriving an
    // insert for it produced a bill the validator refused outright
    // (`insert-exists`), from a button the editor itself offered.
    if (!entry) {
      const clauses = sectionsOf(article)
      add({
        operation: 'insert',
        target: article.id,
        scope: 'article',
        title: article.title,
        text: blockText(article.content),
        ...(clauses.length ? { sections: clauses } : {})
      })
      continue
    }

    const baseNode = entry.node
    const wasEmptied = isEmptied(baseNode)
    const nowEmptied = isEmptied(article)

    if (nowEmptied) {
      // Already a tombstone before this proposal touched it: nothing to say.
      if (wasEmptied && baseNode.status === article.status) continue
      add({
        operation: article.status === OPERATION_STATUS.reserve ? 'reserve' : 'omit',
        target: article.id,
        scope: 'article',
        ...(String(article.note ?? '').trim() ? { note: article.note.trim() } : {})
      })
      continue
    }

    // An article-scope substitution restates the whole provision, clauses
    // included, so per-clause operations on it would duplicate what it carries.
    // A RETITLE does not: a heading change and a clause change are independent
    // findings on the same node, and treating the heading as the end of the
    // matter silently discarded every clause edit under it.
    if (emit(article, baseNode, 'article') === 'substitute') continue

    for (const clause of article.sections ?? []) {
      const bc = base.get(clause.id)
      if (!bc) continue
      if (isEmptied(clause) && !isEmptied(bc.node)) {
        add({
          operation: 'omit',
          target: clause.id,
          scope: 'clause',
          ...(String(clause.note ?? '').trim() ? { note: clause.note.trim() } : {})
        })
        continue
      }
      if (isEmptied(clause)) continue
      emit(clause, bc.node, 'clause')
    }
  }

  return ops
}

/**
 * Problems that would make the derived bill invalid, in the proposer's words.
 *
 * The compiled schema catches these too — this exists so the message names the
 * provision on screen rather than a JSON pointer.
 */
export function reviewProblems (model, ops, meta = {}) {
  const out = []
  if (!String(meta.name ?? '').trim()) {
    out.push('Add your name. A bill records who moved it, permanently, from the moment it is drafted.')
  }
  if (!String(meta.short_title ?? '').trim()) {
    out.push('Give your proposal a short title — how the Act would be named.')
  }
  if (!String(meta.objects_and_reasons ?? '').trim()) {
    out.push('Explain your changes in plain words. That explanation is printed at the end of the Act.')
  }
  if (!ops.length) out.push('Nothing has been changed yet.')

  const label = id => {
    if (id === 'preamble') return 'The preamble'
    const art = (model.articles ?? []).find(a => a.id === id || (a.sections ?? []).some(s => s.id === id))
    if (!art) return id
    if (art.id === id) return `Article ${art.number}`
    return `Article ${art.number}, clause (${art.sections.find(s => s.id === id).number})`
  }

  for (const op of ops) {
    if (op.operation === 'omit' && !String(op.note ?? '').trim()) {
      out.push(`${label(op.target)}: say why it is being removed.`)
    }
    for (const s2 of op.sections ?? []) {
      if (s2.status === OPERATION_STATUS.omit && !String(s2.note ?? '').trim()) {
        out.push(`${label(op.target)}, clause (${s2.number}): say why it is being removed.`)
      }
    }
    if (op.operation === 'insert' && !String(op.title ?? '').trim()) {
      out.push(`${label(op.target)}: a new article needs a heading.`)
    }
    if (['insert', 'substitute'].includes(op.operation) &&
        !blockText(op.text) && !(op.sections ?? []).length) {
      out.push(`${label(op.target)}: it cannot be left empty. To take a provision out, remove it.`)
    }
    for (const s of op.sections ?? []) {
      if (s.status === OPERATION_STATUS.omit) continue
      // The schema requires both, and an untitled or empty clause is a drafting
      // mistake rather than a position anyone means to take.
      if (!s.title.trim()) out.push(`${label(op.target)}, clause (${s.number}): give the clause a heading.`)
      if (!blockText(s.text)) out.push(`${label(op.target)}, clause (${s.number}): it cannot be left empty.`)
    }
  }
  return out
}

/**
 * A complete draft bill.
 *
 * Status, number and every clerking field are fixed here rather than offered:
 * this surface produces drafts, and the exclusion list in bill-serialise.mjs is
 * the same boundary written down where the emitter can be tested against it.
 */
export function buildDraft ({ baseDoc, model, meta = {}, today, year }) {
  const stamp = today ?? new Date().toISOString().slice(0, 10)
  const operations = deriveOperations(baseDoc, model)
  return {
    opencodelaw_bill: '1.0',
    bill: {
      short_title: String(meta.short_title ?? '').trim() || 'An Act to …',
      ...(String(meta.also_known_as ?? '').trim() ? { also_known_as: meta.also_known_as.trim() } : {}),
      year: year ?? Number(stamp.slice(0, 4)),
      number: null,
      type: meta.type === 'corrigendum' ? 'corrigendum' : 'amendment',
      moved_by: {
        name: String(meta.name ?? '').trim(),
        ...(String(meta.role ?? '').trim() ? { role: meta.role.trim() } : {}),
        // Recorded, because the page says it is. Phase 8's form collected a
        // membership ID under the words "recorded so the ICC can check its
        // register — that is its whole function", and then dropped it: there
        // was no field for it and nothing noticed. A surface that asks for
        // something must carry it.
        ...(String(meta.membership_id ?? '').trim() ? { membership_id: meta.membership_id.trim() } : {}),
        ...(String(meta.contact ?? '').trim() ? { contact: meta.contact.trim() } : {})
      },
      drafted: stamp,
      base_version: baseDoc.info?.version ?? baseDoc.version,
      version_bump: 'minor'
    },
    status: 'draft',
    history: [],
    // Block-scalar form: a YAML `|` block always round-trips with exactly one
    // trailing newline, so the object hashed here must carry it too. Otherwise
    // the hash the page shows and the hash the CLI computes from the downloaded
    // file disagree, and a meeting resolves on a number that does not match the
    // file it is voting on.
    objects_and_reasons: blockText(meta.objects_and_reasons || '(none given)'),
    operations,
    approvals: ['board', 'intermediate-board', 'units'].map(body => ({
      body, meeting: { date: null }, present: null, for: null, against: null, abstain: null, bill_sha256: null
    })),
    enactment: {
      act_number: null, act_year: null, assent_date: null, assented_by: null,
      signed_by: null, signed_pdf: null, signed_pdf_sha256: null
    }
  }
}

// ---------------------------------------------------------------------------
// The rebase
// ---------------------------------------------------------------------------

/**
 * Replay an uploaded file's operations onto the CURRENT constitution.
 *
 * The page never re-opens a proposer's old text as-is. It loads what the
 * constitution says today and asks, of each operation, one of three questions —
 * the same three `classifyOperation` asks the applier:
 *
 *   already-applied  the target now reads as the proposer's text. Somebody
 *                    else's Act carried this change while the draft sat. Drop
 *                    the operation and say so.
 *   apply            the target reads as it did when they drafted. Their edit
 *                    carries over unchanged.
 *   divergent        the target reads as neither. Their edit is parked; they
 *                    re-make it against the words that are there now.
 *
 * Telling `apply` from `divergent` needs the text as it stood at the file's
 * `base_version`. When that snapshot is not published, every operation that is
 * not already-applied becomes a conflict — because "this probably still fits"
 * is not something a tool may decide on someone's behalf about a constitution.
 */
export function rebasePlan (bill, currentDoc, baseDoc = null) {
  const current = provisionIndex(currentDoc)
  const base = baseDoc ? provisionIndex(baseDoc) : null
  const baseVersion = bill?.bill?.base_version ?? null
  const currentVersion = currentDoc.info?.version ?? currentDoc.version ?? null
  const moved = baseVersion !== currentVersion

  const carried = []
  const dropped = []
  const conflicts = []

  for (const op of bill?.operations ?? []) {
    const node = current.get(op.target)?.node ?? null
    // Unmoved constitution: the text is its own base, so nothing can diverge.
    const baseText = !moved
      ? fullText(node)
      : base
        ? (base.get(op.target) ? fullText(base.get(op.target).node) : null)
        : null

    const verdict = classifyOperation(op, node, baseText)
    if (verdict === 'already-applied') {
      dropped.push({ op, reason: 'enacted', current: fullText(node) })
      continue
    }

    // `classifyOperation` answers `apply` when it is given no base text,
    // because that is right for the applier: an enacted Act is applied to the
    // version it was approved against, and there is nothing to diverge from.
    // Here it is wrong. The constitution HAS moved, and with no snapshot of
    // where it moved from, "unchanged" and "rewritten" are indistinguishable —
    // so the honest verdict is neither, and the proposer re-makes the edit
    // against the words that are actually there.
    if (verdict === 'apply' && !(moved && !base)) { carried.push(op); continue }

    conflicts.push({
      op,
      reason: verdict === 'divergent' ? 'diverged' : 'unverifiable',
      current: fullText(node),
      proposed: operationText(op),
      title: node?.title ?? null
    })
  }

  return {
    carried,
    dropped,
    conflicts,
    moved,
    baseVersion,
    currentVersion,
    // Stated rather than inferred: the page says which of the two reasons a
    // conflict has, and "we could not check" is not the same as "it clashes".
    baseAvailable: !moved || !!base
  }
}

/**
 * Replay carried operations onto a fresh model of the current constitution.
 *
 * The result is what the editor shows: the constitution as it is today, with
 * the proposer's surviving edits already made in it. Re-deriving from that
 * model reproduces the same operations — which is the property that makes
 * "based on the latest constitution" the only thing the page can produce.
 */
export function applyOperationsToModel (model, operations = []) {
  // No logic of its own. `applyOperation` is the only applier there is; this
  // hands it the model, which is shaped exactly like a constitution document
  // for precisely this reason.
  for (const op of operations) applyOperation(model, op)
  return model
}
