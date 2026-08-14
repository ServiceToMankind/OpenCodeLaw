#!/usr/bin/env node
/**
 * Integrity gate for the constitution corpus.
 *
 * Schema conformance is the floor, not the goal. The checks that matter are the
 * relational ones: that citation identifiers are unique and permanent, that
 * article numbering has no unexplained gaps, that every Act resolves against
 * the text it claims to amend, and that the archive never shadows the live
 * document.
 *
 * Exits non-zero on any error, so CI blocks deployment rather than publishing a
 * constitution that is broken or legally incorrect.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
// The schema is draft 2020-12; ajv's default entry point only speaks draft-07.
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const CURRENT_FILE = 'constitution/current.yaml'
const VERSIONS_DIR = 'constitution/versions'
const REGISTER_FILE = 'acts/register.yaml'
const SCHEMA_FILE = 'schema/opencodelaw-1.0.schema.json'
const TEMPLATES_DIR = 'src/templates'

/**
 * YAML timestamps are loaded as strings, not Date objects. `format: date`
 * validates strings, and a Date round-trip would silently rewrite
 * `2023-10-08T20:20:00+05:30` into UTC and drop the offset.
 */
const YAML_OPTS = { schema: yaml.CORE_SCHEMA }

export function loadYaml (rel) {
  return yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'), YAML_OPTS)
}

class Report {
  constructor () { this.entries = [] }
  error (file, code, message, where) { this.entries.push({ level: 'error', file, code, message, where }) }
  warn (file, code, message, where) { this.entries.push({ level: 'warn', file, code, message, where }) }
  get errors () { return this.entries.filter(e => e.level === 'error') }
  get warnings () { return this.entries.filter(e => e.level === 'warn') }
}

/** Flatten a constitution into every citable provision it produces. */
export function provisionsOf (doc) {
  const out = []
  if (doc?.preamble) out.push({ id: doc.preamble.id, kind: 'preamble', where: 'preamble' })
  for (const [i, a] of (doc?.articles ?? []).entries()) {
    out.push({ id: a.id, number: a.number, kind: 'article', status: a.status ?? 'active', node: a, where: `articles[${i}]` })
    for (const [j, s] of (a.sections ?? []).entries()) {
      out.push({ id: s.id, number: s.number, kind: 'section', status: s.status ?? 'active', node: s, parent: a, where: `articles[${i}].sections[${j}]` })
    }
  }
  return out
}

/** Every anchor the built site will expose. Treated as a public API. */
export function anchorsOf (doc) {
  return new Set(provisionsOf(doc).filter(p => (p.status ?? 'active') === 'active').map(p => p.id))
}

function buildAjv (schema) {
  const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true })
  addFormats(ajv)
  ajv.addSchema(schema, 'opencodelaw')
  return ajv
}

/**
 * Turn an ajv pointer into something a reviewer can act on.
 *
 * `/articles/10/content` is an array index, which in this document means
 * Article *11*. Reporting a legal defect against the wrong article number is
 * how a reviewer ends up reading the wrong provision.
 */
export function describePath (doc, instancePath) {
  if (!instancePath) return '/'
  const m = instancePath.match(/^\/articles\/(\d+)(?:\/sections\/(\d+))?(.*)$/)
  if (!m) return instancePath
  const art = doc?.articles?.[Number(m[1])]
  if (!art) return instancePath
  const rest = m[3] || ''
  if (m[2] !== undefined) {
    const sec = art.sections?.[Number(m[2])]
    return `${sec?.id ?? `${art.id}?s${m[2]}`} "${sec?.title ?? ''}"${rest} (${instancePath})`
  }
  return `${art.id ?? `articles[${m[1]}]`} "${art.title ?? ''}"${rest} (${instancePath})`
}

/**
 * Is this schema error "a provision exists but carries no text"?
 * Narrow on purpose: only the emptiness constraints on a `content` field, so a
 * missing key, a wrong type or any other defect stays a hard error everywhere.
 */
function isBlankProvision (e) {
  return /\/content$/.test(e.instancePath || '') &&
    (e.keyword === 'minLength' || e.keyword === 'pattern')
}

let _ajv
function ajvInstance () {
  if (!_ajv) _ajv = buildAjv(JSON.parse(fs.readFileSync(path.join(ROOT, SCHEMA_FILE), 'utf8')))
  return _ajv
}

/**
 * Run every per-document check against an in-memory constitution.
 * Exported so tests can assert the gate rejects what it must without
 * writing fixtures to disk.
 */
export function validateDocument (doc, file = '<memory>') {
  const rep = new Report()
  const validateDoc = ajvInstance().getSchema('opencodelaw')
  if (!validateDoc(doc)) {
    for (const e of validateDoc.errors) {
      rep.error(file, 'schema', e.message, e.instancePath || '/')
    }
  }
  checkIdentity(rep, file, doc)
  checkNumbering(rep, file, doc)
  checkPlaceholderUrls(rep, file, doc)
  return rep
}

// ---------------------------------------------------------------------------
// Structural checks, run against every constitution document
// ---------------------------------------------------------------------------

function checkIdentity (rep, file, doc) {
  const provisions = provisionsOf(doc)

  // Global id uniqueness. A duplicate anchor silently steals another
  // provision's permanent citation.
  const seen = new Map()
  for (const p of provisions) {
    if (p.id === undefined) continue
    if (seen.has(p.id)) {
      rep.error(file, 'id-duplicate', `duplicate id "${p.id}" (also at ${seen.get(p.id)})`, p.where)
    } else {
      seen.set(p.id, p.where)
    }
  }

  // id must agree with number. This is what makes reordering safe: identity
  // is carried by the pair, never by array position.
  for (const p of provisions) {
    if (p.kind === 'article' && p.id !== `art-${p.number}`) {
      rep.error(file, 'id-number-mismatch', `article id "${p.id}" does not match number ${p.number} (expected "art-${p.number}")`, p.where)
    }
    if (p.kind === 'section') {
      const expected = `art-${p.parent?.number}-s-${p.number}`
      if (p.id !== expected) {
        rep.error(file, 'id-number-mismatch', `section id "${p.id}" does not match article ${p.parent?.number} section ${p.number} (expected "${expected}")`, p.where)
      }
    }
  }
}

/**
 * Numbering must be dense from 1 to the highest number present. A gap is legal
 * only when an explicit `reserved` or `omitted` entry occupies that number —
 * which is how a statute book represents a repealed or unused provision
 * without renumbering everything after it. A silently missing number fails.
 */
function checkNumbering (rep, file, doc) {
  const articles = doc?.articles ?? []
  const nums = articles.map(a => a.number).filter(n => Number.isInteger(n))

  const dupes = nums.filter((n, i) => nums.indexOf(n) !== i)
  for (const n of new Set(dupes)) {
    rep.error(file, 'number-duplicate', `article number ${n} is used more than once`, 'articles')
  }

  if (nums.length) {
    const max = Math.max(...nums)
    const present = new Set(nums)
    const missing = []
    for (let n = 1; n <= max; n++) if (!present.has(n)) missing.push(n)
    if (missing.length) {
      rep.error(
        file,
        'number-gap',
        `article number${missing.length > 1 ? 's' : ''} ${missing.join(', ')} missing with nothing accounting for the gap. ` +
        'Add an entry with status "reserved" (or "omitted") and a note; do not renumber the articles that follow.',
        'articles'
      )
    }
  }

  for (const [i, a] of articles.entries()) {
    const snums = (a.sections ?? []).map(s => s.number).filter(Number.isInteger)
    if (!snums.length) continue
    const sdupes = snums.filter((n, j) => snums.indexOf(n) !== j)
    for (const n of new Set(sdupes)) {
      rep.error(file, 'number-duplicate', `article ${a.number}: section number ${n} used more than once`, `articles[${i}].sections`)
    }
    const smax = Math.max(...snums)
    const spresent = new Set(snums)
    const smissing = []
    for (let n = 1; n <= smax; n++) if (!spresent.has(n)) smissing.push(n)
    if (smissing.length) {
      rep.error(file, 'number-gap', `article ${a.number}: section number${smissing.length > 1 ? 's' : ''} ${smissing.join(', ')} missing with nothing accounting for the gap`, `articles[${i}].sections`)
    }
  }
}

function checkPlaceholderUrls (rep, file, doc) {
  const walk = (node, trail) => {
    if (typeof node === 'string') {
      if (/example\.(com|org|net)/i.test(node)) {
        rep.error(file, 'placeholder-url', `placeholder URL shipped in info: "${node}"`, trail)
      }
      return
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, `${trail}.${k}`)
    }
  }
  walk(doc?.info, 'info')
}

// ---------------------------------------------------------------------------
// Corpus-level checks: statuses, versions, archive integrity
// ---------------------------------------------------------------------------

function checkVersionIdentity (rep, docs) {
  for (const { file, doc, archived, expectedVersion } of docs) {
    const info = doc?.info ?? {}
    if (archived) {
      if (info.version !== expectedVersion) {
        rep.error(file, 'archive-version-mismatch', `info.version "${info.version}" does not match its filename (expected "${expectedVersion}")`, 'info.version')
      }
      if (info.status !== 'superseded') {
        rep.error(file, 'archive-status', `archived version must declare status "superseded", found "${info.status}"`, 'info.status')
      }
      if (info.superseded_by === undefined) {
        rep.warn(file, 'archive-successor-missing', 'no info.superseded_by; archived pages must name the version that replaced them in a visible banner', 'info')
      } else if (info.superseded_by === info.version) {
        rep.error(file, 'archive-successor-self', 'info.superseded_by cannot equal info.version', 'info.superseded_by')
      }
    } else if (info.status !== 'current') {
      rep.error(file, 'current-status', `the live constitution must declare status "current", found "${info.status}"`, 'info.status')
    }
  }

  const currents = docs.filter(d => d.doc?.info?.status === 'current')
  if (currents.length !== 1) {
    rep.error(currents[0]?.file ?? CURRENT_FILE, 'current-count', `exactly one document may be "current"; found ${currents.length}`, 'info.status')
  }

  // The audit's §3.3 failure, made unrepeatable: an archived snapshot carrying
  // the live version means the archive and the current text are the same
  // document, so editing the constitution rewrites its own history.
  const live = currents[0]
  if (live) {
    for (const d of docs.filter(x => x.archived)) {
      if (d.doc?.info?.version === live.doc?.info?.version) {
        rep.error(d.file, 'archive-shadows-current', `archived version "${d.doc.info.version}" duplicates the current version; the archive must contain only superseded versions`, 'info.version')
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Act register cross-references
// ---------------------------------------------------------------------------

/** First line of an Act's Statement of Objects and Reasons, or null. */
export function statementOfObjectsLine (sourceText) {
  const lines = sourceText.split('\n')
  const i = lines.findIndex(l => /STATEMENT\s+OF\s+OBJECTS\s+AND\s+REASONS/i.test(l))
  return i === -1 ? null : i + 1
}

function parseLineRange (spec) {
  const m = String(spec).match(/^(\d+)(?:\s*-\s*(\d+))?$/)
  if (!m) return null
  return { from: Number(m[1]), to: Number(m[2] ?? m[1]) }
}

/**
 * A Statement of Objects and Reasons is explanatory, never enacting. It may be
 * cited as evidence of intent — that is what `drafting_discrepancy` is for —
 * but it can never be the authority for an operation. If it could authorise a
 * deletion in one article it could set a voting threshold in another, and the
 * ruling that the operative text governs collapses.
 */
function checkStatementOfObjects (rep, acts) {
  for (const [i, act] of acts.entries()) {
    if (!act.source_text) continue
    const abs = path.join(ROOT, act.source_text)
    if (!fs.existsSync(abs)) continue
    const sor = statementOfObjectsLine(fs.readFileSync(abs, 'utf8').replace(/\f/g, ''))
    if (sor == null) continue

    for (const [j, p] of (act.provisions ?? []).entries()) {
      if (!p.source_lines) continue
      const range = parseLineRange(p.source_lines)
      if (!range) {
        rep.error(REGISTER_FILE, 'source-lines-malformed', `acts[${i}].provisions[${j}] source_lines "${p.source_lines}" is not a line or range`, `acts[${i}].provisions[${j}].source_lines`)
        continue
      }
      if (range.to >= sor) {
        rep.error(
          REGISTER_FILE,
          'sor-as-authority',
          `acts[${i}] "${act.id}" cites lines ${p.source_lines} for ${p.target}, which fall in the ` +
          `Statement of Objects and Reasons (from line ${sor} of ${act.source_text}). ` +
          'A Statement of Objects is explanatory, not enacting; cite the operative text. ' +
          'To record what it says, use drafting_discrepancy.',
          `acts[${i}].provisions[${j}].source_lines`
        )
      }
    }
  }
}

function checkRegister (rep, register, docs) {
  const file = REGISTER_FILE
  const acts = register?.acts ?? []

  const ids = new Set()
  for (const [i, act] of acts.entries()) {
    if (ids.has(act.id)) rep.error(file, 'id-duplicate', `duplicate act id "${act.id}"`, `acts[${i}]`)
    ids.add(act.id)

    if (act.id !== `act-${act.number}-${act.year}`) {
      rep.error(file, 'id-number-mismatch', `act id "${act.id}" does not match number ${act.number} and year ${act.year}`, `acts[${i}]`)
    }

    for (const key of ['pdf', 'source_text']) {
      if (act[key] && !fs.existsSync(path.join(ROOT, act[key]))) {
        rep.error(file, 'act-file-missing', `${key} "${act[key]}" does not exist on disk`, `acts[${i}].${key}`)
      }
    }
  }

  checkStatementOfObjects(rep, acts)

  // Act references resolve against the live constitution, which is the only
  // document an Act can amend.
  const live = docs.find(d => !d.archived)
  if (!live) return
  const known = new Set(provisionsOf(live.doc).map(p => p.id))

  for (const [i, act] of acts.entries()) {
    for (const [j, target] of (act.amends ?? []).entries()) {
      if (!known.has(target)) {
        rep.error(file, 'act-reference-unresolved', `acts[${i}] "${act.id}" amends "${target}", which no provision in ${live.file} produces`, `acts[${i}].amends[${j}]`)
      }
    }
    for (const [j, p] of (act.provisions ?? []).entries()) {
      if (!known.has(p.target)) {
        rep.error(file, 'act-reference-unresolved', `acts[${i}] "${act.id}" targets "${p.target}", which no provision in ${live.file} produces`, `acts[${i}].provisions[${j}].target`)
      }
    }
  }

  // ...and every amended_by on a provision must name a real Act.
  for (const { file: cfile, doc } of docs) {
    const nodes = [doc?.preamble, ...(doc?.articles ?? []).flatMap(a => [a, ...(a.sections ?? [])])].filter(Boolean)
    for (const n of nodes) {
      for (const ref of n.amended_by ?? []) {
        if (!ids.has(ref)) {
          rep.error(cfile, 'act-reference-unresolved', `provision "${n.id}" claims amended_by "${ref}", which is not in ${REGISTER_FILE}`, n.id)
        }
      }
      if (n.provenance?.matches_act && !ids.has(n.provenance.matches_act)) {
        rep.error(cfile, 'act-reference-unresolved', `provision "${n.id}" has provenance.matches_act "${n.provenance.matches_act}", which is not in ${REGISTER_FILE}`, n.id)
      }
    }
  }
}

/**
 * Any in-page anchor a template hard-codes must be produced by a real
 * provision, so a template can never link into a void.
 */
function checkTemplateAnchors (rep, docs) {
  const dir = path.join(ROOT, TEMPLATES_DIR)
  if (!fs.existsSync(dir)) return 0
  const files = fs.readdirSync(dir, { recursive: true })
    .filter(f => typeof f === 'string' && /\.(html|hbs|mjs|js)$/.test(f))
  const live = docs.find(d => !d.archived)
  if (!live) return 0
  const anchors = anchorsOf(live.doc)

  let scanned = 0
  for (const f of files) {
    const full = path.join(dir, f)
    if (!fs.statSync(full).isFile()) continue
    scanned++
    const src = fs.readFileSync(full, 'utf8')
    for (const m of src.matchAll(/href=["']#(art-[a-z0-9-]+|preamble)["']/gi)) {
      if (!anchors.has(m[1])) {
        rep.error(`${TEMPLATES_DIR}/${f}`, 'anchor-unresolved', `template links to #${m[1]}, which no provision produces`, f)
      }
    }
  }
  return scanned
}

// ---------------------------------------------------------------------------

export function validate () {
  const rep = new Report()
  const ajv = ajvInstance()
  const validateDoc = ajv.getSchema('opencodelaw')
  const validateRegister = ajv.compile({ $ref: 'opencodelaw#/$defs/actRegister' })

  const docs = []

  // Live document
  docs.push({ file: CURRENT_FILE, doc: loadYaml(CURRENT_FILE), archived: false })

  // Archived versions, expected version taken from the filename
  const versionsDir = path.join(ROOT, VERSIONS_DIR)
  const archived = fs.existsSync(versionsDir)
    ? fs.readdirSync(versionsDir).filter(f => f.endsWith('.yaml')).sort()
    : []
  for (const f of archived) {
    docs.push({
      file: `${VERSIONS_DIR}/${f}`,
      doc: loadYaml(`${VERSIONS_DIR}/${f}`),
      archived: true,
      expectedVersion: f.replace(/^v/, '').replace(/\.yaml$/, '')
    })
  }

  for (const d of docs) {
    if (!validateDoc(d.doc)) {
      for (const e of validateDoc.errors) {
        const msg = `${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`
        const where = describePath(d.doc, e.instancePath)

        // A blank provision in an archived version is a publication defect,
        // recorded rather than repaired: the archive must reproduce what was
        // actually published, and Article 11 of v2.0.0 was published blank.
        // The same blank in the live document stays a hard error — that is the
        // defect this validator exists to catch.
        if (d.archived && isBlankProvision(e)) {
          rep.warn(d.file, 'archived-blank-provision',
            'published with no text. Preserved as published; the build renders an explicit marker.', where)
          continue
        }
        rep.error(d.file, 'schema', msg, where)
      }
    }
    checkIdentity(rep, d.file, d.doc)
    checkNumbering(rep, d.file, d.doc)
    checkPlaceholderUrls(rep, d.file, d.doc)
  }

  checkVersionIdentity(rep, docs)

  let register = null
  if (fs.existsSync(path.join(ROOT, REGISTER_FILE))) {
    register = loadYaml(REGISTER_FILE)
    if (!validateRegister(register)) {
      for (const e of validateRegister.errors) {
        rep.error(REGISTER_FILE, 'schema', e.message, e.instancePath || '/')
      }
    }
    checkRegister(rep, register, docs)
  }

  const templatesScanned = checkTemplateAnchors(rep, docs)

  return { rep, docs, register, templatesScanned }
}

function report ({ rep, docs, register, templatesScanned }) {
  const out = []
  out.push('OpenCodeLaw — validation\n')

  for (const d of docs) {
    const p = provisionsOf(d.doc)
    const arts = p.filter(x => x.kind === 'article')
    const secs = p.filter(x => x.kind === 'section')
    const reserved = arts.filter(a => a.status !== 'active')
    const errs = rep.errors.filter(e => e.file === d.file)
    const warns = rep.warnings.filter(e => e.file === d.file)
    const mark = errs.length ? '✗' : '✓'
    out.push(`  ${mark} ${d.file}`)
    out.push(`      v${d.doc?.info?.version} · ${d.doc?.info?.status} · ${arts.length} articles · ${secs.length} sections` +
      (reserved.length ? ` · ${reserved.length} reserved/omitted` : ''))
    for (const e of errs) out.push(`      ERROR  [${e.code}] ${e.where ? e.where + ': ' : ''}${e.message}`)
    for (const e of warns) out.push(`      warn   [${e.code}] ${e.where ? e.where + ': ' : ''}${e.message}`)
  }

  if (register) {
    const errs = rep.errors.filter(e => e.file === REGISTER_FILE)
    out.push(`  ${errs.length ? '✗' : '✓'} ${REGISTER_FILE}`)
    out.push(`      ${register.acts?.length ?? 0} acts`)
    for (const e of errs) out.push(`      ERROR  [${e.code}] ${e.where ? e.where + ': ' : ''}${e.message}`)
  } else {
    out.push(`  – ${REGISTER_FILE} not present; act cross-reference checks skipped`)
  }

  const tmplErrs = rep.errors.filter(e => e.code === 'anchor-unresolved')
  out.push(templatesScanned
    ? `  ${tmplErrs.length ? '✗' : '✓'} ${TEMPLATES_DIR} — ${templatesScanned} template(s) scanned for dangling anchors`
    : `  – ${TEMPLATES_DIR} empty; anchor checks skipped`)
  for (const e of tmplErrs) out.push(`      ERROR  ${e.message}`)

  out.push('')
  out.push(rep.errors.length
    ? `FAILED — ${rep.errors.length} error(s), ${rep.warnings.length} warning(s)`
    : `PASSED — 0 errors, ${rep.warnings.length} warning(s)`)
  return out.join('\n')
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (invokedDirectly) {
  const result = validate()
  console.log(report(result))
  process.exit(result.rep.errors.length ? 1 : 0)
}
