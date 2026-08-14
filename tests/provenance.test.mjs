/**
 * Regressions for two bugs that each produced a wrong provenance verdict.
 * Both were silent: the output looked plausible and was wrong.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadActs } from '../src/acts-parse.mjs'
import { verdictFor } from '../src/provenance.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const acts = loadActs(ROOT)
const all = acts.flatMap(a => a.provisions)

test('a clause beginning after a PDF page break is not lost', () => {
  // Article 7 clause (6) begins immediately after a form feed. \f is not a JS
  // line terminator, so `^[ \t]*\(` never matched and the clause vanished
  // from the analysis without any error.
  const art7 = all.find(p => p.target === 'art-7')
  assert.ok(art7, 'Act 1 must amend art-7')
  assert.equal(art7.clauses, '4,6')
  assert.ok(!art7.text.includes('\f'), 'form feeds must be normalised away')
  const found = [...art7.text.matchAll(/^[ \t]*\((\d+)\)/gm)].map(m => Number(m[1]))
  assert.deepEqual(found, [4, 6], 'both clauses the heading names must be recoverable')
})

test('every clause-scope heading yields exactly the clauses it names', () => {
  for (const p of all.filter(x => x.scope === 'clause')) {
    const expected = p.clauses.split(',').map(Number).sort((a, b) => a - b)
    const found = [...p.text.matchAll(/^[ \t]*\((\d+)\)/gm)].map(m => Number(m[1])).sort((a, b) => a - b)
    assert.deepEqual(found, expected, `${p.target}: heading names ${expected} but body yields ${found}`)
  }
})

test('an Act that rewrites a provision heavily does not make it DIVERGENT', () => {
  // The provision is word for word its own pre-Act text. That is NOT-APPLIED.
  // Scoring only against the Act reports DIVERGENT, which would send an
  // untouched provision to the board as an unauthorised edit.
  const prior = 'Any person who is willing to serve the society and who is willing to abide by ' +
    'the rules and regulations of the NGO to serve the STM for the lifetime and manage every thing in the STM.'
  const current = prior
  const enacted = 'Board Member: Any person who is willing to serve society and abide by the rules ' +
    'and regulations of the NGO to work in STM for lifetime.'

  const r = verdictFor(current, enacted, prior, { contained: true })
  assert.equal(r.verdict, 'NOT-APPLIED',
    `expected NOT-APPLIED for text identical to its pre-Act form, got ${r.verdict}`)
  assert.equal(r.drift, 1, 'drift must be 1.0 when current and prior are identical')
  assert.ok(r.simEnacted < 0.94, 'sanity: the Act text really is a heavy rewrite')
})

test('text matching neither the Act nor the pre-Act text stays DIVERGENT', () => {
  const r = verdictFor('Wholly unrelated wording nobody enacted.', 'The Act says this.', 'The prior text said that.', { contained: false })
  assert.equal(r.verdict, 'DIVERGENT')
})

test('an insertion not yet made is NOT-APPLIED', () => {
  const r = verdictFor(null, 'New article the Act inserts.', null, { contained: false })
  assert.equal(r.verdict, 'NOT-APPLIED')
})

test('the three Acts yield the expected operative scope', () => {
  const byTarget = Object.fromEntries(all.map(p => [p.target + (p.clauses ? `(${p.clauses})` : ''), p]))
  // Clause-scope only where the heading names clauses; full substitution otherwise.
  assert.equal(byTarget['art-6(1,2,3,4,5)'].scope, 'clause')
  assert.equal(byTarget['art-7(4,6)'].scope, 'clause')
  assert.equal(byTarget['art-16(3)'].scope, 'clause')
  assert.equal(byTarget['art-17(1)'].scope, 'clause')
  assert.equal(byTarget['art-9'].scope, 'article')
  assert.equal(byTarget['art-10'].scope, 'article')
  // Insertions
  for (const t of ['art-18', 'art-20', 'art-21']) assert.equal(byTarget[t].operation, 'insert')
  assert.equal(all.length, 19, 'three Acts enact 19 operative provisions')
})
