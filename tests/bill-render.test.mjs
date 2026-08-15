/**
 * The renderer had no coverage at all, which is why a defect in how the CLI
 * passes house style stayed invisible: the signatory office and the entire
 * address footer silently vanished from the signed instrument.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderBillText, renderBillHtml, houseStyle } from '../src/bill-render.mjs'
import { loadBill, loadConstitution, substantiveHash } from '../src/bill.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = path.join(ROOT, 'examples/starter/bills/fixture-bill.yaml')
const info = loadConstitution().info
const bill = () => {
  const b = loadBill(FIXTURE)
  b.enactment.signed_by = 'A. Signatory'
  return b
}
// The shape the CLI actually passes.
const opts = { info, orgYear: 'Fourth' }

test('house style resolves from info.instrument, not from engine defaults', () => {
  const m = houseStyle(opts)
  assert.equal(m.organization, info.organization)
  assert.equal(m.committee, info.instrument.committee)
  assert.equal(m.signatoryTitle, info.instrument.signatory_title)
  assert.deepEqual(m.footer, info.instrument.footer_lines)

  // A fork with no info.instrument must not inherit another organisation's wording.
  const bare = houseStyle({ info: { organization: 'The Guild' } })
  assert.equal(bare.organization, 'The Guild')
  assert.equal(bare.committee, '', 'no committee may be defaulted from the engine')
  assert.equal(bare.signatoryTitle, '')
  assert.deepEqual(bare.footer, [])
})

test('the instrument carries every element of the 2024 house style, in order', () => {
  const out = renderBillText(bill(), opts)
  const order = [
    /Act No\. : \d+ of \d{4}/,
    new RegExp(info.instrument.committee.toUpperCase()),
    /received the assent/,
    /Constitution Amendment Act, \d{4}/,
    /Further to amend the Constitution of/,
    /BE IT ENACTED/,
    /STATEMENT OF OBJECTS AND REASONS/,
    /—————/,
    /A\. Signatory,/,
    new RegExp(info.instrument.signatory_title)
  ]
  let cursor = 0
  for (const re of order) {
    const at = out.slice(cursor).search(re)
    assert.ok(at >= 0, `missing or out of order: ${re}`)
    cursor += at
  }
  // The address footer prints on the CLI path — it did not, for a while.
  for (const line of info.instrument.footer_lines) {
    assert.ok(out.includes(line.split(',')[0]), `footer line missing: ${line}`)
  }
})

test('the mover is printed on the face of the instrument', () => {
  // The 2024 Acts named no proposer, so theirs had to be reconstructed
  // afterwards and never was. Recording moved_by only fixes that if the signed
  // paper carries it.
  const b = bill()
  const text = renderBillText(b, opts)
  const html = renderBillHtml(b, opts)
  assert.ok(text.includes(b.bill.moved_by.name), 'mover missing from the text instrument')
  assert.ok(html.includes(b.bill.moved_by.name), 'mover missing from the HTML instrument')
})

test('an unenacted bill renders without an Act number or assent date', () => {
  const b = bill()
  b.status = 'submitted'
  b.enactment = { act_number: null, act_year: null, assent_date: null, signed_by: null }
  const out = renderBillText(b, opts)
  assert.ok(!/Act No\. : \d+ of/.test(out), 'an unenacted bill must not claim an Act number')
  assert.ok(/Bill No\.|PROPOSED|not yet enacted/i.test(out), 'it must say it is not yet enacted')
})

test('the rendered HTML is self-contained and carries no CDN reference', () => {
  const html = renderBillHtml(bill(), opts)
  assert.ok(!/cdn\.|unpkg|googleapis/.test(html), 'the instrument must not depend on a network')
  assert.match(html, /<style/, 'print styling must be inline')
})

test('the instrument states that it is a rendering, not the source', () => {
  // Collapse wrapping first: the line is hard-wrapped to the instrument's
  // column width, so "source of truth" spans a newline.
  const out = renderBillText(bill(), opts).replace(/\s+/g, ' ')
  assert.match(out, /source of truth/i)
  assert.match(out, /rendering of it/i)
})

test('the substantive hash ignores clerking fields but tracks the operations', () => {
  const a = loadBill(FIXTURE)
  const h = substantiveHash(a)

  const clerked = loadBill(FIXTURE)
  clerked.status = 'applied'
  clerked.bill.number = 99
  clerked.history = [{ date: '2026-01-01', to: 'applied', actor: 'ICC' }]
  clerked.approvals = []
  clerked.enactment = { act_number: 42 }
  assert.equal(substantiveHash(clerked), h, 'clerking must not move the hash')

  const edited = loadBill(FIXTURE)
  edited.operations[0].text = (edited.operations[0].text ?? '') + ' one more sentence.'
  assert.notEqual(substantiveHash(edited), h, 'editing an operation must move the hash')

  const retitled = loadBill(FIXTURE)
  retitled.bill.short_title = 'A different bill entirely'
  assert.notEqual(substantiveHash(retitled), h)
})
