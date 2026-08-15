/**
 * Guards the hand-written YAML serialiser.
 *
 * A YAML library in the browser is a large dependency for one fixed shape, so
 * the emitter is hand-written — which means the schema has to police it. The
 * chain: the schema gains a field → the coverage test names it → the maximal
 * fixture gains it → the round-trip fails if the serialiser drops it.
 *
 * The existing e2e catches a dropped REQUIRED field, because the CLI rejects
 * the output. It cannot catch a dropped OPTIONAL one, because absence is valid.
 * That is the hole these tests close.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { billToYaml, PAGE_EXCLUDED, blockText } from '../src/scripts/bill-serialise.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/opencodelaw-bill-1.0.schema.json'), 'utf8'))

/** Every optional field populated, so a dropped key shows up as a deep-equal failure. */
const MAXIMAL = {
  opencodelaw_bill: '1.0',
  bill: {
    // Adversarial on purpose: a hand-written emitter's real risk is quoting.
    short_title: 'An Act: with a colon-space, a # hash, "double" and \'single\' quotes',
    also_known_as: 'Maximal Act, 2026',
    year: 2026,
    number: 4,
    type: 'amendment',
    moved_by: { name: 'Orla Fenn', role: 'Unit Head', contact: 'orla@example.org' },
    drafted: '2026-01-15',
    base_version: '2.1.0',
    version_bump: 'minor'
  },
  status: 'enacted',
  history: [
    { date: '2026-01-15', from: 'draft', to: 'submitted', actor: 'ICC', evidence: 'inbox-2026-01-15', note: 'Numbered on submission.' },
    {
      date: '2026-02-01',
      to: 'approval-voided',
      actor: 'ICC',
      evidence: null,
      note: 'Operations edited; the board resolution no longer binds.',
      // A voided approval is preserved verbatim: a body's vote is a
      // legislative fact even after the text it approved has moved on.
      approval: {
        body: 'board',
        present: 12,
        for: 9,
        against: 2,
        abstain: 1,
        bill_sha256: 'd'.repeat(64),
        evidence: { kind: 'minutes', path: 'bills/2026/evidence/voided.pdf', sha256: 'e'.repeat(64) }
      }
    }
  ],
  objects_and_reasons: '1. Because the fixture must exercise every field.\n2. And a second line.\n',
  operations: [
    {
      id: 'op-1',
      operation: 'substitute',
      target: 'art-3',
      scope: 'clause',
      clauses: '1,2',
      title: 'A Restated Heading',
      note: '  leading and trailing spaces  ',
      source_lines: '10-20',
      text: 'The complete resulting text.\n' +
        'key: value — a line that looks like YAML syntax\n' +
        '- and one that looks like a list item\n' +
        '# and one that looks like a comment\n' +
        'unicode: ₹ — “curly” ’apostrophes’ and an em dash\n' +
        ('a very long line ' .repeat(40)) + '\n',
      sections: [
        { number: 1, title: 'First', text: 'First section text.\n' },
        { number: 2, title: 'Second: with a colon', text: '\n' }
      ]
    },
    { id: 'op-2', operation: 'omit', target: 'art-7', scope: 'article', note: 'Removed for the fixture.' }
  ],
  approvals: [
    {
      body: 'board',
      meeting: { date: '2026-03-01', mode: 'hybrid', place: 'The Long Room', presiding: 'A. Presider' },
      present: 12, for: 9, against: 2, abstain: 1,
      bill_sha256: 'a'.repeat(64),
      evidence: { kind: 'minutes', path: 'bills/2026/evidence/x.pdf', sha256: 'b'.repeat(64), url: 'https://example.org/minutes' },
      recorded_by: '',
      note: 'An approval note.'
    }
  ],
  enactment: {
    act_number: 4, act_year: 2026, assent_date: '2026-04-01',
    assented_by: 'Internal Compliance Committee', signed_by: 'P. Priya',
    signed_pdf: 'acts/pdf/x.pdf', signed_pdf_sha256: 'c'.repeat(64),
    rendered_from: 'bills/2026/x.yaml'
  }
}

test('a bill with every optional field populated round-trips without loss', () => {
  const round = yaml.load(billToYaml(MAXIMAL, { header: false }), { schema: yaml.CORE_SCHEMA })
  // Block scalars normalise trailing whitespace, so compare against that form.
  const expected = structuredClone(MAXIMAL)
  expected.objects_and_reasons = blockText(expected.objects_and_reasons)
  for (const op of expected.operations) {
    if (op.text != null) op.text = blockText(op.text)
    for (const s of op.sections ?? []) s.text = blockText(s.text)
  }
  assert.deepEqual(round, expected, 'the serialiser dropped or altered a field')
})

/** Every leaf path the schema defines. */
function schemaPaths (node, defs, prefix = '', seen = new Set()) {
  const out = []
  if (!node || typeof node !== 'object') return out
  if (node.$ref) {
    const name = node.$ref.replace('#/$defs/', '')
    if (seen.has(name)) return out
    return schemaPaths(defs[name], defs, prefix, new Set([...seen, name]))
  }
  if (node.type === 'array' || node.items) {
    return schemaPaths(node.items, defs, `${prefix}[]`, seen)
  }
  for (const [key, sub] of Object.entries(node.properties ?? {})) {
    const p = prefix ? `${prefix}.${key}` : key
    const child = schemaPaths(sub, defs, p, seen)
    if (child.length) out.push(...child)
    else out.push(p)
  }
  for (const branch of node.allOf ?? []) out.push(...schemaPaths(branch.then, defs, prefix, seen))
  return out
}

test('every field the schema defines is either serialised or deliberately excluded', () => {
  const paths = [...new Set(schemaPaths(SCHEMA, SCHEMA.$defs))].sort()
  assert.ok(paths.length > 25, `expected the full schema, walked ${paths.length} paths`)

  const emitted = billToYaml(MAXIMAL, { header: false })
  const round = yaml.load(emitted, { schema: yaml.CORE_SCHEMA })

  // A path is covered if ANY element of an array carries it.
  //
  // This walker originally inspected only element [0], and reported
  // history[].approval as uncovered because the voided approval sits on a later
  // entry. Guards are code and get the same scrutiny as what they guard: an
  // array is inspected across all its elements, or across their merged shape,
  // never just the first.
  const present = (value, parts) => {
    if (!parts.length) return value !== undefined
    const [head, ...rest] = parts
    if (head.endsWith('[]')) {
      const arr = value?.[head.slice(0, -2)]
      return Array.isArray(arr) && arr.some(item => present(item, rest))
    }
    return present(value?.[head], rest)
  }
  const has = (obj, p) => present(obj, p.split('.'))

  const excluded = new Set(PAGE_EXCLUDED)
  const missing = paths.filter(p => !has(round, p) && !excluded.has(p))
  assert.deepEqual(missing, [],
    `these schema fields are neither serialised nor on the exclusion list — add them to the ` +
    `maximal fixture (so the round-trip guards them) or to PAGE_EXCLUDED deliberately:\n  ${missing.join('\n  ')}`)
})

test('the exclusion list is the page authority boundary, and it holds', async () => {
  // What the page emits must be a draft and nothing more.
  const pageBill = {
    opencodelaw_bill: '1.0',
    bill: {
      short_title: 'An Act from the page', year: 2026, number: null, type: 'amendment',
      moved_by: { name: 'Orla Fenn' }, drafted: '2026-01-15',
      base_version: '3.0.0', version_bump: 'minor'
    },
    status: 'draft',
    history: [],
    objects_and_reasons: 'Because.\n',
    operations: [{ id: 'op-1', operation: 'substitute', target: 'art-3', scope: 'article', text: 'New text.\n' }],
    approvals: ['board', 'intermediate-board', 'units'].map(body => ({
      body, meeting: { date: null }, present: null, for: null, against: null, abstain: null, bill_sha256: null
    })),
    enactment: {
      act_number: null, act_year: null, assent_date: null, assented_by: null,
      signed_by: null, signed_pdf: null, signed_pdf_sha256: null
    }
  }
  const round = yaml.load(billToYaml(pageBill), { schema: yaml.CORE_SCHEMA })

  assert.equal(round.status, 'draft', 'the page produces drafts only')
  assert.equal(round.bill.number, null, 'the page never numbers a bill')
  assert.deepEqual(round.history, [], 'history is written by the pipeline, never by an author')

  for (const a of round.approvals) {
    for (const k of ['present', 'for', 'against', 'abstain', 'bill_sha256']) {
      assert.equal(a[k], null, `the page must not record ${k} — approvals are the bodies'`)
    }
    assert.equal(a.evidence, undefined, 'the page must not record evidence')
  }
  for (const v of Object.values(round.enactment)) {
    assert.equal(v, null, 'the page must not record any enactment field')
  }
})

test('emitting is idempotent, so successive clerking writes do not churn', () => {
  // submit, then approvals recorded, then enact — each re-writes the file. If
  // the emitter's output shifted between saves, every clerking step would carry
  // formatting noise into the diff the gate reviewer reads.
  const once = billToYaml(MAXIMAL, { header: false })
  const twice = billToYaml(yaml.load(once, { schema: yaml.CORE_SCHEMA }), { header: false })
  const thrice = billToYaml(yaml.load(twice, { schema: yaml.CORE_SCHEMA }), { header: false })
  assert.equal(twice, once, 'emit(parse(emit(x))) must equal emit(x)')
  assert.equal(thrice, twice, 'and must stay stable across further writes')
})

test('adversarial scalars survive the round trip', () => {
  const round = yaml.load(billToYaml(MAXIMAL, { header: false }), { schema: yaml.CORE_SCHEMA })
  assert.equal(round.bill.short_title, MAXIMAL.bill.short_title, 'colons, hashes and quotes')
  assert.equal(round.operations[0].note, MAXIMAL.operations[0].note, 'leading/trailing spaces')
  assert.equal(round.operations[0].sections[1].title, 'Second: with a colon')
  assert.match(round.operations[0].text, /key: value/, 'a line that looks like YAML syntax')
  assert.match(round.operations[0].text, /^# and one that looks like a comment$/m)
  assert.match(round.operations[0].text, /₹ — “curly”/, 'unicode')
  assert.ok(round.operations[0].text.split('\n').some(l => l.length > 500), 'a very long line')
  assert.equal(round.approvals[0].recorded_by, '', 'an empty string is not absence')
})

test('submitting a page-authored draft changes only number, status and history', async () => {
  // The operational reason for one serialiser, expressed as a test: if a
  // clerking write reformats the file, the gate reviewer reads style noise
  // instead of the substantive change.
  const os = await import('node:os')
  const { billSubmit } = await import('../src/bill-cli.mjs')
  const liveVersion = yaml.load(
    fs.readFileSync(path.join(ROOT, 'constitution/current.yaml'), 'utf8'),
    { schema: yaml.CORE_SCHEMA }).info.version

  const draft = {
    opencodelaw_bill: '1.0',
    bill: {
      short_title: 'An Act from the page', year: 2026, number: null, type: 'amendment',
      moved_by: { name: 'Orla Fenn', role: 'Unit Head' }, drafted: '2026-01-15',
      base_version: liveVersion,
      version_bump: 'minor'
    },
    status: 'draft',
    history: [],
    objects_and_reasons: 'Because the diff must stay readable.\n',
    operations: [{ id: 'op-1', operation: 'substitute', target: 'art-13', scope: 'article', text: 'New text for the annual report.\n' }],
    approvals: ['board', 'intermediate-board', 'units'].map(body => ({
      body, meeting: { date: null }, present: null, for: null, against: null, abstain: null, bill_sha256: null
    })),
    enactment: { act_number: null, act_year: null, assent_date: null, assented_by: null, signed_by: null, signed_pdf: null, signed_pdf_sha256: null }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'submit-'))
  const file = path.join(dir, 'draft.yaml')
  const before = billToYaml(draft)          // exactly what the page would hand over
  fs.writeFileSync(file, before)

  billSubmit(file, { actor: 'ICC' })
  const after = fs.readFileSync(file, 'utf8')

  const beforeLines = before.split('\n').filter(l => !l.startsWith('#'))
  const afterLines = after.split('\n')
  const removed = beforeLines.filter(l => !afterLines.includes(l))
  const added = afterLines.filter(l => !beforeLines.includes(l))

  // Only the number, the status and the new history entry may move.
  const allowed = /^(\s*number:|status:|history:|\s+- date:|\s+from:|\s+to:|\s+actor:|\s+note:)/
  for (const l of [...removed, ...added]) {
    if (!l.trim()) continue
    assert.match(l, allowed, `submission changed a line it should not have: ${JSON.stringify(l)}`)
  }
  const parsed = yaml.load(after, { schema: yaml.CORE_SCHEMA })
  assert.equal(parsed.status, 'submitted')
  assert.equal(typeof parsed.bill.number, 'number')
  assert.equal(parsed.history.length, 1)
  assert.equal(parsed.operations[0].text, draft.operations[0].text, 'operation text must be untouched')

  fs.rmSync(dir, { recursive: true, force: true })
})
