/**
 * The propose page, driven in a real browser.
 *
 * The assertion that matters: what the page produces must be what the CLI
 * accepts, and its substantive hash must equal the CLI's for the same bill. Two
 * implementations of either would be free to drift — the class of failure this
 * project began with, when the docs, the specs and the renderer each described
 * a different root key.
 *
 * Not part of `npm test`; run with `npm run test:e2e`. Skips cleanly with no
 * Chrome rather than failing the build.
 */
import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { substantiveHash, validateBill } from '../src/bill.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const PORT = 8141

function findChrome () {
  for (const c of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execSync(`command -v ${c}`, { encoding: 'utf8' }).trim() } catch { /* next */ }
  }
  return process.env.CHROME_PATH || null
}
const CHROME = findChrome()
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff': 'font/woff', '.ttf': 'font/ttf' }

let server, browser, tmp

describe('propose page', { skip: !CHROME || !fs.existsSync(path.join(DIST, 'propose/index.html')) ? 'no Chrome or no build' : false }, () => {
  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'propose-'))
    server = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0])
      let file = path.join(DIST, p)
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
      if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
    })
    await new Promise(r => server.listen(PORT, r))
    const puppeteer = (await import('puppeteer-core')).default
    browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] })
  })

  after(async () => {
    await browser?.close()
    await new Promise(r => server?.close(r))
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  /** Fill the form the way a proposer would and return what the page produced. */
  async function drive () {
    const page = await browser.newPage()
    const errors = []
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(`http://localhost:${PORT}/propose/`, { waitUntil: 'networkidle0' })

    await page.type('#p-name', 'Orla Fenn')
    await page.type('#p-role', 'Unit Head')
    await page.type('#p-title', 'An Act to amend the Annual Report')
    await page.type('#p-objects', '1. Article 13 is amended for clarity.')

    // The target is PICKED. There is no freehand id field to type into.
    await page.type('.op__search', 'Annual')
    await page.waitForSelector('.op__results li', { timeout: 4000 })
    await page.evaluate(() => document.querySelector('.op__results li')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
    await new Promise(r => setTimeout(r, 300))

    const prefilled = await page.$eval('.op__text', el => el.value)
    await page.evaluate(() => {
      const t = document.querySelector('.op__text')
      t.value = t.value.trimEnd() + '\n5. An added clause, for the test.\n'
      t.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await new Promise(r => setTimeout(r, 700))

    const result = await page.evaluate(() => ({
      hash: document.querySelector('#hash-out').textContent.trim(),
      ready: !document.querySelector('#download').disabled,
      report: document.querySelector('#check-report').textContent.replace(/\s+/g, ' ').trim()
    }))
    // The exact bytes the download button writes.
    const text = await page.evaluate(async () => {
      const mod = await import('/scripts/propose.js')
      return null // module does not export; captured below instead
    }).catch(() => null)
    void text

    const downloaded = await page.evaluate(() => {
      // Re-run the page's own serialiser through a click, capturing the blob.
      return new Promise(resolve => {
        const orig = URL.createObjectURL
        URL.createObjectURL = blob => { blob.text().then(resolve); return orig.call(URL, blob) }
        document.querySelector('#download').click()
      })
    })

    await page.close()
    return { ...result, prefilled, downloaded, errors }
  }

  test('the target is prefilled with its current text, so the operation is full-text', async () => {
    const r = await drive()
    assert.ok(r.prefilled.length > 100,
      'picking a provision must prefill its current text — that is what makes a splice impossible')
    assert.match(r.prefilled, /All units must maintain task reports/,
      'the prefill must be the provision as it currently reads')
  })

  test('the page produces a draft the CLI validator accepts', async () => {
    const r = await drive()
    assert.deepEqual(r.errors, [], `console errors: ${r.errors.join(' | ')}`)
    assert.ok(r.ready, `download should be enabled; report said: ${r.report}`)
    assert.ok(r.downloaded, 'the download produced no file')

    const file = path.join(tmp, 'from-page.yaml')
    fs.writeFileSync(file, r.downloaded)

    // Parses, and validates against the same schema and rules the CLI runs.
    const parsed = yaml.load(r.downloaded, { schema: yaml.CORE_SCHEMA })
    assert.equal(parsed.status, 'draft', 'the page produces drafts only')
    assert.equal(parsed.bill.number, null, 'the page never numbers a bill')

    const { problems } = validateBill(file)
    assert.deepEqual(problems.errors.map(e => `${e.code}: ${e.message}`), [],
      'the CLI must accept what the page produced')
  })

  test('the hash the page shows equals the hash the CLI computes', async () => {
    const r = await drive()
    const file = path.join(tmp, 'hash-check.yaml')
    fs.writeFileSync(file, r.downloaded)
    const parsed = yaml.load(r.downloaded, { schema: yaml.CORE_SCHEMA })
    assert.equal(r.hash, substantiveHash(parsed),
      'the page and the CLI must agree on the hash a meeting resolves upon')
    assert.match(r.hash, /^[a-f0-9]{64}$/)
  })

  test('the page states plainly that it cannot verify membership or submit', async () => {
    const page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}/propose/`, { waitUntil: 'domcontentloaded' })
    const text = (await page.evaluate(() => document.body.textContent)).replace(/\s+/g, ' ')
    assert.match(text, /cannot check who you are/i)
    assert.match(text, /verified by the ICC/i)
    assert.match(text, /cannot submit/i)
    // revision is board-initiated and deliberately absent from the form.
    const types = await page.$$eval('#p-type option', els => els.map(e => e.value))
    assert.deepEqual(types, ['amendment', 'corrigendum'])
    await page.close()
  })

  test('the builder is keyboard-operable', async () => {
    const page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}/propose/`, { waitUntil: 'networkidle0' })
    await page.focus('.op__search')
    await page.keyboard.type('Annual')
    await page.waitForSelector('.op__results li', { timeout: 4000 })
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await new Promise(r => setTimeout(r, 300))
    const chosen = await page.$eval('.op__chosen', el => el.textContent)
    assert.match(chosen, /Chosen:/, 'Enter on a highlighted result must choose it')
    await page.close()
  })
})
