/**
 * Guards the provenance normaliser.
 *
 * The regression these tests exist for: a normaliser that strips punctuation
 * before tags turns `<br>` into the word `br`, injects it mid-string, and
 * reports a provision that IS amended as NOT-APPLIED. Acting on that verdict
 * would re-apply an amendment already in force.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalise, stripTags, similarity, classify, MATCH_THRESHOLD } from '../src/text-compare.mjs'

// The real pair. Left: constitution/current.yaml art-9, inline <br> and all.
// Right: Act 1 of 2024, "Amendment to Article 9" (acts/text/…act-2024.txt:55-74).
const V2_ARTICLE_9 = `1. The board members are responsible for proper functioning of the NGO by guiding IBM. <br>
2. The board members are responsible for all activities of the NGO, but they are not held responsible for any activity undertaken by any member without informing the authorized person. <br>
3. Any new establishments and any modifications shall be done with the final document approval of the board. <br>
4. Board holds the ultimate powers over the STM and its final decisions <br>
5. The board consists of the following members: <br>
    1. President
    2. Vice President
    3. General Secretary
    4. Treasurer
    5. Joint Secretary
    6. Executive Members
6. All the board members should abide by the rules and regulations of the NGO and work according to the constitution of the NGO and by-laws of the NGO. <br>`

const ACT1_ARTICLE_9 = `(1) The board members are responsible for proper functioning of the NGO by guiding
IBM.
(2) The board members are responsible for all activities of the NGO, but they are not
held responsible for any activity undertaken by any member without informing the
authorized person.
(3) Any new establishments and any modifications shall be done with the final
document approval of the board.
(4) Board holds the ultimate powers over the STM and its final decisions
(5) The board consists of the following members:
            1. President
            2. Vice President
            3. General Secretary
            4. Treasurer
            5. Joint Secretary
            6. Executive Members
(6) All the board members should abide by the rules and regulations of the NGO and
work according to the constitution of the NGO and by-laws of the NGO.`

// ---------------------------------------------------------------------------

test('tags are stripped to a space, never to nothing', () => {
  assert.equal(stripTags('a<br>b').trim(), 'a b')
  assert.ok(!normalise('word<br>word').includes('wordword'),
    'removing a tag must not weld two words together')
})

test('no HTML tag survives normalisation as a word', () => {
  for (const tag of ['<br>', '<br/>', '<br />', '<b>', '</b>', '<p>', '<span class="x">']) {
    const out = normalise(`alpha ${tag} beta`)
    assert.equal(out, 'alpha beta', `tag ${tag} leaked into the normalised form as: "${out}"`)
  }
})

test('THE FIXTURE: a <br>-laden provision matching its Act classifies ALREADY-APPLIED', () => {
  const { verdict, simEnacted } = classify(V2_ARTICLE_9, ACT1_ARTICLE_9, null)
  assert.equal(verdict, 'ALREADY-APPLIED',
    `Article 9 carries Act 1 text; got ${verdict} at similarity ${simEnacted.toFixed(4)}. ` +
    'If this fails, the normaliser is wrong — do not trust any provenance verdict.')
  assert.ok(simEnacted > 0.99, `expected near-identity, got ${simEnacted.toFixed(4)}`)
})

test('the naive normaliser this guards against would have failed', () => {
  // Punctuation first, tags never: exactly the mistake that produced a false NOT-APPLIED.
  const naive = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
  assert.ok(naive(V2_ARTICLE_9).includes(' br '),
    'sanity: the naive form should contain the stray token this test exists to prevent')
  assert.ok(!normalise(V2_ARTICLE_9).includes(' br '),
    'the real normaliser must not contain the stray token')
})

test('enumerator style does not affect equivalence', () => {
  assert.equal(similarity('(1) Alpha beta. (2) Gamma delta.', '1. Alpha beta.\n2. Gamma delta.'), 1)
  assert.equal(similarity('- (a) Alpha beta', '(a) Alpha beta'), 1)
})

test('typographic variants fold together', () => {
  assert.equal(normalise('“Alumni” refers to the member'), normalise('"Alumni" refers to the member'))
  assert.equal(normalise("members’ duties"), normalise("members' duties"))
})

test('genuinely different text stays below the match threshold', () => {
  const a = 'Any person who donates at least INR 30 shall be called STM DONOR.'
  const b = 'The duration of the internship program is two years.'
  assert.ok(similarity(a, b) < MATCH_THRESHOLD)
  assert.equal(classify(a, b, a).verdict, 'NOT-APPLIED')
})

test('text matching neither source is DIVERGENT and is never auto-resolved', () => {
  const { verdict } = classify(
    'Something nobody enacted at all, written by hand.',
    'The Act prescribes this text.',
    'The prior text said this instead.'
  )
  assert.equal(verdict, 'DIVERGENT')
})

test('an insertion that has not happened yet is NOT-APPLIED, not DIVERGENT', () => {
  assert.equal(classify('', 'New article text prescribed by the Act.', null).verdict, 'NOT-APPLIED')
})
