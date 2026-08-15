/**
 * The Phase 2 invariants, asserted rather than assumed.
 *
 * These exist because the previous renderer derived article numbers from array
 * position, which meant reordering the YAML silently re-pointed every citation
 * in every Amendment Act.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { validateDocument, provisionsOf, anchorsOf, ROOT } from '../src/validate.mjs'

const live = () => yaml.load(
  fs.readFileSync(path.join(ROOT, 'constitution/current.yaml'), 'utf8'),
  { schema: yaml.CORE_SCHEMA }
)

const codes = rep => rep.errors.map(e => e.code)

// ---------------------------------------------------------------------------

test('reordering articles changes no anchor and no citation', () => {
  const original = live()
  const before = anchorsOf(original)

  const shuffled = structuredClone(original)
  const a = shuffled.articles.findIndex(x => x.number === 3)
  const b = shuffled.articles.findIndex(x => x.number === 15)
  ;[shuffled.articles[a], shuffled.articles[b]] = [shuffled.articles[b], shuffled.articles[a]]
  shuffled.articles.reverse()

  assert.deepEqual([...anchorsOf(shuffled)].sort(), [...before].sort(),
    'anchor set changed when the article order changed')

  for (const p of provisionsOf(shuffled)) {
    if (p.kind === 'article') assert.equal(p.id, `art-${p.number}`)
    if (p.kind === 'section') assert.equal(p.id, `art-${p.parent.number}-s-${p.number}`)
  }

  // Reordering must not introduce validation errors beyond those already present.
  assert.deepEqual(codes(validateDocument(shuffled)).sort(), codes(validateDocument(original)).sort())
})

test('removing a content key fails validation instead of breaking the site', () => {
  const doc = live()
  const target = doc.articles.find(a => a.content && a.content.trim())
  delete target.content
  assert.ok(codes(validateDocument(doc)).includes('schema'),
    'a missing content key must be a hard error')
})

test('empty and whitespace-only content are rejected too', () => {
  for (const value of ['', '   ', '\n\n']) {
    const doc = live()
    doc.articles.find(a => a.number === 1).content = value
    assert.ok(codes(validateDocument(doc)).includes('schema'),
      `content ${JSON.stringify(value)} must be rejected`)
  }
})

test('a silent numbering gap fails; a reserved entry accounting for it passes', () => {
  const doc = live()
  const max = Math.max(...doc.articles.map(a => a.number))

  // Insert an article at max + 2, leaving max + 1 unaccounted for.
  doc.articles.push({ id: `art-${max + 2}`, number: max + 2, title: 'Later', content: 'text' })
  assert.ok(codes(validateDocument(doc)).includes('number-gap'),
    'an unexplained gap must fail')

  // Now account for the gap the way a statute book does.
  doc.articles.push({
    id: `art-${max + 1}`,
    number: max + 1,
    title: 'Reserved',
    status: 'reserved',
    note: 'No instrument has occupied this number.'
  })
  assert.ok(!codes(validateDocument(doc)).includes('number-gap'),
    'a reserved entry must close the gap')
})

test('a reserved article may not carry text, and must carry a note', () => {
  const doc = live()
  const max = Math.max(...doc.articles.map(a => a.number))
  doc.articles.push({ id: `art-${max + 1}`, number: max + 1, title: 'R', status: 'reserved', content: 'text' })
  assert.ok(codes(validateDocument(doc)).includes('schema'))

  const doc2 = live()
  const max2 = Math.max(...doc2.articles.map(a => a.number))
  doc2.articles.push({ id: `art-${max2 + 1}`, number: max2 + 1, title: 'R', status: 'reserved' })
  assert.ok(codes(validateDocument(doc2)).includes('schema'), 'reserved without a note must fail')
})

test('id must agree with number, so identity can never drift from citation', () => {
  const doc = live()
  doc.articles.find(a => a.number === 5).id = 'art-6'
  assert.ok(codes(validateDocument(doc)).includes('id-duplicate'))
  assert.ok(codes(validateDocument(doc)).includes('id-number-mismatch'))

  const doc2 = live()
  const art = doc2.articles.find(a => a.sections?.length)
  art.sections[0].id = `art-${art.number}-s-99`
  assert.ok(codes(validateDocument(doc2)).includes('id-number-mismatch'))
})

test('duplicate numbers are rejected', () => {
  const doc = live()
  doc.articles.find(a => a.number === 4).number = 3
  assert.ok(codes(validateDocument(doc)).includes('number-duplicate'))
})

test('placeholder URLs in info are rejected', () => {
  const doc = live()
  doc.info.contact = { ...doc.info.contact, url: 'https://example.com/contact' }
  assert.ok(codes(validateDocument(doc)).includes('placeholder-url'))
})

test('the live constitution carries a permanent id for every provision', () => {
  const doc = live()
  const provisions = provisionsOf(doc)
  assert.ok(provisions.length > 0)
  for (const p of provisions) {
    assert.match(p.id, /^(preamble|art-[1-9]\d*(-s-[1-9]\d*)?)$/,
      `provision at ${p.where} has a malformed id: ${p.id}`)
  }
  assert.equal(new Set(provisions.map(p => p.id)).size, provisions.length, 'ids must be unique')
})
