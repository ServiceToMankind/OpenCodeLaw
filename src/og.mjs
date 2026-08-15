/**
 * Build-time Open Graph images.
 *
 * Social scrapers do not run JavaScript. This is the entire reason links to
 * the constitution have previewed as a blank grey rectangle: there was nothing
 * in the served HTML for them to read, and no image to fall back on.
 *
 * One 1200×630 PNG per page, rasterised from SVG. If no rasteriser is present
 * the build still succeeds and every expected path is filled with the brand
 * banner, so `og:image` can never point at a 404.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const W = 1200
const H = 630

const PALETTE = {
  ink: '#320063',
  canvas: '#f5f5f5',
  body: '#333333',
  muted: '#cecdcd',
  action: '#c07534'
}

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Greedy wrap by estimated advance width — no font metrics available here. */
function wrap (text, maxChars, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (next.length > maxChars && line) { lines.push(line); line = w } else { line = next }
    if (lines.length === maxLines) break
  }
  if (line && lines.length < maxLines) lines.push(line)
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/[,;:.\s]+$/, '') + '…'
  }
  return lines
}

// Inline presentation attributes only, never a <style> block with CSS classes.
// Without librsvg on PATH, ImageMagick falls back to its own MSVG renderer,
// which does not resolve class selectors — the plate came out blank or errored.
// Single quotes inside: the value sits in a double-quoted XML attribute, and a
// nested double quote terminates it early — which produced an SVG the
// rasteriser rejected with a misleading "No such file or directory".
const FONT = "'DejaVu Sans','Liberation Sans',Arial,sans-serif"

function svg ({ kicker, title, footer, logoDataUri, badge }) {
  const lines = wrap(title, 26, 3)
  const startY = lines.length === 1 ? 340 : lines.length === 2 ? 300 : 262
  const body = lines.map((l, i) =>
    `<text x="80" y="${startY + i * 76}" font-family="${FONT}" font-size="62" font-weight="bold" fill="#ffffff">${esc(l)}</text>`
  ).join('\n  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PALETTE.ink}"/>
  <rect x="0" y="0" width="14" height="${H}" fill="${PALETTE.action}"/>
  ${logoDataUri ? `<image href="${logoDataUri}" x="80" y="64" width="76" height="76" preserveAspectRatio="xMidYMid meet"/>` : ''}
  <text x="${logoDataUri ? 180 : 80}" y="118" font-family="${FONT}" font-size="30" font-weight="bold" fill="${PALETTE.action}" letter-spacing="3">${esc(kicker)}</text>
  ${body}
  <text x="80" y="${H - 66}" font-family="${FONT}" font-size="26" fill="${PALETTE.muted}">${esc(footer)}</text>
  ${badge ? `<rect x="${W - 320}" y="${H - 106}" width="240" height="48" rx="24" fill="${PALETTE.canvas}"/>
  <text x="${W - 200}" y="${H - 74}" font-family="${FONT}" font-size="22" font-weight="bold" fill="${PALETTE.ink}" text-anchor="middle">${esc(badge)}</text>` : ''}
</svg>`
}

function rasteriser () {
  for (const [cmd, args] of [
    ['rsvg-convert', (i, o) => ['-w', String(W), '-h', String(H), '-o', o, i]],
    ['convert', (i, o) => [i, '-resize', `${W}x${H}`, o]],
    ['inkscape', (i, o) => [i, '--export-type=png', `--export-filename=${o}`]]
  ]) {
    try {
      execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' })
      return { cmd, args }
    } catch { /* not installed; try the next */ }
  }
  return null
}

export function generateOgImages (outDir, pages, { logoPath, bannerPath } = {}) {
  fs.mkdirSync(outDir, { recursive: true })

  let logoDataUri = null
  if (logoPath && fs.existsSync(logoPath)) {
    logoDataUri = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64')
  }

  const r = rasteriser()
  const tmp = path.join(outDir, '.og.svg')
  let made = 0
  let fallback = 0

  for (const page of pages) {
    const out = path.join(outDir, `${page.slug}.png`)
    if (r) {
      fs.writeFileSync(tmp, svg({ ...page, logoDataUri }))
      try {
        execFileSync(r.cmd, r.args(tmp, out), { stdio: 'ignore' })
        made++
        continue
      } catch { /* fall through to the banner */ }
    }
    // Never leave og:image pointing at nothing.
    if (bannerPath && fs.existsSync(bannerPath)) { fs.copyFileSync(bannerPath, out); fallback++ }
  }
  fs.rmSync(tmp, { force: true })

  return { made, fallback, rasteriser: r?.cmd ?? null }
}
