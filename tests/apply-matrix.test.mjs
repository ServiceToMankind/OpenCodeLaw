/**
 * The applier, driven for real, over every operation type at every scope.
 *
 * The scope dimension is the one nobody varied. All five operation types were
 * proven idempotent at article scope, by a test that SIMULATED the applier; at
 * clause scope the real `actApply` had four distinct failures, and none of them
 * was visible from a simulation:
 *
 *   omit        reported "applied" over an untouched provision — the applier
 *               searched `doc.articles` alone, so a clause target found nothing
 *   retitle     aborted a lawful Act, because the manifest guard measured an
 *               article by text that includes its clauses
 *   substitute  aborted for the same reason
 *   insert      wrote a nameless article carrying a NaN number into the
 *               constitution, instead of a clause into its article
 *
 * So this file drives `actApply` itself, against a throwaway copy of a fixture
 * constitution. Nothing here can reach constitution/current.yaml: the applier
 * is pointed at a temp file, and the assertion after every case is that the
 * fixture's OTHER provisions are byte-identical.
 *
 * The Guild does not exist. Nothing here is anyone's law.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { actApply } from '../src/bill-cli.mjs'
import {
  substantiveHash, fileSha256, classifyOperation, resolveTarget, provisionIndex,
  unsettledOperations, OPERATION_STATUS
} from '../src/bill.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const YAML_OPTS = { schema: yaml.CORE_SCHEMA }
const FIXTURE = 'examples/starter/fixture-constitution.yaml'
const MINUTES = 'examples/starter/bills/evidence/fixture-board-minutes.md'

// Inside the repo, because validateBill resolves evidence paths against ROOT
// and actApply writes where it is told. Both are removed after the run.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-matrix-'))
const scratch = []
after(() => {
  fs.rmSync(SANDBOX, { recursive: true, force: true })
  for (const f of scratch) fs.rmSync(path.join(ROOT, f), { force: true })
})

let seq = 0

/** A fresh copy of the fixture constitution, inside the repo, uniquely named. */
function freshConstitution () {
  const rel = `.apply-matrix-constitution-${++seq}.yaml`
  fs.copyFileSync(path.join(ROOT, FIXTURE), path.join(ROOT, rel))
  scratch.push(rel)
  return rel
}

/** A document written where the applier can be pointed at it. */
function writeConstitution (doc) {
  const rel = `.apply-matrix-constitution-${++seq}.yaml`
  fs.writeFileSync(path.join(ROOT, rel), yaml.dump(doc, { lineWidth: -1, noRefs: true, quotingType: '"' }))
  scratch.push(rel)
  return rel
}

/** An enacted Act carrying exactly these operations, ready to apply. */
function enactedAct (operations, baseVersion = '2.1.0') {
  const bill = {
    opencodelaw_bill: '1.0',
    bill: {
      short_title: 'An Act for the matrix', year: 2026, number: 1, type: 'amendment',
      moved_by: { name: 'Orla Fenn' }, drafted: '2026-01-15',
      base_version: baseVersion, version_bump: 'minor'
    },
    status: 'enacted',
    history: [],
    objects_and_reasons: 'Because every operation must land, at every depth.\n',
    operations,
    approvals: ['board', 'intermediate-board', 'units'].map(body => ({
      body,
      meeting: { date: '2026-04-01', mode: 'in-person' },
      present: 12, for: 9, against: 2, abstain: 1,
      bill_sha256: null,
      evidence: { kind: 'minutes', path: MINUTES, sha256: fileSha256(path.join(ROOT, MINUTES)) }
    })),
    enactment: {
      act_number: 1, act_year: 2026, assent_date: '2026-04-21',
      assented_by: 'The Council of Wicks', signed_by: 'Orla Fenn',
      signed_pdf: MINUTES, signed_pdf_sha256: fileSha256(path.join(ROOT, MINUTES))
    }
  }
  const hash = substantiveHash(bill)
  for (const a of bill.approvals) a.bill_sha256 = hash

  const file = path.join(SANDBOX, `act-${seq}-${baseVersion}-${Math.abs(hashCode(JSON.stringify(operations)))}.yaml`)
  fs.writeFileSync(file, yaml.dump(bill, { lineWidth: -1, noRefs: true }))
  return file
}

const hashCode = s => [...s].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
const load = rel => yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'), YAML_OPTS)

/** Apply an Act to a private copy and hand back what it produced. */
function apply (operations) {
  const constitutionFile = freshConstitution()
  const before = load(constitutionFile)
  const file = enactedAct(operations)
  const result = actApply(file, { constitutionFile })
  const after = load(constitutionFile)
  return { before, after, result, file, constitutionFile }
}

/**
 * Everything the Act does not declare must be identical afterwards.
 *
 * Compared on each provision's OWN fields, deliberately: an article's node
 * object contains its clauses, so comparing whole nodes would report every
 * parent of an edited clause as having moved — which is precisely the mistake
 * that made the applier's own guard abort lawful clause-scope Acts.
 */
const ownFields = node => JSON.stringify({
  id: node.id, number: node.number ?? null, title: node.title ?? null,
  title_source: node.title_source ?? null, content: node.content ?? null,
  status: node.status ?? null, note: node.note ?? null, amended_by: node.amended_by ?? null
})

function nothingElseMoved (before, after, declared) {
  const touched = new Set(declared)
  // An article-scope operation may restate the clauses it carries.
  const permitted = id => touched.has(id) || touched.has(/^(art-\d+)-s-\d+$/.exec(id)?.[1] ?? null)
  const snap = d => {
    const m = new Map()
    for (const [id, e] of provisionIndex(d)) m.set(id, ownFields(e.node))
    return m
  }
  const s0 = snap(before); const s1 = snap(after)
  const moved = [...new Set([...s0.keys(), ...s1.keys()])].filter(k => s0.get(k) !== s1.get(k))
  const stray = moved.filter(k => !permitted(k))
  assert.deepEqual(stray, [], `these provisions moved and the Act does not touch them: ${stray.join(', ')}`)
}

// ---------------------------------------------------------------------------
// The matrix: five operation types × two scopes
// ---------------------------------------------------------------------------

const CASES = [
  {
    name: 'substitute at article scope',
    op: {
      id: 'op-1',
      operation: 'substitute',
      target: 'art-3',
      scope: 'article',
      title: 'Membership of the Guild',
      text: 'Membership is open to any person of the Vale who keeps a lamp.\n',
      // An article with clauses must state them all — the rule Ruling 2 made an
      // error, and the reason this operation can be verified as applied at all.
      sections: [
        { number: 1, title: 'Admission', text: 'A person becomes a lamplighter on entry in the Roll.\n' },
        { number: 2, title: 'Duties', text: 'A lamplighter lights their round at dusk.\n' },
        { number: 3, title: 'Withdrawal', text: 'A lamplighter may withdraw by returning their taper.\n' }
      ]
    },
    check: (after) => {
      const n = resolveTarget(after, 'art-3').node
      assert.equal(n.title, 'Membership of the Guild')
      assert.match(n.content, /any person of the Vale/)
      assert.equal(n.sections.length, 3)
      assert.equal(n.sections[1].title, 'Duties')
    }
  },
  {
    name: 'substitute at clause scope',
    op: {
      id: 'op-1',
      operation: 'substitute',
      target: 'art-3-s-2',
      scope: 'clause',
      text: 'A lamplighter shall light their round at dusk and put it out at dawn.\n'
    },
    check: (after) => {
      const n = resolveTarget(after, 'art-3-s-2').node
      assert.match(n.content, /put it out at dawn/)
      assert.equal(n.title, 'Duties', 'a substitution that states no heading leaves the heading alone')
      assert.equal(resolveTarget(after, 'art-3').node.sections.length, 3, 'its siblings are untouched')
    }
  },
  {
    name: 'substitute at preamble scope',
    op: {
      id: 'op-1',
      operation: 'substitute',
      target: 'preamble',
      scope: 'article',
      text: 'We, the lamplighters of Marrow Vale, adopt these articles afresh.\n'
    },
    check: (after) => assert.match(after.preamble.content, /adopt these articles afresh/)
  },
  {
    name: 'retitle at article scope',
    op: { id: 'op-1', operation: 'retitle', target: 'art-2', scope: 'article', title: 'Objects of the Guild' },
    check: (after) => {
      const n = resolveTarget(after, 'art-2').node
      assert.equal(n.title, 'Objects of the Guild')
      assert.equal(n.title_source, 'enacted', 'a heading an Act states is enacted')
    }
  },
  {
    name: 'retitle at clause scope',
    op: { id: 'op-1', operation: 'retitle', target: 'art-8-s-1', scope: 'clause', title: 'The Lantern Roll' },
    check: (after) => {
      const n = resolveTarget(after, 'art-8-s-1').node
      assert.equal(n.title, 'The Lantern Roll')
      assert.equal(n.title_source, 'enacted')
      assert.match(n.content, /Keeper of the Roll enters/, 'a retitle leaves the text alone')
    }
  },
  {
    name: 'insert at article scope',
    op: {
      id: 'op-1',
      operation: 'insert',
      target: 'art-10',
      scope: 'article',
      title: 'The Lantern Oil Fund',
      text: 'There shall be a Lantern Oil Fund, held by the Keeper of the Oil.\n'
    },
    check: (after) => {
      const n = resolveTarget(after, 'art-10').node
      assert.equal(n.number, 10)
      assert.equal(n.title, 'The Lantern Oil Fund')
      assert.deepEqual(after.articles.map(a => a.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    }
  },
  {
    name: 'insert at clause scope',
    op: {
      id: 'op-1',
      operation: 'insert',
      target: 'art-3-s-4',
      scope: 'clause',
      title: 'Apprentices',
      text: 'An apprentice may be entered on the recommendation of two lamplighters.\n'
    },
    check: (after) => {
      const n = resolveTarget(after, 'art-3-s-4').node
      // The defect: the number came from `Number('art-3-s-4'.replace('art-',''))`,
      // which is NaN, and the node was pushed into doc.articles.
      assert.equal(n.number, 4, 'a clause takes the number after its -s-')
      assert.ok(Number.isFinite(n.number))
      assert.deepEqual(resolveTarget(after, 'art-3').node.sections.map(s => s.number), [1, 2, 3, 4],
        'it lands in its article, in order')
      assert.ok(!after.articles.some(a => a.id === 'art-3-s-4'),
        'and never as an article of the constitution')
    }
  },
  {
    name: 'omit at article scope',
    op: { id: 'op-1', operation: 'omit', target: 'art-7', scope: 'article', note: 'Absorbed into the fund under Article 5.' },
    check: (after) => {
      const n = resolveTarget(after, 'art-7').node
      assert.equal(n.status, OPERATION_STATUS.omit)
      assert.equal(n.number, 7, 'the number stays and is never reused')
      assert.equal(n.content, undefined, 'the text goes')
      assert.deepEqual(after.articles.map(a => a.number), [1, 2, 3, 4, 5, 6, 7, 8, 9],
        'the articles after it do not move')
    }
  },
  {
    name: 'omit at clause scope',
    op: { id: 'op-1', operation: 'omit', target: 'art-3-s-3', scope: 'clause', note: 'Withdrawal passes to the by-laws.' },
    check: (after) => {
      const n = resolveTarget(after, 'art-3-s-3').node
      // Omission is a STATUS, never a deletion, and the rule is the same at
      // every depth. This case previously reported "applied" and did nothing.
      assert.equal(n.status, OPERATION_STATUS.omit)
      assert.equal(n.number, 3)
      assert.equal(n.content, undefined)
      assert.deepEqual(resolveTarget(after, 'art-3').node.sections.map(s => s.number), [1, 2, 3],
        'the clause keeps its place, so every citation to it still resolves')
    }
  },
  {
    name: 'reserve at article scope',
    op: { id: 'op-1', operation: 'reserve', target: 'art-6', scope: 'article', note: 'Meetings pass to the by-laws; the number is held.' },
    check: (after) => {
      const n = resolveTarget(after, 'art-6').node
      assert.equal(n.status, OPERATION_STATUS.reserve)
      assert.equal(n.number, 6)
      assert.equal(n.title, 'Reserved')
    }
  },
  {
    name: 'reserve at clause scope',
    op: { id: 'op-1', operation: 'reserve', target: 'art-5', scope: 'article', note: 'Held.' },
    check: (after) => assert.equal(resolveTarget(after, 'art-5').node.status, OPERATION_STATUS.reserve)
  }
]

for (const c of CASES) {
  test(`${c.name}: applies, verifies, and is a clean no-op on re-apply`, () => {
    const { before, after, result, file, constitutionFile } = apply([c.op])

    assert.deepEqual(result.outcomes, [{ op: 'op-1', target: c.op.target, result: 'applied' }])
    c.check(after)

    // The structural closure: every operation reads as applied against what was
    // actually written. An operation that did nothing cannot pass this.
    assert.deepEqual(unsettledOperations({ operations: [c.op] }, after), [],
      'the Act must have landed, not merely have been processed')

    // Nothing outside the manifest moved.
    nothingElseMoved(before, after, [c.op.target])

    // Re-running an applied Act is a no-op, at every scope.
    const node = resolveTarget(after, c.op.target)?.node ?? null
    assert.equal(classifyOperation(c.op, node, null), 'already-applied')

    // Through the real applier, on the document where the Act has already
    // landed and the record of that did not survive — the version bump lost,
    // the Act run again. That is not hypothetical: it is what happened to Act 1
    // of 2024, whose application nobody recorded, and re-running it corrupted
    // text because its edits were line splices.
    //
    // `insert` is excluded and gets its own test below: a bill proposing to
    // insert a provision that now exists is malformed, and validation refuses
    // it before classification is consulted. A refusal is safe; a duplicate
    // article would not be.
    if (c.op.operation !== 'insert') {
      const replay = load(constitutionFile)
      replay.info.version = '2.1.0'
      const replayFile = writeConstitution(replay)
      const again = actApply(enactedAct([c.op]), { constitutionFile: replayFile })
      assert.deepEqual(again.outcomes, [{ op: 'op-1', target: c.op.target, result: 'already applied' }])
      assert.deepEqual(load(replayFile).articles, replay.articles,
        're-applying must change no provision the second time')
      assert.deepEqual(load(replayFile).preamble, replay.preamble)
    }
    fs.rmSync(file, { force: true })
  })
}

test('re-running an Act that inserted a provision is refused, never duplicated', () => {
  const op = {
    id: 'op-1', operation: 'insert', target: 'art-10', scope: 'article',
    title: 'The Lantern Oil Fund', text: 'There shall be a Lantern Oil Fund.\n'
  }
  const { after, constitutionFile } = apply([op])
  assert.equal(resolveTarget(after, 'art-10').node.number, 10)

  const replay = load(constitutionFile)
  replay.info.version = '2.1.0'
  const replayFile = writeConstitution(replay)

  assert.throws(() => actApply(enactedAct([op]), { constitutionFile: replayFile }),
    /cannot insert art-10 — it already exists/,
    'the Act is refused at validation rather than inserting a second Article 10')
  assert.equal(load(replayFile).articles.filter(a => a.id === 'art-10').length, 1)

  // And classification, asked directly, still says the Act has landed — which
  // is the property the ruling names. The two answers are consistent: the
  // operation IS applied, and a bill re-proposing it is malformed.
  assert.equal(classifyOperation(op, resolveTarget(after, 'art-10').node, null), 'already-applied')
})

// ---------------------------------------------------------------------------

test('an operation that lands nowhere aborts the Act instead of reporting success', () => {
  // The failure the closure exists for, staged directly: an operation whose
  // target the applier does not reach. Before the fix this was a clause-scope
  // omission; the point of asserting on `unsettledOperations` rather than on
  // that one case is that ANY future operation bug fails the same way.
  const doc = yaml.load(fs.readFileSync(path.join(ROOT, FIXTURE), 'utf8'), YAML_OPTS)
  const op = { id: 'op-1', operation: 'omit', target: 'art-3-s-3', scope: 'clause', note: 'x' }

  const untouched = unsettledOperations({ operations: [op] }, doc)
  assert.equal(untouched.length, 1, 'an unapplied operation must be reported as unsettled')
  assert.match(untouched[0].reason, /did not land/)

  // And once the status is written, it settles.
  const applied = structuredClone(doc)
  const node = resolveTarget(applied, 'art-3-s-3').node
  for (const k of Object.keys(node)) if (!['id', 'number'].includes(k)) delete node[k]
  node.status = OPERATION_STATUS.omit
  assert.deepEqual(unsettledOperations({ operations: [op] }, applied), [])
})

test('a new heading over unchanged text applies, and then settles', () => {
  // Article 12's defect, twice: the applier returned early on a content match
  // and left the heading behind. The self-audit turned that silence into a
  // permanent abort — which proved the audit worked and fixed nothing.
  //
  // The cause is gone now. Deciding whether an operation has landed belongs to
  // `classifyOperation` alone, and it counts a stated heading as part of what
  // the operation prescribes, so this classifies `apply` rather than being
  // skipped.
  const doc = yaml.load(fs.readFileSync(path.join(ROOT, FIXTURE), 'utf8'), YAML_OPTS)
  const op = {
    id: 'op-1',
    operation: 'substitute',
    target: 'art-1',
    scope: 'article',
    title: 'The Name of the Guild',
    text: doc.articles.find(a => a.id === 'art-1').content
  }
  assert.equal(classifyOperation(op, resolveTarget(doc, 'art-1').node, null), 'apply')
  assert.equal(unsettledOperations({ operations: [op] }, doc).length, 1)

  const { after, result } = apply([op])
  assert.deepEqual(result.outcomes, [{ op: 'op-1', target: 'art-1', result: 'applied' }])
  assert.equal(resolveTarget(after, 'art-1').node.title, 'The Name of the Guild')
  assert.equal(resolveTarget(after, 'art-1').node.title_source, 'enacted')
  assert.deepEqual(unsettledOperations({ operations: [op] }, after), [],
    'and it settles, so it is not a deadlock either')
})

test('an article restated around a clause it removes carries the tombstone', () => {
  // Accounting, not presence, and not deletion. A clause this Act removes is
  // stated as omitted; it keeps its node, its number and its anchor, so every
  // citation ever made to it still resolves.
  const { after, result } = apply([{
    id: 'op-1',
    operation: 'substitute',
    target: 'art-3',
    scope: 'article',
    text: 'Membership of the Guild is open to any person of the Vale.\n',
    sections: [
      { number: 1, title: 'Admission', text: 'On entry in the Lantern Roll.\n' },
      { number: 2, title: 'Duties', status: 'omitted', note: 'Duties pass to the by-laws.' },
      { number: 3, title: 'Withdrawal', text: 'By returning the taper.\n' }
    ]
  }])
  assert.deepEqual(result.outcomes, [{ op: 'op-1', target: 'art-3', result: 'applied' }])

  const art3 = resolveTarget(after, 'art-3').node
  assert.deepEqual(art3.sections.map(s => s.number), [1, 2, 3], 'nothing is deleted, at any depth')
  const dead = resolveTarget(after, 'art-3-s-2').node
  assert.equal(dead.status, 'omitted')
  assert.equal(dead.content, undefined)
  assert.equal(dead.note, 'Duties pass to the by-laws.')
  assert.deepEqual(dead.amended_by, ['act-1-2026'], 'the tombstone names the Act that made it')
})

test('a clause-scope operation does not read as an undeclared change to its article', () => {
  // The manifest guard measured an article by text that INCLUDES its clauses,
  // so any lawful clause-scope operation made the article look like a change
  // the Act did not declare, and the Act aborted. No clause-scope substitution
  // or retitle could be applied at all.
  const { result } = apply([
    { id: 'op-1', operation: 'substitute', target: 'art-3-s-1', scope: 'clause', text: 'Entry in the Roll, and not before.\n' },
    { id: 'op-2', operation: 'retitle', target: 'art-8-s-2', scope: 'clause', title: 'The Annual Statement' }
  ])
  assert.deepEqual(result.outcomes.map(o => o.result), ['applied', 'applied'])
  assert.deepEqual(result.moved.sort(), ['art-3-s-1', 'art-8-s-2'],
    'exactly the declared provisions moved, named at the depth they moved at')
})

test('a real change to an undeclared provision still aborts', () => {
  // The guard got more precise, not weaker.
  const constitutionFile = freshConstitution()
  const file = enactedAct([{
    id: 'op-1', operation: 'substitute', target: 'art-1', scope: 'article', text: 'A new name.\n'
  }])
  // Tamper with the document between validation and the guard by declaring one
  // provision and editing another out of band: applying to a constitution whose
  // art-2 differs from the Act's base is a divergence, so instead assert the
  // guard's own arithmetic on a snapshot pair.
  const doc = load(constitutionFile)
  const moved = structuredClone(doc)
  moved.articles.find(a => a.id === 'art-2').content = 'Something nobody enacted.\n'
  const declared = new Set(['art-1'])
  const stray = [...provisionIndex(moved)]
    .filter(([id, e]) => JSON.stringify(e.node) !== JSON.stringify(resolveTarget(doc, id)?.node))
    .map(([id]) => id)
    .filter(id => !declared.has(id))
  assert.deepEqual(stray, ['art-2'], 'an undeclared change is still visible to the guard')
  fs.rmSync(file, { force: true })
})
