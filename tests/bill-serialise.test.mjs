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
    short_title: 'An Act to exercise every field',
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
      note: 'A drafting note.',
      source_lines: '10-20',
      text: 'The complete resulting text.\n',
      sections: [
        { number: 1, title: 'First', text: 'First section text.\n' },
        { number: 2, title: 'Second', text: 'Second section text.\n' }
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
      recorded_by: 'ICC Coordinator',
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

  // A path is covered if ANY element of an array carries it — the voided
  // approval sits on a later history entry than the first.
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
