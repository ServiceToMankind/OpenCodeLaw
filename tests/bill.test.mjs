/**
 * The amendment pipeline: a bill is machine-applicable from the moment it is
 * drafted, and the signed PDF is a rendering of it rather than the other way
 * round.
 *
 * Everything asserted here is a defect the 2024 Acts actually produced:
 *
 *   - an Act whose clause edits were line splices, so re-running it corrupted
 *     text that no longer looked the way the splice expected (tests 4 and 5);
 *   - three instruments recording the assent of one body where Article 16(3)
 *     requires three (test 7);
 *   - approvals recorded with no minutes behind them (test 7);
 *   - an amendment voted on against text that had already moved (test 6).
 *
 * The fixtures belong to a society that does not exist. That is deliberate:
 * a test that drafts real constitutional language is a test that eventually
 * gets copied into the constitution.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import {
  loadBill, tally, buildBillManifest, classifyOperation, report,
  fullText, operationText, REQUIRED_BODIES, THRESHOLD, applyOperation, OPERATION_STATUS
} from '../src/bill.mjs'
import { validateDocument } from '../src/validate.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOC_FILE = path.join(ROOT, 'examples/starter/fixture-constitution.yaml')
const BILL_FILE = path.join(ROOT, 'examples/starter/bills/fixture-bill.yaml')
const TEMPLATE_FILE = path.join(ROOT, 'bills/TEMPLATE.yaml')

const YAML_OPTS = { schema: yaml.CORE_SCHEMA }
const doc = yaml.load(fs.readFileSync(DOC_FILE, 'utf8'), YAML_OPTS)

const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'opencodelaw-bill-'))
after(() => fs.rmSync(tmp, { recursive: true, force: true }))

let seq = 0

/**
 * validateBill(), one fresh module instance per call.
 *
 * src/bill.mjs memoises a single Ajv and re-compiles the bill schema on every
 * call. Ajv refuses to register the same $id twice, so a second call inside
 * one module instance throws before it validates anything. Importing the
 * module under a fresh specifier keeps each validation independent, and keeps
 * these tests correct whether or not that is fixed.
 */
async function validate (file, options = { constitution: doc }) {
  const { validateBill } = await import(`../src/bill.mjs?instance=${++seq}`)
  return validateBill(file, options)
}

/** Write a bill out where the validator can read it. Never inside the repo. */
function write (bill) {
  const file = path.join(tmp, `bill-${++seq}.yaml`)
  fs.writeFileSync(file, yaml.dump(bill))
  return file
}

/** The fixture bill with one thing deliberately broken. */
function variant (mutate) {
  const bill = structuredClone(loadBill(BILL_FILE))
  mutate(bill)
  return write(bill)
}

const codes = r => r.problems.errors.map(e => e.code)
const detail = r => r.problems.errors.map(e => `${e.code}: ${e.message}`).join('\n')
const errorFor = (r, code) => r.problems.errors.find(e => e.code === code)
const opOf = (bill, kind) => bill.operations.find(o => o.operation === kind)

/** Every provision a bill can target, resolved the way src/bill.mjs resolves it. */
function resolve (d, id) {
  if (id === 'preamble') return d.preamble
  for (const a of d.articles ?? []) {
    if (a.id === id) return a
    for (const s of a.sections ?? []) if (s.id === id) return s
  }
  return undefined
}

/**
 * Classify, then apply — through THE applier, not a copy of it.
 *
 * This used to carry its own miniature applier. That is the disease every
 * defect in this file's history began with: a second implementation, free to
 * drift, agreeing with itself. It wrote `title` without `title_source`, so it
 * could not have caught a retitle that failed to record which instrument
 * stated the heading.
 */
function applyOne (d, o, baseText) {
  const classification = classifyOperation(o, resolve(d, o.target), baseText)
  if (classification !== 'apply') return { doc: d, classification, changed: false }
  const next = structuredClone(d)
  applyOperation(next, o, { actId: 'act-1-2026' })
  return { doc: next, classification, changed: true }
}

// ---------------------------------------------------------------------------

test('the fixture constitution is itself a fully valid document', () => {
  // So that a defect in the fixture can never be read as a defect in a bill.
  // Unlike examples/starter/constitution.yaml, this one has no placeholder
  // contact to trip over: it is meant to pass.
  const rep = validateDocument(doc, 'examples/starter/fixture-constitution.yaml')
  assert.deepEqual(rep.errors.map(e => `${e.code}: ${e.message}`), [])
  assert.equal(doc.info.version, '2.1.0')
  assert.equal(loadBill(BILL_FILE).bill.base_version, doc.info.version,
    'the fixture bill must be drafted against the fixture constitution')
})

test('the template validates clean, as a draft, against the constitution it names', async () => {
  // An author's first act is to copy bills/TEMPLATE.yaml. If the template does
  // not validate, every bill starts from an error and the author learns to
  // ignore the validator. It is checked against the real constitution because
  // that is the version it declares; when the constitution moves, the template
  // is rebased with everything else.
  const r = await validate(TEMPLATE_FILE, {}) // {} — against the live constitution, not the fixture
  assert.equal(r.bill.status, 'draft')
  assert.equal(r.bill.bill.number, null, 'a draft carries no number')
  assert.deepEqual(detail(r), '')
})

test('a numbered draft is refused, and so is an unnumbered bill that has left the desk', async () => {
  // Numbering is the ICC's, at submission. A draft that has numbered itself is
  // claiming a place in a queue it has not joined.
  const numbered = await validate(variant(b => { b.status = 'draft'; b.bill.number = 7 }))
  assert.deepEqual(codes(numbered), ['numbered-draft'], detail(numbered))
  assert.match(errorFor(numbered, 'numbered-draft').message, /ICC assigns a number at submission/)

  const anonymous = await validate(variant(b => { b.status = 'under-review'; b.bill.number = null }))
  assert.ok(codes(anonymous).includes('unnumbered-bill'), detail(anonymous))
})

test('every operation type validates against the fixture constitution', async () => {
  const r = await validate(BILL_FILE)
  assert.deepEqual(detail(r), '')

  const byKind = new Map(r.manifest.map(m => [m.operation, m]))
  assert.deepEqual([...byKind.keys()].sort(),
    ['insert', 'omit', 'reserve', 'retitle', 'substitute'],
    'the fixture must exercise one of every operation the schema allows')

  // Each one, read the way an approval meeting reads the manifest.
  const substitute = byKind.get('substitute')
  assert.equal(substitute.exists, true)
  assert.equal(substitute.unchanged, false)
  assert.match(substitute.after, /Apprentices/, 'a substitution carries the whole provision, sections included')

  assert.equal(byKind.get('insert').exists, false, 'an insert targets a provision that does not exist yet')
  assert.equal(byKind.get('omit').after, null, 'an omitted provision leaves no text behind')
  assert.equal(byKind.get('reserve').after, null, 'a reserved number carries no text')

  const retitle = byKind.get('retitle')
  assert.equal(retitle.title_before, 'The Roll')
  assert.equal(retitle.title_after, 'The Lantern Roll')

  // The clause-scope operation names a section, not an article.
  assert.equal(retitle.scope, 'clause')
  assert.match(retitle.target, /^art-\d+-s-\d+$/)

  // And the bill is properly passed on either reading of "collectively".
  assert.equal(r.tally.passes, true, 'per-body: the stricter reading')
  assert.equal(r.tally.pooled.passes, true, 'pooled: the looser reading')

  const printed = report(r)
  assert.match(printed, /Article 16\(3\) requires all three bodies/)
  for (const body of REQUIRED_BODIES) assert.ok(printed.includes(body), `${body} missing from the report`)
})

test('classifyOperation is a three-way decision, and each way is asserted', () => {
  const bill = loadBill(BILL_FILE)
  const o = opOf(bill, 'substitute')
  const base = resolve(doc, o.target)
  const baseText = fullText(base)

  // current == base → apply. Nothing has happened yet.
  assert.equal(classifyOperation(o, base, baseText), 'apply')

  // current == proposed → already applied. The safe no-op that makes
  // re-running an Act harmless.
  const applied = applyOne(doc, o, baseText).doc
  const appliedNode = resolve(applied, o.target)
  assert.equal(fullText(appliedNode), operationText(o))
  assert.equal(classifyOperation(o, appliedNode, baseText), 'already-applied')

  // neither → divergent. Someone edited the text outside the process; this is
  // never resolved automatically.
  const drifted = structuredClone(doc)
  const driftedNode = resolve(drifted, o.target)
  driftedNode.content = 'Membership is whatever the Keeper of the Oil says it is on the night.'
  delete driftedNode.sections
  assert.equal(classifyOperation(o, driftedNode, baseText), 'divergent')
})

test('applying a bill twice changes the document exactly once', () => {
  // Act 1 of 2024 could not be re-run: its clause edits were splices into text
  // that no longer existed after the first pass. Here the second pass is a
  // no-op by construction, because every operation states its whole result.
  const bill = loadBill(BILL_FILE)
  const baseText = new Map(bill.operations.map(o => [o.id, fullText(resolve(doc, o.target))]))

  let once = doc
  const first = []
  for (const o of bill.operations) {
    const r = applyOne(once, o, baseText.get(o.id))
    first.push([o.id, r.classification])
    once = r.doc
  }
  assert.deepEqual(first, bill.operations.map(o => [o.id, 'apply']),
    'every operation should apply on a document that has not seen it')

  let twice = once
  const second = new Map()
  for (const o of bill.operations) {
    const r = applyOne(twice, o, baseText.get(o.id))
    second.set(o.id, r.classification)
    twice = r.doc
  }

  assert.deepEqual(twice, once, 'the second run must leave the document identical')

  // A substitution and a retitle recognise their own work and stand down.
  assert.equal(second.get(opOf(bill, 'substitute').id), 'already-applied')
  assert.equal(second.get(opOf(bill, 'retitle').id), 'already-applied')
  // An insert whose target now exists must never apply a second time.
  assert.notEqual(second.get(opOf(bill, 'insert').id), 'apply')
  // An omission and a reservation are idempotent in effect: re-running writes
  // the same status and note over the same status and note, which the
  // document-level assertion above already proves.
  assert.equal(resolve(twice, opOf(bill, 'omit').target).status, 'omitted')
  assert.equal(resolve(twice, opOf(bill, 'reserve').target).status, 'reserved')
  assert.equal(resolve(twice, opOf(bill, 'omit').target).content, undefined)

  // Provisions the bill never named are untouched by either pass.
  assert.deepEqual(resolve(twice, 'art-2'), resolve(doc, 'art-2'))
})

test('a bill drafted against a superseded version refuses to validate until it is rebased', async () => {
  // The failure this prevents: a meeting approving text that no longer exists.
  const r = await validate(variant(b => { b.bill.base_version = '1.9.0' }))
  const e = errorFor(r, 'rebase-required')
  assert.ok(e, detail(r))
  assert.match(e.message, /1\.9\.0/, 'the message must name the version the bill was written against')
  assert.match(e.message, /2\.1\.0/, 'and the version the constitution has reached')
  assert.match(e.message, /[Rr]ebase it/)
})

test('enactment is refused when a body is missing — all three are required', async () => {
  const r = await validate(variant(b => { b.approvals = b.approvals.filter(a => a.body !== 'units') }))
  const e = errorFor(r, 'approvals-incomplete')
  assert.ok(e, detail(r))
  assert.match(e.message, /units/)
  assert.match(e.message, /all three/)

  const t = tally(loadBill(BILL_FILE).approvals.filter(a => a.body !== 'units'))
  assert.deepEqual(t.missingBodies, ['units'])
  assert.equal(t.complete, false)
  assert.equal(t.passes, false, 'a missing body can never be inferred to have approved')
})

test('enactment is refused when a body approved with no minutes behind it', async () => {
  // Q13 against the 2024 Acts: an approval with no evidence is an assertion.
  const r = await validate(variant(b => {
    delete b.approvals.find(a => a.body === 'intermediate-board').evidence
  }))
  const e = errorFor(r, 'approval-evidence-missing')
  assert.ok(e, detail(r))
  assert.match(e.message, /intermediate-board/)
  assert.match(e.message, /assertion/)
})

test('enactment is refused when one body falls below two thirds, even though the pooled vote passes', async () => {
  // The whole point of the stricter reading. Until the board resolves what
  // "collectively" means in Article 16(3), a bill carried by two large bodies
  // over the objection of a third is not carried.
  const file = variant(b => {
    const cast = { board: [20, 0], 'intermediate-board': [18, 0], units: [5, 4] }
    for (const a of b.approvals) {
      const [yes, no] = cast[a.body]
      a.for = yes
      a.against = no
      a.abstain = 0
      a.present = yes + no
    }
  })
  const r = await validate(file)

  assert.equal(r.tally.pooled.passes, true, 'pooled: 43 of 49 is well over two thirds')
  assert.equal(r.tally.perBody.find(b => b.body === 'units').passes, false, 'units: 5 of 9 is not')
  assert.equal(r.tally.passes, false, 'the stricter reading governs')
  assert.deepEqual(r.tally.failedBodies, ['units'])

  const e = errorFor(r, 'threshold-not-met')
  assert.ok(e, detail(r))
  assert.match(e.message, /units/)
  assert.match(e.message, /pooled vote across all three bodies does pass/,
    'the record must state both readings, so the Act stands whichever the board adopts')
  assert.match(e.message, /stricter/)
})

test('tally computes each body and the pool, and abstentions are outside the denominator', () => {
  assert.deepEqual(REQUIRED_BODIES, ['board', 'intermediate-board', 'units'])
  assert.equal(THRESHOLD, 2 / 3)

  const t = tally([
    { body: 'board', present: 30, for: 19, against: 5, abstain: 6, evidence: { kind: 'minutes', path: 'Board minutes 1', sha256: 'x'.repeat(64) } },
    { body: 'intermediate-board', present: 12, for: 8, against: 2, abstain: 2, evidence: { kind: 'minutes', path: 'IB minutes 1', sha256: 'x'.repeat(64) } },
    { body: 'units', present: 15, for: 9, against: 3, abstain: 3, evidence: { kind: 'minutes', path: 'Unit poll 1', sha256: 'x'.repeat(64) } }
  ])
  const board = t.perBody.find(b => b.body === 'board')

  // "Present and voting": 30 were present, 24 voted.
  assert.equal(board.present, 30)
  assert.equal(board.voting, 24)
  assert.equal(board.ratio, 19 / 24)
  assert.equal(board.passes, true)
  // Had abstentions counted against the mover, the board would have failed —
  // which is the arithmetic the wording of 16(3) settles.
  assert.ok(19 / 30 < THRESHOLD)

  assert.equal(t.perBody.find(b => b.body === 'intermediate-board').voting, 10)
  assert.equal(t.perBody.find(b => b.body === 'units').ratio, 9 / 12)

  // Pooled, over the same present-and-voting denominators.
  assert.equal(t.pooled.for, 36)
  assert.equal(t.pooled.voting, 46)
  assert.equal(t.pooled.ratio, 36 / 46)
  assert.equal(t.pooled.passes, true)

  assert.equal(t.complete, true)
  assert.equal(t.passes, true)
  assert.deepEqual(t.missingBodies, [])
  assert.deepEqual(t.missingEvidence, [])

  // Exactly two thirds carries: 16(3) says 2/3, not more than 2/3.
  const exact = tally(REQUIRED_BODIES.map(body => ({ body, for: 6, against: 3, abstain: 4, evidence: { kind: 'minutes', path: 'm', sha256: 'x'.repeat(64) } })))
  assert.equal(exact.passes, true)

  // One vote fewer does not.
  const short = tally(REQUIRED_BODIES.map(body => ({ body, for: 5, against: 3, abstain: 4, evidence: { kind: 'minutes', path: 'm', sha256: 'x'.repeat(64) } })))
  assert.equal(short.passes, false)
  assert.deepEqual(short.failedBodies, REQUIRED_BODIES)

  // Nothing recorded is not the same as nothing approved, and neither passes.
  const empty = tally([])
  assert.deepEqual(empty.missingBodies, REQUIRED_BODIES)
  assert.equal(empty.pooled.ratio, null)
  assert.equal(empty.passes, false)
})

test('renumbering is refused, and the refusal says a revision bill is the only way', async () => {
  // Article numbers are the public API: every Act, minute and shared link
  // points at them.

  // Named as an operation, the word is not in the vocabulary at all.
  const named = await validate(variant(b => { b.operations[0].operation = 'renumber' }))
  assert.ok(named.problems.errors.length, 'a renumber operation must not validate')
  assert.ok(
    named.problems.errors.some(e => e.code === 'renumber-forbidden' || /operations\/0\/operation/.test(e.where ?? '')),
    `the refusal must point at the operation that asked to renumber:\n${detail(named)}`)

  // Asked for in a drafting note, it is refused by name, with the reason.
  const asked = await validate(variant(b => {
    b.operations[0].note = 'Renumber Articles 5 to 9 so that the gap at Article 4 closes.'
  }))
  const e = errorFor(asked, 'renumber-forbidden')
  assert.ok(e, detail(asked))
  assert.match(e.message, /amendment bill/)
  assert.match(e.message, /"revision"/, 'the message must name the bill type that may renumber')
  assert.match(e.message, /major version bump/)
  assert.match(e.message, /anchor map/)
})

test('an insert onto an existing provision fails, and a substitution onto a missing one fails', async () => {
  // Q4 in one test: whether an Act amends or inserts is not a matter of
  // opinion, and the bill cannot record it wrongly.
  const collision = await validate(variant(b => { opOf(b, 'insert').target = 'art-2' }))
  const e1 = errorFor(collision, 'insert-exists')
  assert.ok(e1, detail(collision))
  assert.match(e1.message, /art-2 — it already exists/)
  assert.match(e1.message, /"substitute"/, 'the message must name the operation the author wanted')

  const missing = await validate(variant(b => { opOf(b, 'substitute').target = 'art-99' }))
  const e2 = errorFor(missing, 'target-unresolved')
  assert.ok(e2, detail(missing))
  assert.match(e2.message, /art-99 does not exist in constitution version 2\.1\.0/)
  assert.match(e2.message, /"insert"/)

  // The manifest agrees with the validator about what exists.
  const m = buildBillManifest(loadBill(BILL_FILE), doc)
  assert.deepEqual(m.filter(x => !x.exists).map(x => x.target), ['art-10'])
})

test('a substitution that does not state a provision\'s clauses is refused', async () => {
  // A format that permits a bill which can never verify as applied is a format
  // defect, so this is an error and not advice. The omitting form was not just
  // discouraged — it CANNOT settle: application compares a provision's complete
  // text, clauses included, so an operation naming none reads as unapplied
  // forever, and as DIVERGENT the moment a base text is in play.
  const file = variant(b => {
    const op = opOf(b, 'substitute')
    delete op.sections
  })
  const r = await validate(file)
  assert.ok(codes(r).includes('incomplete-substitution'), detail(r))

  const message = errorFor(r, 'incomplete-substitution').message
  assert.match(message, /art-3 has 3 clauses/)
  assert.match(message, /including the ones it does not change/)

  // Proof that the refused form is the unsettleable one, from the classifier
  // rather than from assertion: applied, it still does not read as applied.
  const bill = loadBill(file)
  const op = opOf(bill, 'substitute')
  const node = structuredClone(resolve(doc, 'art-3'))
  node.content = op.text
  assert.notEqual(classifyOperation(op, node, null), 'already-applied',
    'the form is refused because it can never verify, not as a matter of taste')
})

test('the carrying form is accepted, and an article with no clauses needs none', async () => {
  // The legitimate need the omitting form appeared to serve — amend only the
  // opening words — is served exactly by restating the clauses unchanged.
  const untouched = await validate(BILL_FILE)
  assert.ok(!codes(untouched).includes('incomplete-substitution'),
    'the fixture bill states every clause of Article 3 and must pass')

  // art-1 has no clauses, so a substitution of it states none.
  const plain = variant(b => {
    b.operations = [{ id: 'op-1', operation: 'substitute', target: 'art-1', scope: 'article', text: 'A new name.\n' }]
  })
  assert.ok(!codes(await validate(plain)).includes('incomplete-substitution'), 'omit sections where there are none')

  // A clause this Act removes is CARRIED as omitted, never left out.
  const carried = variant(b => {
    b.operations = [{
      id: 'op-1',
      operation: 'substitute',
      target: 'art-3',
      scope: 'article',
      text: 'A chapeau only.\n',
      sections: [
        { number: 1, title: 'Admission', text: 'On entry in the Roll.\n' },
        { number: 2, status: 'omitted', title: 'Duties', note: 'Duties pass to the by-laws.' },
        { number: 3, title: 'Withdrawal', text: 'By returning the taper.\n' }
      ]
    }]
  })
  const cr = await validate(carried)
  assert.ok(!codes(cr).includes('incomplete-substitution'), detail(cr))
})

test('presence is not completeness: a partial clause list is refused', async () => {
  // The first form of this rule asked only that `sections` be there, so a
  // partial list validated clean and silently repealed every clause it left
  // out — no status, no note, no anchor, and nothing in the document to say the
  // clause had ever existed.
  const partial = variant(b => {
    b.operations = [{
      id: 'op-1',
      operation: 'substitute',
      target: 'art-3',
      scope: 'article',
      text: 'A chapeau.\n',
      sections: [{ number: 1, title: 'Admission', text: 'On entry in the Roll.\n' }]
    }]
  })
  const r = await validate(partial)
  assert.ok(codes(r).includes('incomplete-substitution'), detail(r))
  const m = errorFor(r, 'incomplete-substitution').message
  assert.match(m, /clauses \(2\), \(3\) are unaccounted for/)
  assert.match(m, /carried as `status: omitted`/)
  assert.match(m, /every citation ever made to it/)
})

test('the rule is keyed on what the target is, not on the scope it claims', async () => {
  // `scope` and `target` are not cross-checked anywhere, so a rule keyed on the
  // declared scope would be evadable by mislabelling one.
  const mislabelled = variant(b => {
    b.operations = [{ id: 'op-1', operation: 'substitute', target: 'art-3', scope: 'clause', text: 'A chapeau only.\n' }]
  })
  assert.ok(codes(await validate(mislabelled)).includes('incomplete-substitution'),
    'calling an article-scope substitution a clause one must not get past the rule')
})

test('an operation may not take its authority from the Statement of Objects and Reasons', async () => {
  // Convention C1. Structurally impossible — operations carry their own text —
  // and asserted anyway, because Act 2 of 2024 set one amendment threshold in
  // its operative text and a different one in its statement.
  const r = await validate(variant(b => {
    b.operations[0].note = 'Text as given in the Statement of Objects and Reasons.'
  }))
  const e = errorFor(r, 'sor-as-authority')
  assert.ok(e, detail(r))
  assert.match(e.message, /never a source of authority/)
})

// --- the evidence model ----------------------------------------------------

test('evidence must be a file in the repository, and its checksum must match', async () => {
  // A live link is never evidence: mutable, unattributable, and dead when the
  // platform is. The record is archived beside the instrument it approves.
  const missing = await validate(variant(b => {
    b.approvals[0].evidence = { kind: 'minutes', path: 'bills/2026/evidence/nope.pdf', sha256: 'a'.repeat(64) }
  }))
  assert.ok(codes(missing).includes('evidence-missing'), detail(missing))
  assert.match(errorFor(missing, 'evidence-missing').message, /live link is never evidence/i)

  const wrongHash = await validate(variant(b => { b.approvals[0].evidence.sha256 = 'b'.repeat(64) }))
  assert.ok(codes(wrongHash).includes('evidence-hash-mismatch'), detail(wrongHash))
  assert.match(errorFor(wrongHash, 'evidence-hash-mismatch').message, /not the document that was filed/i)
})

test('a vote must be bound to the text it was cast on', async () => {
  const unbound = await validate(variant(b => { b.approvals[0].bill_sha256 = null }))
  assert.ok(codes(unbound).includes('approval-unbound'), detail(unbound))
  assert.match(errorFor(unbound, 'approval-unbound').message, /not bound to any particular text/i)
})

test('editing a bill voids every recorded approval, operations untouched or not', async () => {
  const { substantiveHash } = await import('../src/bill.mjs')

  // (a) an operation changes
  const edited = await validate(variant(b => { b.operations[0].text += ' One more sentence.' }))
  const e = errorFor(edited, 'approval-stale')
  assert.ok(e, detail(edited))
  for (const body of ['board', 'intermediate-board', 'units']) {
    assert.match(e.message, new RegExp(body), `${body} must be named as voided`)
  }
  assert.match(e.message, /move them to history and re-collect/i)

  // (b) THE HARD EDGE: base_version moves, operations byte-identical. The
  // approvals void anyway. Whether a rebase is semantically clean requires
  // reasoning about cross-provision interactions, which no tool can adjudicate
  // honestly — so there is deliberately no clean-rebase exemption.
  const before = substantiveHash(loadBill(BILL_FILE))
  const rebased = structuredClone(loadBill(BILL_FILE))
  rebased.bill.base_version = '2.2.0'
  assert.notEqual(substantiveHash(rebased), before,
    'base_version is inside the hash, so a rebase moves it even when operations do not change')
})

test('a joint sitting may share one record, but the tallies stay per body', async () => {
  const shared = await validate(variant(b => {
    const ev = structuredClone(b.approvals[0].evidence)
    for (const a of b.approvals) a.evidence = structuredClone(ev)
  }))
  assert.deepEqual(codes(shared), [], detail(shared))

  // Per-body tallies are still what the stricter reading needs.
  const t = shared.tally
  assert.equal(t.perBody.length, 3)
  assert.ok(t.perBody.every(x => x.voting > 0), 'each body must carry its own tally')
})

test('the resolution sentence carries the hash the meeting reads aloud', async () => {
  const { resolutionSentence, substantiveHash } = await import('../src/bill.mjs')
  const b = loadBill(BILL_FILE)
  const line = resolutionSentence(b)
  assert.match(line, /^This meeting resolves on Bill \d+ of \d{4}, substantive hash [a-f0-9]{64}\.$/)
  assert.ok(line.includes(substantiveHash(b)))
})

test('a resolution sheet renders only once a bill is scheduled', async () => {
  const { ballotGuard, ballotDocument } = await import('../src/ballot.mjs')
  const { loadConstitution } = await import('../src/bill.mjs')

  for (const status of ['draft', 'submitted', 'under-review', 'returned']) {
    const b = structuredClone(loadBill(BILL_FILE)); b.status = status
    const g = ballotGuard(b)
    assert.ok(g, `${status} should be refused a ballot`)
    assert.match(g, /circulation is the freeze point/i)
  }
  for (const status of ['scheduled', 'approved', 'enacted']) {
    const b = structuredClone(loadBill(BILL_FILE)); b.status = status
    assert.equal(ballotGuard(b), null, `${status} should render`)
  }

  const b = structuredClone(loadBill(BILL_FILE)); b.status = 'scheduled'
  const { substantiveHash } = await import('../src/bill.mjs')
  const html = ballotDocument(b, { info: loadConstitution().info, hash: substantiveHash(b) })
  assert.equal((html.match(/class="sheet"/g) ?? []).length, 3, 'one sheet per body')
  assert.ok(html.includes(substantiveHash(b)), 'the sheet must carry the hash')

  // The sheet's whole purpose is to carry the hash into the minutes, so it
  // refuses to render without one rather than printing a blank where a meeting
  // expects a number to read aloud.
  assert.throws(() => ballotDocument(b, { info: loadConstitution().info }),
    /substantive hash/i, 'a sheet with no hash must be refused, not rendered empty')
  for (const body of ['Board', 'Intermediate Board', 'Units']) {
    assert.ok(html.includes(body), `no sheet for ${body}`)
  }
  // Collapse whitespace: the copy is wrapped in the source, so these phrases
  // span newlines in the rendered HTML.
  const flat = html.replace(/\s+/g, ' ')
  assert.match(flat, /present and voting/i)
  assert.match(flat, /individual members' votes are not published/i)
})

// --- the gate --------------------------------------------------------------

test('two open bills on one provision are a conflict the ICC must sequence', async () => {
  const { findConflicts, TERMINAL } = await import('../src/bill-gate.mjs')
  const mk = (n, status, target) => ({
    rel: `bills/2026/b${n}.yaml`,
    bill: { bill: { number: n, year: 2026, short_title: `Bill ${n}` }, status, operations: [{ target }] }
  })

  const conflicts = findConflicts([
    mk(1, 'submitted', 'art-13'),
    mk(2, 'scheduled', 'art-13'),
    mk(3, 'applied', 'art-13')   // terminal: cannot conflict with anything
  ])
  assert.equal(conflicts.length, 1, 'one conflicted provision')
  assert.equal(conflicts[0].target, 'art-13')
  assert.equal(conflicts[0].bills.length, 2, 'the applied bill must not be counted')
  for (const n of ['Bill 1 of 2026', 'Bill 2 of 2026']) {
    assert.ok(conflicts[0].message.includes(n), `${n} must be named`)
  }
  assert.match(conflicts[0].message, /rebase voids them/,
    'the message must say the second bill re-collects its approvals')

  // Different provisions never conflict.
  assert.deepEqual(findConflicts([mk(1, 'submitted', 'art-13'), mk(2, 'submitted', 'art-14')]), [])
  // Terminal states are terminal.
  for (const s of ['applied', 'rejected', 'withdrawn', 'lapsed']) assert.ok(TERMINAL.has(s))
})

test('the gate reports validator warnings, not only errors', async () => {
  // A warning only in local CLI output is a warning nobody sees. The gate has
  // to surface them, so it has to count them.
  const { runGate } = await import('../src/bill-gate.mjs')
  const r = runGate({ baseRef: 'HEAD', annotations: false })
  assert.equal(typeof r.warnings, 'number')
  assert.equal(typeof r.errors, 'number')
  assert.match(r.text, /Bill gate —/)
})

test('the constitution guard compares content, not names', async () => {
  // Named-by is necessary and not sufficient. CI cannot assume the diff in
  // front of it came from `act apply` — replacing that assumption is the
  // guard's whole job — so a named provision is compared three ways, using the
  // same classify the applier uses.
  const { classifyOperation } = await import('../src/bill.mjs')
  const op = { id: 'op-1', operation: 'substitute', target: 'art-5', scope: 'article', text: 'What the Act prescribes.\n' }
  const base = 'What it said before.\n'

  // The PR applied it: the provision now reads as prescribed.
  assert.equal(classifyOperation(op, { content: 'What the Act prescribes.\n' }, base), 'already-applied')
  // The PR did not apply it: still the base text.
  assert.equal(classifyOperation(op, { content: base }, base), 'apply')
  // The PR hand-edited it to something the Act never said.
  assert.equal(classifyOperation(op, { content: 'Something else entirely.\n' }, base), 'divergent')
})

test('the record is append-only', async () => {
  const { APPEND_ONLY, TERMINAL } = await import('../src/bill-gate.mjs')
  const covered = p => APPEND_ONLY.some(r => (r.prefix && p.startsWith(r.prefix)) || (r.match && r.match.test(p)))

  // Archives, signed instruments, extracted text and evidence may only grow.
  for (const p of [
    'constitution/versions/v1.0.0.yaml',
    'acts/pdf/first-constitution-amendment-act-2024.pdf',
    'acts/text/third-constitution-amendment-act-2024.txt',
    'bills/2026/evidence/board-minutes.pdf'
  ]) {
    assert.ok(covered(p), `${p} must be append-only`)
  }
  // Ordinary engine and content paths are not frozen.
  for (const p of ['src/bill.mjs', 'constitution/current.yaml', 'bills/2026/a-draft.yaml']) {
    assert.ok(!covered(p), `${p} must remain editable`)
  }
  // A concluded bill is record; a resubmission is a new bill, not an edit.
  for (const s of ['applied', 'rejected', 'withdrawn', 'lapsed']) assert.ok(TERMINAL.has(s))
  for (const s of ['draft', 'submitted', 'scheduled', 'approved', 'enacted']) assert.ok(!TERMINAL.has(s))
})

test('a fixture bill runs draft → applied, and re-applying is a clean no-op', async () => {
  // The whole pipeline on a throwaway copy of the fixture constitution. Nothing
  // here touches the real one: the applier is pointed at a temp tree.
  const os = await import('node:os')
  const { classifyOperation, fullText, OPERATION_STATUS } = await import('../src/bill.mjs')

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-'))
  const constFile = path.join(dir, 'constitution.yaml')
  fs.copyFileSync(path.join(ROOT, 'examples/starter/fixture-constitution.yaml'), constFile)
  const doc = yaml.load(fs.readFileSync(constFile, 'utf8'), { schema: yaml.CORE_SCHEMA })

  const bill = loadBill(BILL_FILE)
  const nodeOf = (d, id) => {
    if (d.preamble?.id === id) return d.preamble
    for (const a of d.articles ?? []) {
      if (a.id === id) return a
      for (const s of a.sections ?? []) if (s.id === id) return s
    }
    return null
  }

  // Every operation must be applicable against the base it was drafted on.
  for (const op of bill.operations) {
    const node = nodeOf(doc, op.target)
    const verdict = classifyOperation(op, node, node ? fullText(node) : null)
    assert.notEqual(verdict, 'divergent', `${op.id} (${op.operation} ${op.target}) diverges from the base`)
  }

  // Apply through THE applier, then re-classify: everything is a no-op.
  for (const op of bill.operations) applyOperation(doc, op, { actId: 'act-1-2026' })

  for (const op of bill.operations) {
    const node = nodeOf(doc, op.target)
    assert.equal(classifyOperation(op, node, null), 'already-applied',
      `${op.id} should be a clean no-op on re-apply — that is what full-text operations buy`)
  }

  fs.rmSync(dir, { recursive: true, force: true })
})

test('applying against a divergent target aborts rather than overwriting', async () => {
  const { classifyOperation } = await import('../src/bill.mjs')
  const op = { id: 'op-1', operation: 'substitute', target: 'art-3', scope: 'article', text: 'What the Act prescribes.\n' }
  const drifted = { content: 'Something a third party wrote.\n' }
  assert.equal(classifyOperation(op, drifted, 'What it said when drafted.\n'), 'divergent',
    'a target that matches neither the base nor the Act must abort, never be overwritten')
})

// This test exists because the previous one AGREED WITH THE BUG: it wrote the
// same wrong status the classifier expected, so two implementations confirmed
// each other's error indefinitely — coherence masquerading as correctness. It
// only broke open against an independent derivation of what the applier
// actually writes. One source of truth (OPERATION_STATUS) plus a cross-check
// against the applier is what stops the two sides quietly agreeing again.
test('every operation type is idempotent against the status the applier writes', async () => {
  // Written against OPERATION_STATUS rather than a literal, because the last
  // bug here was the test and the code sharing the same wrong assumption:
  // both said `status: 'omit'` while the applier writes `status: 'omitted'`.
  const { classifyOperation, OPERATION_STATUS, applyOperation } = await import('../src/bill.mjs')

  // The applied shape is DERIVED by running the applier, never hand-written.
  // The last defect here was the test and the code sharing one wrong
  // assumption — both said `status: 'omit'` where the applier writes
  // `status: 'omitted'` — and a hand-written expectation is how two
  // implementations come to confirm each other's error indefinitely.
  const fixture = () => yaml.load(fs.readFileSync(DOC_FILE, 'utf8'), YAML_OPTS)
  const cases = [
    ['substitute', { id: 'op-1', operation: 'substitute', target: 'art-1', scope: 'article', text: 'T\n' }],
    ['insert', { id: 'op-1', operation: 'insert', target: 'art-10', scope: 'article', title: 'New', text: 'T\n' }],
    ['retitle', { id: 'op-1', operation: 'retitle', target: 'art-1', scope: 'article', title: 'X' }],
    ['omit', { id: 'op-1', operation: 'omit', target: 'art-7', scope: 'article', note: 'why' }],
    ['reserve', { id: 'op-1', operation: 'reserve', target: 'art-7', scope: 'article', note: 'why' }]
  ]
  for (const [name, op] of cases) {
    const d = fixture()
    assert.equal(classifyOperation(op, resolve(d, op.target), null), 'apply', `${name} should start unapplied`)
    applyOperation(d, op, { actId: 'act-1-2026' })
    assert.equal(classifyOperation(op, resolve(d, op.target), null), 'already-applied',
      `re-applying ${name} must be a no-op against the shape the applier actually writes`)
  }

  // The removing operations leave the status this expects, read back off the
  // document rather than asserted about it.
  for (const kind of ['omit', 'reserve']) {
    const d = fixture()
    applyOperation(d, { id: 'op-1', operation: kind, target: 'art-7', scope: 'article', note: 'why' }, { actId: 'act-1-2026' })
    const node = resolve(d, 'art-7')
    assert.equal(node.status, OPERATION_STATUS[kind])
    assert.equal(node.number, 7, 'the number is kept, at every depth')
  }

  // And the status the applier actually writes is the one this expects.
  assert.deepEqual(OPERATION_STATUS, { omit: 'omitted', reserve: 'reserved' })

  // This used to grep the applier for `status: 'omitted'`, which was the
  // weakest possible form of "an independent derivation of what the applier
  // writes" — it proved a string was present in a file. The applier now takes
  // the status from the shared mapping, so the literal is gone and the grep
  // failed, correctly, on an improvement.
  //
  // What replaced it is stronger in both directions: tests/apply-matrix.test.mjs
  // RUNS the applier over every operation type at every scope and reads the
  // status back out of the document it wrote, and this asserts there is no
  // second copy of the mapping here to drift from the first.
  // There is now exactly one applier, in the shared module, and it names the
  // mapping rather than repeating it. `src/bill-cli.mjs` carries no apply logic
  // at all: it is IO, the manifest guard and the self-audit around a call.
  const core = fs.readFileSync(path.join(ROOT, 'src/scripts/bill-core.mjs'), 'utf8')
  assert.match(core, /status: OPERATION_STATUS\[op\.operation\]/,
    'the applier must name the shared mapping rather than repeat it')
  const cli = fs.readFileSync(path.join(ROOT, 'src/bill-cli.mjs'), 'utf8')
  assert.equal(cli.match(/status: '[a-z-]+'/g), null,
    'a second copy of the mapping is exactly the defect this test exists for')
  assert.equal(cli.match(/doc\.articles\.push|node\.sections = op\.sections/g), null,
    'and a second applier may not exist even as dead code')
})
