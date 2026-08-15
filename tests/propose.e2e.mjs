/**
 * The document editor, driven in a real browser.
 *
 * The assertions that matter: what the proposer's edits derive must be what the
 * CLI accepts, and the reference number on screen must equal the hash the CLI
 * computes from the downloaded file. Two implementations of either would be
 * free to drift — the class of failure this project began with, when the docs,
 * the specs and the renderer each described a different root key.
 *
 * The rebase matrix runs against a SECOND, fixture site built on the fly: the
 * Marrow Vale constitution moved on from 2.1.0 to 2.2.0, with its 2.1.0
 * snapshot published in the archive exactly as a real one would be. That is the
 * only way to exercise all three arms in a browser, because telling a
 * carried-over edit from a clashing one requires the version the proposer
 * actually drafted against.
 *
 * Not part of `npm test`; run with `npm run test:e2e`. Skips cleanly with no
 * Chrome rather than failing the build.
 */
import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { findChrome, serve, launch, settle, captureDownloads } from './helpers/browser.mjs'
import { substantiveHash, validateBill } from '../src/bill.mjs'
import { modelFromDoc, buildDraft } from '../src/scripts/bill-derive.mjs'
import { billToYaml } from '../src/scripts/bill-serialise.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const YAML_OPTS = { schema: yaml.CORE_SCHEMA }

// ---------------------------------------------------------------------------

const CHROME = findChrome()

describe('the document editor', {
  skip: !CHROME || !fs.existsSync(path.join(DIST, 'propose/index.html'))
    ? 'no Chrome, or built without PROPOSE_ENABLED' : false
}, () => {
  const PORT = 8141
  let server, browser, tmp

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'propose-'))
    server = await serve(DIST, PORT)
    browser = await launch()
  })

  after(async () => {
    await browser?.close()
    await new Promise(r => server?.close(r))
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  const open = async () => {
    const page = await browser.newPage()
    page.errors = []
    page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()) })
    page.on('pageerror', e => page.errors.push(e.message))
    await page.goto(`http://localhost:${PORT}/propose/`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('.prov__text', { timeout: 5000 })
    return page
  }

  const identify = async page => {
    await page.type('#p-name', 'Orla Fenn')
    await page.type('#p-id', 'STM-0042')
    await page.type('#p-title', 'An Act to amend the constitution')
    await page.type('#p-objects', 'Because the end-to-end run must exercise every kind of change.')
  }

  /** Edit a provision's text or heading the way a person typing would. */
  const edit = (page, id, { text, title }) => page.evaluate((id, text, title) => {
    if (text != null) {
      const t = document.querySelector(`#t-${id}`)
      t.value = text
      t.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (title != null) {
      const h = document.querySelector(`#h-${id}`)
      h.value = title
      h.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }, id, text ?? null, title ?? null)

  // Two files: the proposal, and the readable copy of it.
  const download = page => captureDownloads(page, 2, '#generate')

  test('the page opens the constitution itself, not a form about it', async () => {
    const page = await open()
    const shape = await page.evaluate(() => {
      // The page's OWN words, with the constitution and the derived output
      // taken out — Article 6 has an "Operations Coordinator" in it, and the
      // constitution's vocabulary is not the page's.
      const copy = document.body.cloneNode(true)
      for (const id of ['editor', 'changes', 'preview', 'rebase-report', 'check-report']) {
        copy.querySelector(`#${id}`)?.remove()
      }
      return {
        provisions: document.querySelectorAll('.prov').length,
        editable: document.querySelectorAll('.prov__text').length,
        headings: document.querySelectorAll('input.prov__title').length,
        held: document.querySelectorAll('.prov--held').length,
        heldText: document.querySelector('.prov--held')?.textContent ?? '',
        words: copy.textContent.toLowerCase()
      }
    })
    assert.ok(shape.provisions > 20, 'every provision is on the page')
    assert.equal(shape.editable, shape.provisions - shape.held, 'each one is editable in place')
    assert.equal(shape.headings, shape.editable, 'headings are editable too')

    // Article 19 is reserved. It is shown, because a reader looking for it must
    // find it — and it is not editable, because typing into a reserved
    // provision would give it a body while leaving it marked reserved.
    assert.equal(shape.held, 1)
    assert.match(shape.heldText, /reserved/i)
    assert.match(shape.heldText, /Add a new article/,
      'occupying a held number is a different act, and the page says which one')
    // The Phase 8 vocabulary is gone from the proposer's path entirely.
    for (const jargon of ['yaml', 'operation', 'substitute', 'retitle', 'target', 'github']) {
      assert.ok(!shape.words.includes(jargon), `the proposer must never meet the word "${jargon}"`)
    }
    assert.deepEqual(page.errors, [])
    await page.close()
  })

  test('the boxes hold the raw provision source, not rendered markup', async () => {
    // The invariant: an operation carries what will be PARSED. Hydrating from
    // rendered HTML would put sanitised, entity-escaped prose into a bill.
    const page = await open()
    const [box, published] = await Promise.all([
      page.$eval('#t-art-13', el => el.value),
      fetch(`http://localhost:${PORT}/constitution.json`).then(r => r.json())
        .then(d => d.articles.find(a => a.id === 'art-13').content)
    ])
    assert.equal(box, published, 'the editable text must be the provision source, byte for byte')
    assert.ok(!/&amp;|&lt;|<p>/.test(box), 'nothing rendered has leaked into the editor')
    await page.close()
  })

  test('editing nothing proposes nothing', async () => {
    const page = await open()
    const state = await page.evaluate(() => ({
      count: document.querySelector('#change-count').textContent.trim(),
      ready: !document.querySelector('#generate').disabled
    }))
    assert.match(state.count, /not changed anything/i)
    assert.equal(state.ready, false, 'a proposal that proposes nothing cannot be generated')
    await page.close()
  })

  test('edit two provisions, add a clause, remove one — and the CLI accepts it', async () => {
    const page = await open()
    await identify(page)

    // Two provisions edited.
    const before13 = await page.$eval('#t-art-13', el => el.value)
    await edit(page, 'art-13', { text: before13.trimEnd() + '\nA sentence added by the run.\n', title: 'Annual Report and Returns' })
    await edit(page, 'art-1', { text: 'A restatement of Article 1 for the run.\n' })
    await settle(300)

    // One clause added, to an article that already has clauses.
    await page.evaluate(() => document.querySelector('.prov[data-id="art-10"] [data-act="add-clause"]').click())
    await settle(300)
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.prov[data-id^="art-10-s-"]')]
      const last = cards[cards.length - 1]
      const h = last.querySelector('[data-role="title"]')
      const t = last.querySelector('[data-role="text"]')
      h.value = 'A Clause Added By The Run'
      t.value = 'This clause exists only for the end-to-end run.\n'
      for (const el of [h, t]) el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await settle(300)

    // One article removed, behind a confirmation that shows what disappears.
    await page.evaluate(() => document.querySelector('.prov[data-id="art-20"] [data-act="ask-remove"]').click())
    await settle(200)
    const confirmText = await page.$eval('.prov[data-id="art-20"] .confirm', el => el.textContent)
    assert.match(confirmText, /never reused/, 'the confirmation states what happens to the number')
    assert.ok(confirmText.length > 200, 'and shows the text in full, not a summary')
    await page.evaluate(() => document.querySelector('.prov[data-id="art-20"] [data-act="confirm-remove"]').click())
    await settle(200)
    await page.evaluate(() => {
      const r = document.querySelector('#why-art-20')
      r.value = 'Superseded, for the purposes of this run.'
      r.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await settle(600)

    const state = await page.evaluate(() => ({
      count: document.querySelector('#change-count').textContent.trim(),
      hash: document.querySelector('#hash-out').textContent.trim(),
      ready: !document.querySelector('#generate').disabled,
      report: document.querySelector('#check-report').textContent.replace(/\s+/g, ' ').trim(),
      changes: [...document.querySelectorAll('.change__title')].map(n => n.textContent.trim())
    }))
    // Four provisions were touched, so four changes. The clause added to
    // Article 10 did not become a fifth: it belongs to the restatement of the
    // article that carries it, which is what makes that operation complete.
    assert.match(state.count, /proposing 4 changes/)
    assert.ok(state.ready, `should be ready; the page said: ${state.report}`)
    assert.deepEqual(state.changes.map(c => c.replace(/^\d+\.\s*/, '')),
      ['Change Article 1', 'Change Article 10', 'Change Article 13', 'Remove Article 20'],
      'every change is described in the proposer\'s words, in document order')

    const [billYaml, readable] = await download(page)
    assert.deepEqual(page.errors, [])

    const file = path.join(tmp, 'from-editor.yaml')
    fs.writeFileSync(file, billYaml)
    const parsed = yaml.load(billYaml, YAML_OPTS)

    assert.equal(parsed.status, 'draft', 'the editor produces drafts only')
    assert.equal(parsed.bill.number, null, 'the editor never numbers a bill')
    assert.equal(parsed.bill.moved_by.membership_id, 'STM-0042', 'the membership number is recorded')
    assert.deepEqual(parsed.operations.map(o => `${o.operation} ${o.target}`),
      ['substitute art-1', 'substitute art-10', 'substitute art-13', 'omit art-20'])
    assert.equal(parsed.operations.find(o => o.target === 'art-13').title, 'Annual Report and Returns',
      'a heading edited alongside the text rides on the same operation')

    const { problems } = validateBill(file)
    assert.deepEqual(problems.errors.map(e => `${e.code}: ${e.message}`), [],
      'the CLI must accept what the editor derived')

    // The whole reason the hash exists: the page and the file must agree.
    assert.equal(state.hash, substantiveHash(parsed),
      'the page and the CLI must agree on the number a meeting resolves upon')
    assert.match(state.hash, /^[a-f0-9]{64}$/)

    assert.match(readable, /An Act to amend the constitution/, 'the readable copy renders in house style')
    assert.match(readable, /STATEMENT OF OBJECTS AND REASONS/)
    await page.close()
  })

  test('a removal cannot be generated without a reason', async () => {
    const page = await open()
    await identify(page)
    await page.evaluate(() => document.querySelector('.prov[data-id="art-20"] [data-act="ask-remove"]').click())
    await settle(200)
    await page.evaluate(() => document.querySelector('.prov[data-id="art-20"] [data-act="confirm-remove"]').click())
    await settle(600)
    const state = await page.evaluate(() => ({
      ready: !document.querySelector('#generate').disabled,
      report: document.querySelector('#check-report').textContent.replace(/\s+/g, ' ')
    }))
    assert.equal(state.ready, false)
    assert.match(state.report, /Article 20: say why it is being removed/)
    await page.close()
  })

  test('a new article takes an assigned number, and there is nowhere to type one', async () => {
    const page = await open()
    await page.evaluate(() => document.querySelector('[data-act="add-article"]').click())
    await settle(200)
    const offer = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll('[data-act="new-article"]')].map(b => b.dataset.number),
      typeable: document.querySelectorAll('.number-choice input').length
    }))
    assert.equal(offer.typeable, 0, 'a number is chosen from what is available, never invented')
    assert.ok(offer.buttons.includes('22'), 'the next free number is offered')
    assert.ok(offer.buttons.includes('19'), 'so is the reserved slot, which was held open for exactly this')
    await page.close()
  })

  test('the work survives a reload, and comes back as the same proposal', async () => {
    const page = await open()
    await identify(page)
    await edit(page, 'art-1', { text: 'A restatement kept across a reload.\n' })

    // Waiting on the condition rather than on a clock: saving is debounced, and
    // a fixed sleep that is long enough alone is not long enough with three
    // browsers and a site build competing for the machine. This test read a
    // half-written draft exactly once, in the parallel run, and passed on every
    // isolated re-run — which is what a timing assumption looks like from the
    // outside.
    await page.waitForFunction(() => {
      const d = JSON.parse(localStorage.getItem('opencodelaw.propose.draft.v1') ?? 'null')
      return d?.operations?.length === 1 && d.meta?.name === 'Orla Fenn' &&
        /^[a-f0-9]{64}$/.test(document.querySelector('#hash-out').textContent.trim())
    }, { timeout: 5000 })

    const before = await page.evaluate(() => ({
      hash: document.querySelector('#hash-out').textContent.trim(),
      saved: JSON.parse(localStorage.getItem('opencodelaw.propose.draft.v1'))
    }))
    assert.equal(before.saved.operations.length, 1, 'what is stored is the derived operations')
    assert.ok(!JSON.stringify(before.saved).includes('<'), 'and never any DOM')

    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForSelector('#restore-yes', { timeout: 5000 })
    await page.click('#restore-yes')
    await page.waitForFunction(
      () => /proposing 1 change/.test(document.querySelector('#change-count').textContent) &&
        /^[a-f0-9]{64}$/.test(document.querySelector('#hash-out').textContent.trim()),
      { timeout: 5000 })

    const after = await page.evaluate(() => ({
      hash: document.querySelector('#hash-out').textContent.trim(),
      name: document.querySelector('#p-name').value,
      text: document.querySelector('#t-art-1').value,
      count: document.querySelector('#change-count').textContent.trim()
    }))
    assert.equal(after.hash, before.hash, 'the restored draft is the same proposal, to the hash')
    assert.equal(after.name, 'Orla Fenn')
    assert.equal(after.text, 'A restatement kept across a reload.\n')
    assert.match(after.count, /proposing 1 change/)

    await page.evaluate(() => document.querySelector('#clear-draft').click())
    assert.equal(await page.evaluate(() => localStorage.getItem('opencodelaw.propose.draft.v1')), null)
    await page.close()
  })

  test('the page says plainly what it cannot do', async () => {
    const page = await open()
    const text = (await page.evaluate(() => document.body.textContent)).replace(/\s+/g, ' ')
    assert.match(text, /Nothing you do here changes the constitution/i)
    assert.match(text, /cannot check who you are/i)
    assert.match(text, /cannot submit/i)
    assert.match(text, /saved only here/i, 'browser storage is crash protection, not archival')
    assert.match(text, /shared or public computer/i)
    await page.close()
  })

  test('the editor is operable from the keyboard alone', async () => {
    const page = await open()
    await page.focus('#h-art-1')
    await page.keyboard.type('X')
    await settle(400)
    assert.match(await page.$eval('#change-count', el => el.textContent), /proposing 1 change/,
      'typing in a heading proposes a change')

    // Tab walks the provision in document order: heading, text, then its
    // controls. Nothing is reachable only by pointer.
    await page.focus('#h-art-1')
    const walk = []
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab')
      walk.push(await page.evaluate(() => document.activeElement.id || document.activeElement.dataset.act || null))
    }
    assert.deepEqual(walk, ['t-art-1', 'add-clause', 'ask-remove'])

    // And a control opens with Enter, like any button.
    await page.keyboard.press('Enter')
    await settle(250)
    assert.ok(await page.$('.prov[data-id="art-1"] .confirm'), 'Enter opens the confirmation')
    assert.equal(await page.evaluate(() => document.activeElement.dataset.act ?? null), 'confirm-remove',
      'focus lands inside the confirmation it just opened, not back at the top of the page')
    await page.close()
  })
})

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
    execFileSync(process.execPath, [path.join(ROOT, 'src/build.mjs')], {
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
