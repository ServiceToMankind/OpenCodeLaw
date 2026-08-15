/**
 * Keyboard-only walkthrough of the built site.
 *
 * Not part of `npm test` — it needs a real browser. Run with `npm run test:e2e`.
 * Skips cleanly when no Chrome is present rather than failing the build.
 *
 * Everything here is done without a pointer: if a step cannot be reached by
 * Tab, Enter and Escape, it does not work for keyboard or screen-reader users.
 */
import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { normaliseBase, DEFAULT_BASE_PATH } from '../src/lib/paths.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
// Read the same default the build and link checker use. Hardcoding it here is
// how this harness kept serving /OpenCodeLaw/ after the site moved to the apex
// domain, and every asset 404'd inside the tests while the real site was fine.
const BASE = normaliseBase(DEFAULT_BASE_PATH).replace(/\/$/, '')
const PORT = 8137

function findChrome () {
  for (const c of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execSync(`command -v ${c}`, { encoding: 'utf8' }).trim() } catch { /* next */ }
  }
  return process.env.CHROME_PATH || null
}

const CHROME = findChrome()
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.ttf': 'font/ttf', '.pdf': 'application/pdf' }

let server, browser, puppeteer

describe('keyboard-only walkthrough', { skip: !CHROME || !fs.existsSync(DIST) ? 'no Chrome or no dist/' : false }, () => {
  before(async () => {
    server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0])
      if (!p.startsWith(BASE)) { res.writeHead(404).end('not found'); return }
      p = p.slice(BASE.length) || '/'
      let file = path.join(DIST, p)
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
      if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
    })
    await new Promise(r => server.listen(PORT, r))
    puppeteer = (await import('puppeteer-core')).default
    browser = await puppeteer.launch({
      executablePath: CHROME, headless: 'new',
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    })
  })

  after(async () => {
    await browser?.close()
    await new Promise(r => server?.close(r))
  })

  const open = async (url = '/', width = 1440, height = 900) => {
    const page = await browser.newPage()
    await page.setViewport({ width, height })
    await page.goto(`http://localhost:${PORT}${BASE}${url}`, { waitUntil: 'networkidle0' })
    return page
  }

  const focused = page => page.evaluate(() => {
    const a = document.activeElement
    return a ? { id: a.id, tag: a.tagName, cls: a.className, text: (a.textContent || '').trim().slice(0, 40) } : null
  })

  // -------------------------------------------------------------------------

  test('the first Tab reaches the skip link, and it moves focus to main', async () => {
    const page = await open()
    await page.keyboard.press('Tab')
    const first = await focused(page)
    assert.match(first.cls, /skip-link/, `first tab stop was ${first.tag}.${first.cls}`)

    await page.keyboard.press('Enter')
    const after = await focused(page)
    assert.equal(after.id, 'main', 'Enter on the skip link must move focus to <main>')
    await page.close()
  })

  test('the theme toggle is a real button and flips aria-pressed', async () => {
    const page = await open()
    const before = await page.$eval('#theme-toggle', el => ({ tag: el.tagName, pressed: el.getAttribute('aria-pressed') }))
    assert.equal(before.tag, 'BUTTON', 'the theme control must be a button, not a styled checkbox')

    await page.focus('#theme-toggle')
    await page.keyboard.press('Enter')
    const after = await page.$eval('#theme-toggle', el => el.getAttribute('aria-pressed'))
    assert.notEqual(after, before.pressed, 'aria-pressed must change')

    const theme = await page.$eval('html', el => el.getAttribute('data-theme'))
    assert.ok(['light', 'dark'].includes(theme))
    await page.close()
  })

  test('Ctrl+K opens search, focus lands in the input, Escape restores focus', async () => {
    const page = await open()
    await page.focus('#search-open')
    await page.keyboard.down('Control'); await page.keyboard.press('KeyK'); await page.keyboard.up('Control')
    await page.waitForFunction(() => !document.getElementById('search-dialog').hasAttribute('hidden'), { timeout: 3000 })

    const inDialog = await focused(page)
    assert.equal(inDialog.id, 'search-input', 'focus must move into the search input')

    await page.keyboard.press('Escape')
    await page.waitForFunction(() => document.getElementById('search-dialog').hasAttribute('hidden'), { timeout: 3000 })
    const returned = await focused(page)
    assert.equal(returned.id, 'search-open', 'Escape must return focus to the control that opened it')
    await page.close()
  })

  test('search finds a provision and Enter navigates to its anchor', async () => {
    const page = await open()
    await page.focus('#search-open')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => !document.getElementById('search-dialog').hasAttribute('hidden'), { timeout: 3000 })

    await page.keyboard.type('resignation')
    await page.waitForFunction(() => document.querySelectorAll('#search-results li').length > 0, { timeout: 3000 })
    const count = await page.$$eval('#search-results li', els => els.length)
    assert.ok(count > 0, 'search returned nothing for a word that is in the document')

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => location.hash.length > 1 || location.pathname.includes('/articles/'), { timeout: 3000 })
    const url = page.url()
    assert.ok(/#art-|\/articles\//.test(url), `Enter should navigate to a provision, went to ${url}`)
    await page.close()
  })

  test('mobile: the contents sheet opens, traps focus, and returns it on Escape', async () => {
    const page = await open('/', 375, 800)
    const fabVisible = await page.$eval('#toc-fab', el => getComputedStyle(el).display !== 'none')
    assert.ok(fabVisible, 'the contents button must be visible on a phone — issue #1')

    await page.focus('#toc-fab')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => !document.getElementById('toc-sheet').hasAttribute('hidden'), { timeout: 3000 })
    assert.equal(await page.$eval('#toc-fab', el => el.getAttribute('aria-expanded')), 'true')

    const inside = await page.evaluate(() => document.getElementById('toc-sheet').contains(document.activeElement))
    assert.ok(inside, 'focus must move into the sheet when it opens')

    // Tab a full lap; focus must never escape the sheet.
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab')
      const still = await page.evaluate(() => document.getElementById('toc-sheet').contains(document.activeElement))
      assert.ok(still, `focus escaped the sheet after ${i + 1} tabs`)
    }

    await page.keyboard.press('Escape')
    await page.waitForFunction(() => document.getElementById('toc-sheet').hasAttribute('hidden'), { timeout: 3000 })
    const back = await focused(page)
    assert.equal(back.id, 'toc-fab', 'Escape must return focus to the button that opened the sheet')
    await page.close()
  })

  test('copy-link buttons are reachable by keyboard and announce politely', async () => {
    const page = await open()
    const toast = await page.$eval('#toast', el => ({ role: el.getAttribute('role'), live: el.getAttribute('aria-live') }))
    assert.equal(toast.live, 'polite', 'the toast must announce politely — issue #7')

    const label = await page.$eval('button.copy', el => el.getAttribute('aria-label'))
    assert.match(label ?? '', /copy link/i, 'each copy button needs a distinguishing accessible name')

    await page.evaluate(() => document.querySelector('button.copy').focus())
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => (document.getElementById('toast').textContent || '').trim().length > 0, { timeout: 3000 })
    const text = await page.$eval('#toast', el => el.textContent.trim())
    assert.ok(text.length > 0, 'activating copy must put a message in the live region')
    await page.close()
  })

  test('landmarks and a single h1 on every page type', async () => {
    for (const url of ['/', '/articles/units/', '/amendments/', '/archive/']) {
      const page = await open(url)
      const counts = await page.evaluate(() => ({
        header: document.querySelectorAll('header').length,
        nav: document.querySelectorAll('nav').length,
        main: document.querySelectorAll('main').length,
        footer: document.querySelectorAll('footer').length,
        h1: document.querySelectorAll('h1').length,
        articles: document.querySelectorAll('article.provision').length
      }))
      assert.equal(counts.main, 1, `${url}: exactly one <main>`)
      assert.equal(counts.h1, 1, `${url}: exactly one <h1>, found ${counts.h1}`)
      assert.ok(counts.header >= 1 && counts.footer >= 1, `${url}: missing header/footer landmarks`)
      await page.close()
    }
  })

  test('a cold load of a deep anchor lands on the cited provision', async () => {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    await page.goto(`http://localhost:${PORT}${BASE}/articles/units/#art-11-s-2`, { waitUntil: 'networkidle0' })
    await new Promise(r => setTimeout(r, 600))
    const pos = await page.evaluate(() => {
      const el = document.getElementById('art-11-s-2')
      if (!el) return null
      const r = el.getBoundingClientRect()
      const header = document.getElementById('site-header')?.getBoundingClientRect().height ?? 0
      return { top: r.top, header }
    })
    assert.ok(pos, 'the anchor must exist on the page')
    assert.ok(pos.top >= 0, `provision scrolled above the viewport (top ${pos.top})`)
    assert.ok(pos.top >= pos.header - 4, `provision is under the sticky header (top ${pos.top}, header ${pos.header})`)
    await page.close()
  })

  test('a legacy #articleN link still resolves', async () => {
    const page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}${BASE}/#article5`, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => location.hash === '#art-5', { timeout: 4000 })
    assert.equal(await page.evaluate(() => location.hash), '#art-5',
      'an old shared link must be rewritten to the permanent anchor')
    await page.close()
  })

  test('no console errors on any page type', async () => {
    for (const url of ['/', '/articles/units/', '/amendments/', '/archive/', '/archive/2.0.0/', '/404.html']) {
      const page = await browser.newPage()
      const errors = []
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
      page.on('pageerror', e => errors.push(e.message))
      await page.goto(`http://localhost:${PORT}${BASE}${url}`, { waitUntil: 'networkidle0' })
      await new Promise(r => setTimeout(r, 400))
      assert.deepEqual(errors, [], `${url} logged: ${errors.join(' | ')}`)
      await page.close()
    }
  })
})
