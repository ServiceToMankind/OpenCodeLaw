/**
 * Deriving a bill from an edited constitution, and re-making one against a
 * constitution that moved.
 *
 * The editor's guarantees are properties of bill-derive.mjs, not of the DOM, so
 * they are asserted here where they can be stated exactly. The e2e proves the
 * page is wired to this; this file proves what the page is wired to.
 *
 * Everything runs on the Marrow Vale fixture. That society does not exist,
 * which is deliberate: a test that drafts real constitutional language is a
 * test that eventually gets copied into the constitution.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import {
  modelFromDoc, deriveOperations, buildDraft, reviewProblems, rebasePlan,
  applyOperationsToModel, addArticle, addClause, removeArticle, removeClause,
  nextArticleNumber, reservedNumbers
} from '../src/scripts/bill-derive.mjs'
import { classifyOperation, provisionIndex, fullText } from '../src/scripts/bill-core.mjs'
import { substantiveHash, validateBill } from '../src/bill.mjs'
import { billToYaml } from '../src/scripts/bill-serialise.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const YAML_OPTS = { schema: yaml.CORE_SCHEMA }
const load = f => yaml.load(fs.readFileSync(path.join(ROOT, f), 'utf8'), YAML_OPTS)
const DOC = load('examples/starter/fixture-constitution.yaml')

const article = (m, id) => m.articles.find(a => a.id === id)
const clause = (m, id, n) => article(m, id).sections.find(s => s.number === n)
const nodeOf = (doc, id) => provisionIndex(doc).get(id)?.node ?? null

/** The document as it stands after a set of operations has been applied. */
function applied (doc, ops) {
  const m = applyOperationsToModel(modelFromDoc(doc), ops)
  return {
    info: { version: doc.info.version },
    preamble: m.preamble,
    articles: m.articles.map(a => a.removed
      ? { id: a.id, number: a.number, title: 'Omitted', status: 'omitted', note: a.removal_reason }
      : a)
  }
}

const META = {
  name: 'Orla Fenn',
  role: 'Keeper of the Oil',
  membership_id: 'MVL-0042',
  short_title: 'An Act to amend the articles of the Guild',
  objects_and_reasons: 'Because the fixture run must exercise every kind of change.'
}

// ---------------------------------------------------------------------------

test('a non-technical run: edit two provisions, add a clause, remove an article', () => {
  const m = modelFromDoc(DOC)

  // Two provisions edited, exactly as someone typing in a box would.
  article(m, 'art-1').content = 'The Guild shall be known as the Marrow Vale Lamplighters, and in these articles as "the Guild".\n'
  clause(m, 'art-3', 2).content = 'A lamplighter shall light the lamps of their round at dusk and put them out at dawn.\n'
  // One clause added.
  addClause(article(m, 'art-3'), { title: 'Apprentices', text: 'An apprentice may be entered on the recommendation of two lamplighters.\n' })
  // One article removed.
  removeArticle(article(m, 'art-7'), 'The Taper Fund is absorbed into the fund under Article 5.')

  const ops = deriveOperations(DOC, m)
  assert.deepEqual(ops.map(o => `${o.operation} ${o.target}`),
    ['substitute art-1', 'substitute art-3', 'omit art-7'],
    'the clause edit and the clause addition belong to one restatement of Article 3')

  // Rule 1: an article carrying clauses restates every one of them.
  const art3 = ops.find(o => o.target === 'art-3')
  assert.equal(art3.sections.length, 4, 'every clause, not only the changed ones')
  assert.deepEqual(art3.sections.map(s => s.number), [1, 2, 3, 4])

  // Ids are positional, so the same edits always derive the same bill — which
  // is what keeps the substantive hash stable across a reload.
  assert.deepEqual(ops.map(o => o.id), ['op-1', 'op-2', 'op-3'])
  assert.deepEqual(deriveOperations(DOC, m).map(o => o.id), ops.map(o => o.id))
})

test('every derived operation applies, and applies exactly once', () => {
  const m = modelFromDoc(DOC)
  article(m, 'art-1').content = 'A new name for the Guild.\n'
  clause(m, 'art-8', 1).title = 'The Lantern Roll'
  addClause(article(m, 'art-3'), { title: 'Apprentices', text: 'An apprentice may be entered by two lamplighters.\n' })
  removeArticle(article(m, 'art-7'), 'Absorbed elsewhere.')
  addArticle(m, { title: 'The Lantern Oil Fund', text: 'There shall be a Lantern Oil Fund.\n' })

  const ops = deriveOperations(DOC, m)
  for (const op of ops) {
    assert.equal(classifyOperation(op, nodeOf(DOC, op.target), null), 'apply',
      `${op.id} (${op.operation} ${op.target}) should be applicable against the text it was derived from`)
  }

  const after = applied(DOC, ops)
  for (const op of ops) {
    assert.equal(classifyOperation(op, nodeOf(after, op.target), null), 'already-applied',
      `${op.id} must be a clean no-op on re-apply — that is what full-text operations buy`)
  }
})

test('an edit confined to one clause targets that clause, not its article', () => {
  const m = modelFromDoc(DOC)
  clause(m, 'art-3', 2).content = 'Changed, and nothing else about Article 3 has moved.\n'
  clause(m, 'art-8', 1).title = 'The Lantern Roll'

  const ops = deriveOperations(DOC, m)
  assert.deepEqual(ops.map(o => `${o.operation} ${o.target} (${o.scope})`),
    ['substitute art-3-s-2 (clause)', 'retitle art-8-s-1 (clause)'],
    'a clause speaks for itself when nothing structural moved — the meeting reads one clause, not six')
  assert.equal(ops[0].sections, undefined, 'a clause has no subdivisions to restate')
})

test('an article-level substitute that dropped its clauses would never be idempotent', () => {
  // The schema permits omitting `sections` "to leave them untouched". For an
  // article that HAS clauses, an operation that does so can never compare equal
  // to the provision it produced — classifyOperation compares fullText against
  // operationText, and fullText includes the clauses. It would read as `apply`
  // forever, and as `divergent` the moment a base text is in play.
  const art3 = nodeOf(DOC, 'art-3')
  const bad = { id: 'op-1', operation: 'substitute', target: 'art-3', scope: 'article', text: art3.content }
  assert.equal(classifyOperation(bad, art3, null), 'apply')

  const afterBad = structuredClone(art3)
  afterBad.content = bad.text
  assert.notEqual(classifyOperation(bad, afterBad, null), 'already-applied',
    'this is the failure the "every clause, every time" rule exists to prevent')

  // The derived form carries them, and therefore settles.
  const m = modelFromDoc(DOC)
  article(m, 'art-3').content = 'A restated opening for Article 3.\n'
  const good = deriveOperations(DOC, m)[0]
  assert.equal(good.sections.length, 3)
  assert.equal(classifyOperation(good, nodeOf(applied(DOC, [good]), 'art-3'), null), 'already-applied')
})

test('there is no way to renumber or reorder, so there is nothing to reject', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/opencodelaw-bill-1.0.schema.json'), 'utf8'))
  assert.ok(!schema.$defs.operation.properties.operation.enum.includes('renumber'),
    'renumber is not an operation a bill can carry')

  const m = modelFromDoc(DOC)
  const before = m.articles.map(a => a.number)
  removeArticle(article(m, 'art-7'), 'Removed.')
  addArticle(m, { title: 'New', text: 'Text.\n' })
  assert.deepEqual(m.articles.filter(a => !a.added).map(a => a.number), before,
    'removing an article must not move the ones after it — its number is a permanent citation handle')

  // The removed article keeps its number and never leaves the document.
  const ops = deriveOperations(DOC, m)
  assert.ok(ops.some(o => o.operation === 'omit' && o.target === 'art-7'))
  assert.ok(m.articles.some(a => a.id === 'art-7'))
})

test('a new number is assigned, and a reserved slot is the only alternative', () => {
  const m = modelFromDoc(DOC)
  assert.equal(nextArticleNumber(m), 10, 'the fixture runs to Article 9')
  assert.deepEqual(reservedNumbers(m), [4], 'Article 4 is held deliberately empty')

  addArticle(m, { number: 4, title: 'Night Wardens', text: 'The Guild shall appoint night wardens.\n' })
  const op = deriveOperations(DOC, m).find(o => o.operation === 'insert')
  assert.equal(op.target, 'art-4', 'a reserved number was held open for exactly this')

  const m2 = modelFromDoc(DOC)
  assert.throws(() => addArticle(m2, { number: 3, title: 'x', text: 'y' }), /already exists/,
    'an existing article cannot be overwritten by an insertion')
})

test('the derived bill validates through the CLI, and the hashes agree', () => {
  const m = modelFromDoc(DOC)
  article(m, 'art-1').content = 'The Guild shall be known by another name entirely.\n'
  addClause(article(m, 'art-3'), { title: 'Apprentices', text: 'An apprentice may be entered by two lamplighters.\n' })
  removeArticle(article(m, 'art-7'), 'Absorbed into the fund under Article 5.')

  const bill = buildDraft({ baseDoc: DOC, model: m, meta: META, today: '2026-01-15' })
  assert.equal(bill.status, 'draft', 'the editor produces drafts only')
  assert.equal(bill.bill.number, null, 'the editor never numbers a bill')
  assert.equal(bill.bill.base_version, DOC.info.version)
  assert.equal(bill.bill.moved_by.membership_id, 'MVL-0042',
    'a surface that asks for a membership number must carry it — the Phase 8 form dropped it silently')

  const file = path.join(ROOT, 'examples/starter/bills/.derived-test.yaml')
  fs.writeFileSync(file, billToYaml(bill))
  try {
    const { problems } = validateBill(file, { constitution: DOC })
    assert.deepEqual(problems.errors.map(e => `${e.code}: ${e.message}`), [],
      'the CLI must accept what the editor derived')
    // Hash what will be parsed, never what is displayed: the object in memory
    // and the file on disk must agree, or a meeting resolves on a number that
    // does not match the file it is voting on.
    const parsed = yaml.load(fs.readFileSync(file, 'utf8'), YAML_OPTS)
    assert.equal(substantiveHash(parsed), substantiveHash(bill),
      'the derived bill and its serialised form must hash identically')
  } finally {
    fs.rmSync(file, { force: true })
  }
})

test('the review refuses what the schema would refuse, in the proposer\'s words', () => {
  const m = modelFromDoc(DOC)
  removeArticle(article(m, 'art-7'), '')
  addClause(article(m, 'art-3'), { title: '', text: '' })
  const ops = deriveOperations(DOC, m)
  const said = reviewProblems(m, ops, META).join(' | ')

  assert.match(said, /Article 7: say why it is being removed/)
  assert.match(said, /Article 3, clause \(4\): give the clause a heading/)
  assert.match(said, /Article 3, clause \(4\): it cannot be left empty/)
  assert.ok(!/instancePath|minLength|\/operations\//.test(said),
    'the messages name the provision on screen, not a JSON pointer')
})

// ---------------------------------------------------------------------------
// The rebase
// ---------------------------------------------------------------------------

/** The fixture, moved on: one target enacted by someone else, one rewritten. */
function movedOn () {
  const d = structuredClone(DOC)
  d.info.version = '2.2.0'
  d.articles.find(a => a.id === 'art-2').content = 'What the proposer was going to ask for anyway.\n'
  d.articles.find(a => a.id === 'art-5').content = 'A third party rewrote this article entirely.\n'
  return d
}

function threeWayDraft () {
  const m = modelFromDoc(DOC)
  article(m, 'art-1').content = 'PROPOSER EDIT: this target will not move.\n'
  article(m, 'art-2').content = 'What the proposer was going to ask for anyway.\n'
  article(m, 'art-5').content = 'PROPOSER EDIT: this target will move underneath them.\n'
  return buildDraft({ baseDoc: DOC, model: m, meta: META, today: '2026-01-15' })
}

test('a rebase is exactly three outcomes: carry, drop, conflict', () => {
  const bill = threeWayDraft()
  const now = movedOn()
  const plan = rebasePlan(bill, now, DOC)

  assert.deepEqual(plan.carried.map(o => o.target), ['art-1'],
    'a target nobody touched carries over unchanged')
  assert.deepEqual(plan.dropped.map(d => d.op.target), ['art-2'],
    'a target that already reads as proposed has been enacted by someone else')
  assert.deepEqual(plan.conflicts.map(c => c.op.target), ['art-5'],
    'a target rewritten underneath them is parked, never carried silently')

  const conflict = plan.conflicts[0]
  assert.equal(conflict.reason, 'diverged')
  assert.match(conflict.current, /A third party rewrote/, 'the current text is shown')
  assert.match(conflict.proposed, /PROPOSER EDIT/, 'beside what they had proposed')
  assert.ok(plan.baseAvailable && plan.moved)
})

test('what is generated after a rebase is based on the current constitution', () => {
  const bill = threeWayDraft()
  const now = movedOn()
  const plan = rebasePlan(bill, now, DOC)

  const model = applyOperationsToModel(modelFromDoc(now), plan.carried)
  const next = buildDraft({ baseDoc: now, model, meta: META, today: '2026-02-15' })

  assert.equal(next.bill.base_version, '2.2.0',
    '"must be based on the latest constitution" is not a rule anyone follows — it is the only thing the page can produce')
  assert.deepEqual(next.operations.map(o => `${o.operation} ${o.target}`), ['substitute art-1'],
    'the dropped operation is gone and the conflicted one was never carried')
  for (const op of next.operations) {
    assert.equal(classifyOperation(op, nodeOf(now, op.target), null), 'apply')
  }
})

test('a conflicted edit is not silently lost: it is shown and must be re-made', () => {
  const bill = threeWayDraft()
  const now = movedOn()
  const plan = rebasePlan(bill, now, DOC)

  // Re-made by hand against the current words, it derives again and applies.
  const model = applyOperationsToModel(modelFromDoc(now), plan.carried)
  assert.equal(article(model, 'art-5').content, 'A third party rewrote this article entirely.\n',
    'until the proposer re-makes it, the editor shows what the constitution says now')

  article(model, 'art-5').content = 'A third party rewrote this article, and the proposer amends that.\n'
  const redone = deriveOperations(now, model)
  assert.deepEqual(redone.map(o => o.target), ['art-1', 'art-5'])
  assert.equal(classifyOperation(redone[1], nodeOf(now, 'art-5'), fullText(nodeOf(now, 'art-5'))), 'apply')
})

test('with no snapshot of the base version, every unproven edit is a conflict', () => {
  const bill = threeWayDraft()
  const plan = rebasePlan(bill, movedOn(), null)

  assert.deepEqual(plan.carried, [], 'nothing is carried on a guess')
  assert.deepEqual(plan.dropped.map(d => d.op.target), ['art-2'],
    'an already-enacted edit needs no base text: the current text alone proves it')
  assert.deepEqual(plan.conflicts.map(c => c.op.target), ['art-1', 'art-5'])
  assert.ok(plan.conflicts.every(c => c.reason === 'unverifiable'),
    '"we could not check" must be distinguishable from "it clashes"')
  assert.equal(plan.baseAvailable, false)
})

test('an unmoved constitution carries everything, because it is its own base', () => {
  const bill = threeWayDraft()
  const plan = rebasePlan(bill, DOC, null)
  assert.equal(plan.moved, false)
  assert.equal(plan.conflicts.length, 0)
  assert.equal(plan.carried.length + plan.dropped.length, bill.operations.length)
})

test('replaying then re-deriving reproduces the same operations', () => {
  // The property behind the restore-from-browser-storage path: what is stored
  // is the derived operations, and restoring runs the same rebase an uploaded
  // file runs. If replay and derivation disagreed, a restored draft would
  // quietly become a different proposal.
  const m = modelFromDoc(DOC)
  article(m, 'art-1').content = 'One.\n'
  clause(m, 'art-3', 1).content = 'Two.\n'
  clause(m, 'art-8', 2).title = 'Three'
  addArticle(m, { title: 'Four', text: 'Four.\n' })
  removeArticle(article(m, 'art-7'), 'Five.')

  const ops = deriveOperations(DOC, m)
  const round = deriveOperations(DOC, applyOperationsToModel(modelFromDoc(DOC), ops))
  assert.deepEqual(round, ops, 'derive → replay → derive must be a fixed point')
})
