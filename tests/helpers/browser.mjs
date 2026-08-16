/**
 * The shared harness for the two page suites: a static server over a built
 * site, and a headless Chrome.
 *
 * It lives apart from the test files because importing a test file to borrow a
 * helper also runs its tests — so the ICC suite would have re-run the whole
 * editor suite every time, and a failure in one would be reported twice under
 * the other's name.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

export function findChrome () {
  for (const c of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execSync(`command -v ${c}`, { encoding: 'utf8' }).trim() } catch { /* next */ }
  }
  return process.env.CHROME_PATH || null
}

const TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.yaml': 'text/yaml', '.txt': 'text/plain'
}

/** A static server over a built site, so module imports and fetch behave. */
export function serve (dir, port) {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0])
    let file = path.join(dir, p)
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise(r => server.listen(port, () => r(server)))
}

export async function launch () {
  const puppeteer = (await import('puppeteer-core')).default
  return puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  })
}

export const settle = (ms = 500) => new Promise(r => setTimeout(r, ms))

/** Whatever a page's download control wrote, as text, in order. */
export function captureDownloads (page, expected, trigger) {
  return page.evaluate((n, sel) => new Promise(resolve => {
    const out = []
    const orig = URL.createObjectURL
    URL.createObjectURL = blob => {
      blob.text().then(t => { out.push(t); if (out.length === n) resolve(out) })
      return orig.call(URL, blob)
    }
    document.querySelector(sel).click()
  }), expected, trigger)
}
