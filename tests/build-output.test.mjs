/**
 * Verifies the built site, not the source.
 *
 * The failure this suite exists to prevent: a page that looks right in a
 * browser with JavaScript on, and is empty to a search engine, a social
 * scraper, or a reader on a slow connection.
 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { linkcheck } from '../src/linkcheck.mjs'
import { normaliseBase, slugMap, DEFAULT_BASE_PATH } from '../src/lib/paths.mjs'
import { toPlainText } from '../src/lib/markdown.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const BASE = normaliseBase(DEFAULT_BASE_PATH)

const doc = yaml.load(fs.readFileSync(path.join(ROOT, 'constitution/current.yaml'), 'utf8'), { schema: yaml.CORE_SCHEMA })
const slugs = slugMap(doc.articles)
const read = rel => fs.readFileSync(path.join(DIST, rel), 'utf8')
const exists = rel => fs.existsSync(path.join(DIST, rel))

before(() => {
  assert.ok(fs.existsSync(DIST), 'dist/ missing — run `npm run build` before the tests')
})

// --- V1 ---------------------------------------------------------------------

test('V1 the full constitution is present with no JavaScript', () => {
  const html = read('index.html')
  // Scripts are enhancement only: strip them and the text must survive.
  const noScript = html.replace(/<script[\s\S]*?<\/script>/g, '')

  for (const a of doc.articles) {
    assert.ok(noScript.includes(`id="${a.id}"`), `${a.id} missing from index.html`)
    assert.ok(noScript.includes(a.title.replace(/&/g, '&amp;')), `title of ${a.id} missing`)
    for (const s of a.sections ?? []) {
      assert.ok(noScript.includes(`id="${s.id}"`), `${s.id} missing from index.html`)
    }
  }

  // Real provision prose, not just headings.
  const sample = toPlainText(doc.articles.find(a => a.content)?.content).slice(0, 60)
  assert.ok(sample.length > 20)
  const flat = noScript.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
  assert.ok(flat.includes(sample.slice(0, 40)), 'provision prose missing from served HTML')
})

test('V1 a blank provision renders an explicit marker rather than nothing', () => {
  // Article 11 of the archived v2.0.0 was published with no text.
  if (!exists('archive/2.0.0/index.html')) return
  const html = read('archive/2.0.0/index.html')
  assert.ok(html.includes('No text was recorded for this provision'),
    'archived blank provision must render a visible marker')
})

// --- V2 / V4 ----------------------------------------------------------------

test('V2+V4 zero internal 404s and nothing escapes the base path', () => {
  const { problems, stats } = linkcheck()
  assert.ok(stats.files > 20, `expected a full site, saw ${stats.files} pages`)
  assert.deepEqual(problems, [], problems.slice(0, 5).map(p => `${p.file} -> ${p.url}: ${p.why}`).join('\n'))
})

test('V4 every asset URL is base-path aware', () => {
  const html = read('index.html')
  const refs = [...html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)].map(m => m[1])
  assert.ok(refs.length > 0)
  for (const r of refs) {
    assert.ok(r.startsWith(BASE), `${r} does not start with ${BASE} and would 404 on project Pages`)
  }
})

// --- V3 ---------------------------------------------------------------------

test('V3 legacy #articleN anchors map for all 18 articles', () => {
  const map = JSON.parse(read('legacy-anchors.json'))
  const html = read('index.html')

  doc.articles.forEach((a, i) => {
    const legacy = `article${i + 1}`
    assert.equal(map[legacy], a.id, `${legacy} must map to ${a.id}`)
    assert.ok(html.includes(`id="${a.id}"`), `${a.id} must exist on the page the map points at`)
    ;(a.sections ?? []).forEach((s, j) => {
      const legacySec = `article${i + 1}-section${j + 1}`
      assert.equal(map[legacySec], s.id, `${legacySec} must map to ${s.id}`)
    })
  })
  assert.equal(Object.keys(map).filter(k => /^article\d+$/.test(k)).length, doc.articles.length)
})

// --- V5 ---------------------------------------------------------------------

const PAGE_TYPES = [
  ['index.html', 'home'],
  [`articles/${[...slugs.values()][0]}/index.html`, 'article'],
  ['amendments/index.html', 'amendments'],
  ['archive/index.html', 'archive']
]

for (const [rel, label] of PAGE_TYPES) {
  test(`V5 ${label} page carries title, description, canonical, OG and JSON-LD in raw HTML`, () => {
    const html = read(rel)
    const head = html.slice(0, html.indexOf('</head>'))

    const title = head.match(/<title>([^<]+)<\/title>/)?.[1]
    assert.ok(title && title.length > 10, 'missing or trivial <title>')

    const desc = head.match(/<meta name="description" content="([^"]*)"/)?.[1]
    assert.ok(desc && desc.length > 30, `missing or trivial description on ${label}`)
    assert.ok(!/^Constitution page$/.test(desc), 'description must not be boilerplate')

    assert.match(head, /<link rel="canonical" href="https?:\/\/[^"]+"/, 'missing canonical')
    assert.match(head, /<meta property="og:title"/, 'missing og:title')
    assert.match(head, /<meta property="og:description"/, 'missing og:description')
    assert.match(head, /<meta property="og:url"/, 'missing og:url')
    assert.match(head, /<meta name="twitter:card" content="summary_large_image"/, 'missing twitter card')

    const ld = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    assert.ok(ld.length > 0, `no JSON-LD on ${label}`)
    for (const m of ld) {
      const parsed = JSON.parse(m[1])
      assert.equal(parsed['@context'], 'https://schema.org')
      assert.ok(parsed['@type'], 'JSON-LD node without @type')
    }

    // A real <h1> in the served source, not injected by script.
    const noScript = html.replace(/<script[\s\S]*?<\/script>/g, '')
    assert.match(noScript, /<h1[^>]*>/, `${label} has no <h1> in the served HTML`)
  })
}

test('V5 every article page has a unique title and description', () => {
  const seenTitle = new Set()
  const seenDesc = new Set()
  for (const slug of slugs.values()) {
    const head = read(`articles/${slug}/index.html`)
    const title = head.match(/<title>([^<]+)<\/title>/)[1]
    const desc = head.match(/<meta name="description" content="([^"]*)"/)[1]
    assert.ok(!seenTitle.has(title), `duplicate title: ${title}`)
    assert.ok(!seenDesc.has(desc), `duplicate description on ${slug}`)
    seenTitle.add(title)
    seenDesc.add(desc)
  }
  assert.equal(seenTitle.size, doc.articles.length)
})

// --- structure --------------------------------------------------------------

test('archived pages carry a canonical to the current version and a superseded banner', () => {
  for (const dir of ['archive/1.0.0', 'archive/2.0.0']) {
    if (!exists(`${dir}/index.html`)) continue
    const html = read(`${dir}/index.html`)
    assert.match(html, /<link rel="canonical" href="[^"]+"/)
    assert.ok(html.includes('This version is superseded'), `${dir} missing superseded banner`)
    assert.ok(html.includes('banner--superseded'))
  }
})

test('the reconciliation banner is generated from reconciliation_state, not hardcoded', () => {
  const html = read('index.html')
  const state = doc.reconciliation_state
  assert.ok(state, 'fixture expects a reconciliation_state block')
  assert.ok(html.includes('mid-reconciliation'), 'banner missing')
  // Every held blocker named in the YAML must appear in the rendered banner.
  for (const held of state.held) {
    const why = Array.isArray(held.blocked_by) ? held.blocked_by : [held.blocked_by]
    for (const w of why) assert.ok(html.includes(w), `banner does not mention blocker "${w}"`)
  }
})

test('the custom domain ships with the artifact', () => {
  // Inverted at cutover. constitution.stmorg.in now points at this build, and
  // an Actions deploy whose artifact has no CNAME can drop the domain setting.
  // Opt out with INCLUDE_CNAME=false, never by omission.
  assert.ok(exists('CNAME'), 'CNAME must ship now that the custom domain is live')
  assert.equal(read('CNAME').trim(), 'constitution.stmorg.in')
})

test('the built site is compiled for the base path it is served from', () => {
  // The cutover breakage: the artifact was compiled for /OpenCodeLaw/ while the
  // apex domain serves from /, so every asset and link 404'd.
  const html = read('index.html')
  const refs = [...html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)].map(m => m[1])
  const cname = exists('CNAME') ? read('CNAME').trim() : null
  if (cname) {
    assert.equal(BASE, '/',
      `CNAME is set to ${cname} (an apex domain, served from /), but the build used base path ${BASE}`)
    for (const r of refs) {
      assert.ok(!/^\/OpenCodeLaw\//.test(r), `${r} still carries the project-Pages prefix`)
    }
  }
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)[1]
  if (cname) assert.ok(canonical.includes(cname), `canonical ${canonical} does not point at ${cname}`)
})

test('no runtime CDN reference survives into the output', () => {
  for (const rel of ['index.html', 'amendments/index.html', 'archive/index.html']) {
    const html = read(rel)
    assert.ok(!/cdn\.jsdelivr|cdnjs\.cloudflare|unpkg\.com/.test(html),
      `${rel} still references a CDN`)
  }
})

test('every Act PDF named in the register is reachable in the build', () => {
  const reg = yaml.load(fs.readFileSync(path.join(ROOT, 'acts/register.yaml'), 'utf8'), { schema: yaml.CORE_SCHEMA })
  for (const act of reg.acts) {
    assert.ok(exists(act.pdf), `${act.id}: ${act.pdf} missing from dist/`)
  }
})

test('section headings sit one level below their article on every page type', () => {
  // The document outline is how screen-reader users navigate a long legal text.
  // Lighthouse will not catch a flattened outline: its sequential-headings audit
  // only flags a skipped level, and h3 -> h3 is not a skip.
  const pages = [
    ['index.html', 3],
    [`articles/${slugs.get('art-6')}/index.html`, 2]
  ]
  for (const [rel, articleLevel] of pages) {
    const html = read(rel)
    const art = doc.articles.find(a => a.sections?.length)
    const start = html.indexOf(`id="${art.id}"`)
    assert.ok(start > -1)
    const segment = html.slice(start, start + 8000)

    const artH = segment.match(new RegExp(`<h([1-6])[^>]*id="h-${art.id}"`))
    assert.equal(Number(artH[1]), articleLevel, `${rel}: article heading level`)

    for (const s of art.sections) {
      const m = segment.match(new RegExp(`<h([1-6])[^>]*id="h-${s.id}"`))
      assert.ok(m, `${rel}: ${s.id} heading missing`)
      assert.equal(Number(m[1]), articleLevel + 1,
        `${rel}: ${s.id} is <h${m[1]}> under an <h${articleLevel}> article — the outline says they are siblings`)
    }
  }
})

test('heading levels never skip on any page type', () => {
  for (const rel of ['index.html', `articles/${[...slugs.values()][0]}/index.html`, 'amendments/index.html', 'archive/index.html']) {
    const html = read(rel).replace(/<script[\s\S]*?<\/script>/g, '')
    const levels = [...html.matchAll(/<h([1-6])\b/g)].map(m => Number(m[1]))
    let prev = levels[0]
    for (const l of levels.slice(1)) {
      assert.ok(l <= prev + 1, `${rel}: jumped from h${prev} to h${l}`)
      prev = l
    }
  }
})
