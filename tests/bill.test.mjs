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
  fullText, operationText, REQUIRED_BODIES, THRESHOLD
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
 * A minimal applier, run the way the pipeline must run one: classify first,
 * and touch the document only when the classification says `apply`. Nothing
 * here is a diff or a splice — an operation carries the complete resulting
 * text, so applying it is an assignment.
 */
function applyOperation (d, o, baseText) {
  const classification = classifyOperation(o, resolve(d, o.target), baseText)
  if (classification !== 'apply') return { doc: d, classification, changed: false }

  const next = structuredClone(d)
  const node = resolve(next, o.target)
  switch (o.operation) {
    case 'substitute':
      if (o.text != null) node.content = o.text
      if (o.title) node.title = o.title
      if (o.sections) {
        node.sections = o.sections.map(s => ({
          id: `${o.target}-s-${s.number}`,
          number: s.number,
          title: s.title,
          title_source: 'enacted',
          content: s.text
        }))
      }
      break
    case 'insert':
      next.articles.push({
        id: o.target,
        number: Number(o.target.replace('art-', '')),
        title: o.title,
        title_source: 'enacted',
        content: o.text
      })
      next.articles.sort((a, b) => a.number - b.number)
      break
    case 'omit':
    case 'reserve':
      // The number stays. A citation made to it must still resolve, which is
      // why nothing is spliced out of the array.
      delete node.content
      delete node.sections
      node.status = o.operation === 'omit' ? 'omitted' : 'reserved'
      node.note = o.note
      break
    case 'retitle':
      node.title = o.title
      node.title_source = 'enacted'
      break
  }
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
  const applied = applyOperation(doc, o, baseText).doc
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
    const r = applyOperation(once, o, baseText.get(o.id))
    first.push([o.id, r.classification])
    once = r.doc
  }
  assert.deepEqual(first, bill.operations.map(o => [o.id, 'apply']),
    'every operation should apply on a document that has not seen it')

  let twice = once
  const second = new Map()
  for (const o of bill.operations) {
    const r = applyOperation(twice, o, baseText.get(o.id))
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
    b.approvals.find(a => a.body === 'intermediate-board').evidence = null
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
    { body: 'board', present: 30, for: 19, against: 5, abstain: 6, evidence: 'Board minutes 1' },
    { body: 'intermediate-board', present: 12, for: 8, against: 2, abstain: 2, evidence: 'IB minutes 1' },
    { body: 'units', present: 15, for: 9, against: 3, abstain: 3, evidence: 'Unit poll 1' }
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
  const exact = tally(REQUIRED_BODIES.map(body => ({ body, for: 6, against: 3, abstain: 4, evidence: 'm' })))
  assert.equal(exact.passes, true)

  // One vote fewer does not.
  const short = tally(REQUIRED_BODIES.map(body => ({ body, for: 5, against: 3, abstain: 4, evidence: 'm' })))
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
