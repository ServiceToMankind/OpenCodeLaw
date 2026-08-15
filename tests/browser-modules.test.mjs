/**
 * The browser boundary.
 *
 * /propose/ and /icc/ run engine code — the three-way classification, the
 * Article 16(3) arithmetic, the manifest, the serialiser, the instrument and
 * ballot renderers — rather than reimplementing any of it in page script. That
 * is the whole point: a second implementation of `classifyOperation` would be
 * free to drift, and the drift would not surface until a meeting had voted.
 *
 * The cost of that reuse is that these modules must run in two runtimes. The
 * failure mode is quiet and total: one `import fs from 'node:fs'` anywhere in
 * the graph and the page's entire module graph fails to load, before any of the
 * page's own code runs — so it looks like a blank page rather than a broken
 * one. `src/lib/paths.mjs` read `process.env` at module scope and did exactly
 * that.
 *
 * So the boundary is walked here, not trusted.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

/** Kept in step with BROWSER_MODULES in src/build.mjs, which the next test asserts. */
const ENTRY = ['scripts/editor.js', 'scripts/icc.js']

const read = rel => fs.readFileSync(path.join(ROOT, 'src', rel), 'utf8')

/** Every relative import reachable from the entry points. */
function graph (entries) {
  const seen = new Set()
  const queue = [...entries]
  while (queue.length) {
    const rel = queue.shift()
    if (seen.has(rel)) continue
    seen.add(rel)
    const src = read(rel)
    for (const m of src.matchAll(/^\s*(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/gm)) {
      const spec = m[1]
      if (!spec.startsWith('.')) continue
      queue.push(path.normalize(path.join(path.dirname(rel), spec)))
    }
  }
  return [...seen]
}

test('nothing the pages load imports a Node builtin', () => {
  const offenders = []
  for (const rel of graph(ENTRY)) {
    const src = read(rel)
    for (const m of src.matchAll(/from\s*['"](node:[^'"]+|fs|path|crypto|url|os)['"]/g)) {
      offenders.push(`${rel} imports ${m[1]}`)
    }
    // `process` is not defined in a browser, and reading it at module scope
    // takes the whole graph down on import rather than at the call site.
    for (const line of src.split('\n')) {
      if (/\bprocess\.env\b/.test(line) && !/typeof process/.test(src)) {
        offenders.push(`${rel} reads process.env without guarding it`)
        break
      }
    }
  }
  assert.deepEqual(offenders, [],
    'these modules are served to the browser and must run there:\n  ' + offenders.join('\n  '))
})

test('every module the pages reach is on the shipped list', () => {
  const build = fs.readFileSync(path.join(ROOT, 'src/build.mjs'), 'utf8')
  const block = /const BROWSER_MODULES = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(build)
  assert.ok(block, 'BROWSER_MODULES must be findable in src/build.mjs')
  const shipped = new Set([...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]))

  const missing = graph(ENTRY).filter(rel => !shipped.has(rel))
  assert.deepEqual(missing, [],
    'these are imported by a page but never copied into dist/engine/, so the page would 404 on ' +
    'them at load:\n  ' + missing.join('\n  '))
})

test('the vendored YAML parser is the CLI\'s, byte for byte', {
  skip: !fs.existsSync(path.join(DIST, 'engine/vendor/js-yaml.mjs'))
    ? 'built without PROPOSE_ENABLED' : false
}, () => {
  // The pages must read an uploaded bill file. A hand-rolled parser for "just
  // this shape" would be a second reader of the format, and the two would
  // disagree on some file nobody thought to test — which is how a bill comes to
  // mean one thing on screen and another to the applier.
  const shipped = fs.readFileSync(path.join(DIST, 'engine/vendor/js-yaml.mjs'))
  const installed = fs.readFileSync(path.join(ROOT, 'node_modules/js-yaml/dist/js-yaml.mjs'))
  assert.ok(shipped.equals(installed), 'the served parser is not the installed one')

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const installedVersion = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'node_modules/js-yaml/package.json'), 'utf8')).version
  assert.equal(installedVersion, pkg.dependencies['js-yaml'],
    'js-yaml is pinned exactly, so the browser and the CLI cannot be reading different parsers')
})

test('the pages ship, or do not ship, together', () => {
  const built = fs.existsSync(path.join(DIST, 'propose/index.html'))
  assert.equal(fs.existsSync(path.join(DIST, 'icc/index.html')), built,
    'a proposal surface with no clerking desk behind it is the adoption failure one step later')
  assert.equal(fs.existsSync(path.join(DIST, 'constitution.json')), built,
    'the document the editor opens ships with the editor and not otherwise')
  assert.equal(fs.existsSync(path.join(DIST, 'engine/bill-validator.mjs')), built)
})

test('the ICC desk is not offered to search engines', {
  skip: !fs.existsSync(path.join(DIST, 'icc/index.html')) ? 'built without PROPOSE_ENABLED' : false
}, () => {
  const html = fs.readFileSync(path.join(DIST, 'icc/index.html'), 'utf8')
  assert.match(html, /<meta name="robots" content="noindex/,
    'a working surface for one committee is not a page the public is looking for')
  assert.ok(!fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8').includes('/icc/'))
})
