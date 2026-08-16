/**
 * Continuing a proposal after the constitution moves.
 *
 * A SECOND, fixture site is built on the fly: the Marrow Vale constitution
 * moved from 2.1.0 to 2.2.0, with its 2.1.0 snapshot published in the archive
 * exactly as a real superseded version is. That is the only way to exercise all
 * three arms of the rebase in a browser, because telling a carried-over edit
 * from a clashing one requires the version the proposer actually drafted
 * against.
 *
 * It lives in its own FILE, not merely its own suite. Sharing a process with
 * the editor suite made Node's runner abort the whole file mid-flight
 * (`cancelledByParent`), cancelling tests that had not failed — a build and two
 * browsers competing for one event loop. Files run in separate processes; that
 * is the fix, rather than a larger timeout on a test that was never slow.
 *
 * Not part of `npm test`; run with `npm run test:e2e`.
 */
import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { findChrome, serve, launch, settle, captureDownloads } from './helpers/browser.mjs'
import { modelFromDoc, buildDraft } from '../src/scripts/bill-derive.mjs'
import { billToYaml } from '../src/scripts/bill-serialise.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const YAML_OPTS = { schema: yaml.CORE_SCHEMA }
const CHROME = findChrome()

// ---------------------------------------------------------------------------
// The rebase, against a constitution that moved
// ---------------------------------------------------------------------------

describe('continuing a proposal after the constitution moves', {
  skip: !CHROME ? 'no Chrome' : false
}, () => {
  const PORT = 8142
  let server, browser, tmp, out, staleFile

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rebase-'))
    out = path.join(tmp, 'site')
    // A fixture site: the Guild's constitution at 2.2.0, with 2.1.0 published
    // in the archive exactly as a real superseded version is.
    // Asynchronous deliberately. execFileSync blocks the whole event loop for
    // the length of a site build, and a sibling suite's puppeteer timers fire
    // the instant it unblocks — a 5s waitForFunction "timing out" against a
    // page that was never slow. That was the flake; the page was fine.
    await promisify(execFile)(process.execPath, [path.join(ROOT, 'src/build.mjs')], {
      cwd: ROOT,
      env: {
        ...process.env,
        CONSTITUTION_FILE: 'examples/starter/fixture-constitution-moved.yaml',
        VERSIONS_DIR: 'examples/starter/fixture-versions',
        REGISTER_FILE: 'examples/starter/register.yaml',   // absent on purpose
        OUT_DIR: path.relative(ROOT, out),
        OG_DIR: path.relative(ROOT, path.join(tmp, 'og')),
        PROPOSE_ENABLED: 'true',
        BASE_PATH: '/',
        SITE_ORIGIN: 'https://example.org'
      },
      stdio: 'pipe'
    })

    // A proposal drafted against 2.1.0, touching one target of each kind.
    const base = yaml.load(
      fs.readFileSync(path.join(ROOT, 'examples/starter/fixture-constitution.yaml'), 'utf8'), YAML_OPTS)
    const model = modelFromDoc(base)
    const art = id => model.articles.find(a => a.id === id)
    art('art-1').content = 'PROPOSER EDIT: this target will not move.\n'
    art('art-2').content = base.articles.find(a => a.id === 'art-2').content
      .replace('at height.', 'at height;\n4. to keep the Vale\'s clocks wound.')
    art('art-5').content = 'PROPOSER EDIT: this target moves underneath them.\n'

    staleFile = path.join(tmp, 'stale-proposal.yaml')
    fs.writeFileSync(staleFile, billToYaml(buildDraft({
      baseDoc: base,
      model,
      meta: {
        name: 'Orla Fenn',
        membership_id: 'MVL-0042',
        short_title: 'An Act drafted before the constitution moved',
        objects_and_reasons: 'Because a proposal may sit while other Acts pass.'
      },
      today: '2026-01-15'
    })))

    server = await serve(out, PORT)
    browser = await launch()
  })

  after(async () => {
    await browser?.close()
    await new Promise(r => server?.close(r))
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test('the fixture site publishes the snapshot the rebase needs', () => {
    const snapshot = JSON.parse(fs.readFileSync(path.join(out, 'archive/2.1.0/constitution.json'), 'utf8'))
    assert.equal(snapshot.version, '2.1.0')
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'constitution.json'), 'utf8')).version, '2.2.0')
  })

  test('one carries, one is dropped as already enacted, one demands re-making', async () => {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    await page.goto(`http://localhost:${PORT}/propose/`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('.prov__text', { timeout: 5000 })

    const input = await page.$('#upload')
    await input.uploadFile(staleFile)
    await page.waitForFunction(
      () => /re-made against/i.test(document.querySelector('#rebase-report').textContent),
      { timeout: 6000 })
    await settle(400)

    const said = (await page.$eval('#rebase-report', el => el.textContent)).replace(/\s+/g, ' ')
    assert.match(said, /re-made against version 2\.2\.0/i)
    assert.match(said, /1 change carried over unchanged.*Article 1/i)
    assert.match(said, /Article 2 already reads the way you proposed/i)
    assert.match(said, /1 change needs re-making/i)

    // The conflict is shown side by side, and nothing was carried for it.
    const conflict = await page.evaluate(() => {
      const c = document.querySelector('.conflict')
      return {
        what: c.querySelector('.conflict__what').textContent.trim(),
        panes: [...c.querySelectorAll('pre')].map(p => p.textContent.trim())
      }
    })
    assert.equal(conflict.what, 'Article 5')
    assert.match(conflict.panes[0], /eleven lamplighters/, 'what the constitution says now')
    assert.match(conflict.panes[1], /PROPOSER EDIT/, 'beside what they had proposed')

    const state = await page.evaluate(() => ({
      count: document.querySelector('#change-count').textContent.trim(),
      art1: document.querySelector('#t-art-1').value,
      art5: document.querySelector('#t-art-5').value
    }))
    assert.match(state.count, /proposing 1 change/, 'only the carried edit survived')
    assert.match(state.art1, /PROPOSER EDIT/, 'the carried edit is re-made in the document')
    assert.match(state.art5, /eleven lamplighters/,
      'the conflicted provision shows what the constitution says now, never the stale text')

    // Re-make the conflicted change and the proposal is whole again — against
    // the current version, which is the only version this page can produce.
    await page.evaluate(() => {
      const t = document.querySelector('#t-art-5')
      t.value = 'The proposer amends the rewritten Article 5.\n'
      t.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await settle(700)

    const [billYaml] = await captureDownloads(page, 2, '#generate')
    const parsed = yaml.load(billYaml, YAML_OPTS)
    assert.equal(parsed.bill.base_version, '2.2.0',
      '"based on the latest constitution" is not a rule anyone follows — it is all this page can emit')
    assert.deepEqual(parsed.operations.map(o => o.target), ['art-1', 'art-5'])
    assert.deepEqual(errors, [])
    await page.close()
  })
})
