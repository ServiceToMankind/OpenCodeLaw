#!/usr/bin/env node
/**
 * Verifies the built site before it is published.
 *
 * Two failure modes matter most for this deployment target:
 *
 *  - a root-relative URL that works on localhost and 404s on project Pages,
 *    because the site lives under /OpenCodeLaw/ and not at the domain root;
 *  - a link or in-page anchor pointing at something no provision produces,
 *    which for a constitution means a dead citation.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normaliseBase } from './lib/paths.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const BASE = normaliseBase(process.env.BASE_PATH ?? '/OpenCodeLaw/')

const EXTERNAL = /^(https?:|mailto:|tel:|data:|#|javascript:)/i

function htmlFiles (dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) htmlFiles(full, acc)
    else if (e.name.endsWith('.html')) acc.push(full)
  }
  return acc
}

/** Where does a site-absolute URL land on disk? */
function resolveTarget (urlPath) {
  const rel = urlPath.slice(BASE.length)
  const candidates = rel === '' || rel.endsWith('/')
    ? [path.join(DIST, rel, 'index.html')]
    : [path.join(DIST, rel), path.join(DIST, rel, 'index.html')]
  return candidates.find(c => fs.existsSync(c)) ?? null
}

export function linkcheck () {
  if (!fs.existsSync(DIST)) throw new Error('dist/ does not exist — run the build first')
  const files = htmlFiles(DIST)
  const problems = []
  const stats = { files: files.length, links: 0, anchors: 0 }

  // Anchors available in each page, so in-page fragments can be checked.
  const idsByFile = new Map()
  for (const f of files) {
    const html = fs.readFileSync(f, 'utf8')
    idsByFile.set(f, new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])))
  }

  for (const f of files) {
    const rel = path.relative(DIST, f)
    const html = fs.readFileSync(f, 'utf8')
    const refs = [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map(m => m[1])

    for (const raw of refs) {
      if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('data:')) continue

      // In-page fragment
      if (raw.startsWith('#')) {
        stats.anchors++
        const id = raw.slice(1)
        if (id && !idsByFile.get(f).has(id)) {
          problems.push({ file: rel, url: raw, why: 'in-page anchor matches no element on this page' })
        }
        continue
      }

      if (/^https?:/i.test(raw)) continue
      stats.links++

      if (!raw.startsWith('/')) {
        problems.push({ file: rel, url: raw, why: 'relative URL — every internal link must be base-path aware' })
        continue
      }

      // Root-relative: must sit under the base path, or it 404s on project Pages.
      if (!raw.startsWith(BASE)) {
        problems.push({ file: rel, url: raw, why: `escapes the base path ${BASE}` })
        continue
      }

      const [urlPath, frag] = raw.split('#')
      const target = resolveTarget(urlPath)
      if (!target) {
        problems.push({ file: rel, url: raw, why: 'no file at this path in dist/' })
        continue
      }
      if (frag) {
        const ids = idsByFile.get(target)
        if (ids && !ids.has(frag)) {
          problems.push({ file: rel, url: raw, why: `target page has no element with id "${frag}"` })
        }
      }
    }
  }

  return { problems, stats }
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (direct) {
  const { problems, stats } = linkcheck()
  console.log(`link check — ${stats.files} pages, ${stats.links} links, ${stats.anchors} in-page anchors, base ${BASE}`)
  if (problems.length) {
    console.error(`\nFAILED — ${problems.length} problem(s):`)
    for (const p of problems.slice(0, 40)) console.error(`  ${p.file}\n    ${p.url}\n    ${p.why}`)
    if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`)
    process.exit(1)
  }
  console.log('PASSED — zero internal 404s, nothing escapes the base path')
}
