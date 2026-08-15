/**
 * The ICC desk, driven in a real browser, on a fixture.
 *
 * The claim under test is not that the desk works — it is that the desk has no
 * authority. Everything it produces is re-verified downstream: `act enact`
 * recomputes the Article 16(3) thresholds from the tallies, re-reads every
 * evidence file from disk and re-checks its checksum. So the run here ends
 * twice: once with a record `act enact` accepts, and once with the same record
 * tampered with, refused for exactly the reason the tampering deserves.
 *
 * The Guild does not exist. Nothing here is anyone's law.
 *
 * Not part of `npm test`; run with `npm run test:e2e`.
 */
import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import yaml from 'js-yaml'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { serve, launch, findChrome, settle, captureDownloads } from './helpers/browser.mjs'
import { substantiveHash } from '../src/bill.mjs'
import { modelFromDoc, buildDraft } from '../src/scripts/bill-derive.mjs'
import { billToYaml } from '../src/scripts/bill-serialise.mjs'
import { actEnact } from '../src/bill-cli.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const YAML_OPTS = { schema: yaml.CORE_SCHEMA }
const CHROME = findChrome()
const PORT = 8143

/** Minutes that are already in the repository, so `act enact` can find them. */
const EVIDENCE = {
  board: 'examples/starter/bills/evidence/fixture-board-minutes.md',
  'intermediate-board': 'examples/starter/bills/evidence/fixture-intermediate-board-minutes.md',
  units: 'examples/starter/bills/evidence/fixture-units-minutes.md'
}

const TALLIES = {
  board: { date: '2026-04-11', mode: 'in-person', place: 'The Lamp House', presiding: 'A. Presider', present: '24', for: '19', against: '3', abstain: '2' },
  'intermediate-board': { date: '2026-04-12', mode: 'in-person', place: 'The Lamp House', presiding: 'A. Presider', present: '15', for: '11', against: '3', abstain: '1' },
  // 20 for, 21 against — below two thirds on its own, and the pooled vote still
  // passes. This is the case that decides which reading of "collectively" the
  // system enforces.
  units: { date: '2026-04-14', mode: 'online', place: 'The Guild call', presiding: 'A. Presider', present: '41', for: '20', against: '21', abstain: '0' }
}

describe('the ICC desk', { skip: !CHROME ? 'no Chrome' : false }, () => {
  let server, browser, tmp, out, draftFile, doc

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icc-'))
    out = path.join(tmp, 'site')
    execFileSync(process.execPath, [path.join(ROOT, 'src/build.mjs')], {
      cwd: ROOT,
      env: {
        ...process.env,
        CONSTITUTION_FILE: 'examples/starter/fixture-constitution.yaml',
        VERSIONS_DIR: 'examples/starter/versions',        // absent on purpose
        REGISTER_FILE: 'examples/starter/register.yaml',  // absent on purpose
        OUT_DIR: path.relative(ROOT, out),
        OG_DIR: path.relative(ROOT, path.join(tmp, 'og')),
        PROPOSE_ENABLED: 'true',
        BASE_PATH: '/',
        SITE_ORIGIN: 'https://example.org'
      },
      stdio: 'pipe'
    })

    doc = yaml.load(fs.readFileSync(path.join(ROOT, 'examples/starter/fixture-constitution.yaml'), 'utf8'), YAML_OPTS)
    const model = modelFromDoc(doc)
    model.articles.find(a => a.id === 'art-1').content =
      'The Guild shall be known as the Marrow Vale Lamplighters and Wickwrights.\n'

    draftFile = path.join(tmp, 'proposal.yaml')
    fs.writeFileSync(draftFile, billToYaml(buildDraft({
      baseDoc: doc,
      model,
      meta: {
        name: 'Orla Fenn',
        role: 'Keeper of the Oil',
        membership_id: 'MVL-0042',
        short_title: 'An Act to amend the name of the Guild',
        objects_and_reasons: 'Because the wickwrights asked to be named in Article 1.'
      },
      today: '2026-02-03'
    })))

    server = await serve(out, PORT)
    browser = await launch()
  })

  after(async () => {
    await browser?.close()
    await new Promise(r => server?.close(r))
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  /** Clerk the fixture bill through the page and return the downloaded record. */
  async function clerk ({ tallies = TALLIES, attach = true } = {}) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    await page.goto(`http://localhost:${PORT}/icc/`, { waitUntil: 'networkidle0' })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'networkidle0' })

    await (await page.$('#bill-file')).uploadFile(draftFile)
    await page.waitForFunction(() => !document.querySelector('#manifest')?.closest('[data-stage]')?.hidden,
      { timeout: 6000 })

    await page.evaluate(d => {
      const set = (sel, v) => {
        const n = document.querySelector(sel)
        n.value = v
        n.dispatchEvent(new Event('input', { bubbles: true }))
      }
      set('#scheduled-date', '2026-03-20')
      set('#actor', 'The Keeper of the Roll')
      for (const [body, vals] of Object.entries(d)) {
        const card = document.querySelector(`.body-card[data-body="${body}"]`)
        for (const [k, v] of Object.entries(vals)) {
          const input = card.querySelector(`[data-role="${k}"]`)
          input.value = v
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
      }
    }, tallies)
    await settle(400)

    const verdicts = await page.evaluate(() => ({
      perBody: [...document.querySelectorAll('.body-card__verdict')].map(n => n.textContent.trim()),
      overall: document.querySelector('#verdict').textContent.replace(/\s+/g, ' ').trim()
    }))

    if (attach) {
      for (const [body, rel] of Object.entries(EVIDENCE)) {
        // The path is a suggestion, not a rule: the coordinator points it where
        // the document will actually be filed. Here that is a file already in
        // the repository, so `act enact` can read and re-hash it.
        await page.evaluate((b, p) => {
          const input = document.querySelector(`.body-card[data-body="${b}"] [data-role="path"]`)
          input.value = p
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }, body, rel)
        await (await page.$(`.body-card[data-body="${body}"] [data-role="file"]`))
          .uploadFile(path.join(ROOT, rel))
        await settle(250)
        // The upload fills the suggested path; put ours back.
        await page.evaluate((b, p) => {
          const input = document.querySelector(`.body-card[data-body="${b}"] [data-role="path"]`)
          input.value = p
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }, body, rel)
        await settle(150)
      }
    }
    await settle(400)

    const ready = await page.evaluate(() => ({
      enabled: !document.querySelector('#icc-download').disabled,
      report: document.querySelector('#icc-report').textContent.replace(/\s+/g, ' ').trim(),
      resolution: document.querySelector('#resolution').textContent.trim()
    }))

    let record = null
    if (ready.enabled) {
      record = (await captureDownloads(page, 1, '#icc-download'))[0]
    }
    await page.close()
    return { verdicts, ready, record, errors }
  }

  test('a stale proposal is refused, and sent back to be re-made', async () => {
    const stale = path.join(tmp, 'stale.yaml')
    const bill = yaml.load(fs.readFileSync(draftFile, 'utf8'), YAML_OPTS)
    bill.bill.base_version = '1.0.0'
    fs.writeFileSync(stale, billToYaml(bill))

    const page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}/icc/`, { waitUntil: 'networkidle0' })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'networkidle0' })
    await (await page.$('#bill-file')).uploadFile(stale)
    await page.waitForFunction(() => /cannot be clerked/i.test(document.querySelector('#upload-report').textContent),
      { timeout: 6000 })

    const said = (await page.$eval('#upload-report', el => el.textContent)).replace(/\s+/g, ' ')
    assert.match(said, /drafted against constitution version 1\.0\.0/)
    assert.match(said, /re-opens it on the propose page/i,
      'the fix happens where the person who wrote the words is looking at them')
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('[data-stage]')].every(s => s.hidden)),
      'nothing may be clerked on a stale file')
    await page.close()
  })

  test('the verdict is per body, live, and the stricter reading governs', async () => {
    const { verdicts, errors } = await clerk({ attach: false })
    assert.deepEqual(errors, [])
    assert.match(verdicts.perBody[0], /19 of 22 present and voting — 86\.4% — above two thirds/)
    assert.match(verdicts.perBody[1], /11 of 14 present and voting — 78\.6% — above two thirds/)
    assert.match(verdicts.perBody[2], /20 of 41 present and voting — 48\.8% — below two thirds/)
    assert.match(verdicts.perBody[0], /2 abstained, and abstentions are outside the denominator/)

    // 50 for, 77 voting pooled = 64.9%, which does not pass either — so the
    // sentence about the pooled reading must not appear when it would be false.
    assert.match(verdicts.overall, /has not been approved/i)
    assert.match(verdicts.overall, /The units did not reach two thirds/)
  })

  test('a body that fails while the pooled vote passes still fails', async () => {
    // 19+11+30 = 60 for of 22+14+41 = 77 voting → 77.9% pooled, and the units
    // alone are at 30/41 = 73.2%… so make the units fail while the pool passes.
    const tallies = structuredClone(TALLIES)
    tallies.units = { ...tallies.units, present: '41', for: '22', against: '19', abstain: '0' }
    const { verdicts } = await clerk({ tallies, attach: false })
    // board 19/22 + ib 11/14 + units 22/41 = 52 of 77 = 67.5% pooled: passes.
    assert.match(verdicts.perBody[2], /below two thirds/)
    assert.match(verdicts.overall, /has not been approved/i)
    assert.match(verdicts.overall, /pooled vote across all three bodies does pass/,
      'the coordinator is told the pooled vote passes AND that it does not govern')
    assert.match(verdicts.overall, /stricter reading governs/)
  })

  test('the record it generates is one `act enact` accepts', async () => {
    const tallies = structuredClone(TALLIES)
    tallies.units = { ...tallies.units, for: '28', against: '9', abstain: '4' }
    const { ready, record, errors } = await clerk({ tallies })
    assert.deepEqual(errors, [])
    assert.ok(ready.enabled, `should be ready to generate; the page said: ${ready.report}`)
    assert.ok(record, 'no record was downloaded')

    const parsed = yaml.load(record, YAML_OPTS)
    assert.equal(parsed.status, 'approved')
    assert.equal(parsed.bill.number, 1, 'the ICC numbers a bill at submission')
    assert.deepEqual(parsed.history.map(h => h.to), ['submitted', 'scheduled', 'approved'])
    assert.match(ready.resolution, /^This meeting resolves on Bill 1 of 2026, substantive hash [a-f0-9]{64}\.$/)

    // Every approval binds to the text as voted, and the hash on screen is the
    // hash of the file — the check that caught the trailing-newline defect.
    const hash = substantiveHash(parsed)
    assert.ok(ready.resolution.includes(hash), 'the sentence read into the minutes names the file\'s own hash')
    for (const a of parsed.approvals) {
      assert.equal(a.bill_sha256, hash)
      assert.equal(a.recorded_by, 'The Keeper of the Roll')
      // Computed in the browser, over the exact bytes.
      const abs = path.join(ROOT, a.evidence.path)
      assert.equal(a.evidence.sha256, crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'),
        'the browser\'s fingerprint must equal the one the CLI computes from the file on disk')
    }

    // Enactment is not the desk's, and the file says so.
    for (const v of Object.values(parsed.enactment ?? {})) assert.equal(v, null)

    const file = path.join(tmp, 'record.yaml')
    fs.writeFileSync(file, record)
    const signed = EVIDENCE.board
    const r = actEnact(file, { signedPdf: signed, signedBy: 'Orla Fenn', constitution: doc })
    assert.equal(r.actNumber, 1)
    assert.equal(yaml.load(fs.readFileSync(file, 'utf8'), YAML_OPTS).status, 'enacted')
  })

  test('a tampered tally in that same record is refused', async () => {
    const tallies = structuredClone(TALLIES)
    tallies.units = { ...tallies.units, for: '28', against: '9', abstain: '4' }
    const { record } = await clerk({ tallies })

    // The tally is edited after the fact. Nothing about the bill's own text
    // moved, so the substantive hash still matches every approval — the forgery
    // is caught by RECOMPUTING the threshold, not by the hash.
    const tampered = yaml.load(record, YAML_OPTS)
    tampered.approvals.find(a => a.body === 'units').for = 2
    const file = path.join(tmp, 'tampered.yaml')
    fs.writeFileSync(file, billToYaml(tampered, { header: false }))

    assert.equal(substantiveHash(tampered), tampered.approvals[0].bill_sha256,
      'the hash is untouched: a tally is not part of what a body voted on')
    assert.throws(() => actEnact(file, { signedPdf: EVIDENCE.board, constitution: doc }),
      /Below the threshold in: units/,
      'a hand-forged tally fails at the gate exactly as it would if the page had never been built')
  })

  test('a record whose minutes are not on disk is refused', async () => {
    const tallies = structuredClone(TALLIES)
    tallies.units = { ...tallies.units, for: '28', against: '9', abstain: '4' }
    const { record } = await clerk({ tallies })

    const missing = yaml.load(record, YAML_OPTS)
    missing.approvals.find(a => a.body === 'board').evidence.path =
      'bills/2026/evidence/bill-1-2026-board-minutes.pdf'
    const file = path.join(tmp, 'missing-pdf.yaml')
    fs.writeFileSync(file, billToYaml(missing, { header: false }))

    assert.throws(() => actEnact(file, { signedPdf: EVIDENCE.board, constitution: doc }),
      /is not in the repository|A live link is never evidence/,
      'a record naming a document nobody can produce is an assertion, not evidence')
  })

  test('a tally with no minutes behind it cannot even be generated', async () => {
    const tallies = structuredClone(TALLIES)
    tallies.units = { ...tallies.units, for: '28', against: '9', abstain: '4' }
    const { ready } = await clerk({ tallies, attach: false })
    assert.equal(ready.enabled, false)
    assert.match(ready.report, /a tally with no signed record behind it is an assertion/i)
  })

  test('the desk is operable from the keyboard, and says what it cannot do', async () => {
    const page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}/icc/`, { waitUntil: 'networkidle0' })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'networkidle0' })

    const text = (await page.evaluate(() => document.body.textContent)).replace(/\s+/g, ' ')
    assert.match(text, /It writes down\. It does not decide/)
    assert.match(text, /does not enact or apply/i)
    assert.match(text, /Nothing is uploaded anywhere/i)

    await (await page.$('#bill-file')).uploadFile(draftFile)
    await page.waitForFunction(() => !document.querySelector('#bodies')?.closest('[data-stage]')?.hidden,
      { timeout: 6000 })

    // Every tally field is reachable in order, from the keyboard alone.
    // From the mode select, because a date input's own day/month/year segments
    // are Tab stops of their own inside Chrome.
    await page.focus('.body-card[data-body="board"] [data-role="mode"]')
    const walk = []
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab')
      walk.push(await page.evaluate(() => document.activeElement.dataset.role ?? null))
    }
    assert.deepEqual(walk, ['place', 'presiding', 'present', 'for', 'against'])

    await page.keyboard.press('Tab')
    await page.keyboard.type('3')
    await settle(300)
    assert.match(await page.$eval('.body-card[data-body="board"] [data-role="verdict"]', el => el.textContent),
      /Enter the numbers voting for and against/,
      'abstentions alone decide nothing — the threshold is of those present AND voting')
    await page.close()
  })
})
