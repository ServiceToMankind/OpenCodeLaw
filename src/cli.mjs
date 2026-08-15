#!/usr/bin/env node
/**
 * opencodelaw — validate and build a machine-readable constitution.
 *
 * The engine (src/, schema/) is separate from the content (constitution/,
 * acts/). Any organisation can fork, replace constitution/current.yaml, and
 * deploy without touching this code.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const [, , command, ...rest] = process.argv

const USAGE = `
opencodelaw — a YAML-driven renderer for organizational constitutions

  opencodelaw validate [file]   Validate the corpus, or one file against the schema
  opencodelaw build             Render the static site into dist/
  opencodelaw spec              Regenerate schema/SPEC.md from the JSON Schema

  Amending the constitution — see process/AMENDMENT-PROCESS.md
  opencodelaw bill new [--type amendment|corrigendum|revision] [--name <slug>]
  opencodelaw bill validate <file>    schema, targets, threshold, and the before/after diff
  opencodelaw bill render <file>      the instrument in house style (text and HTML)
  opencodelaw bill ballot <file>      resolution sheets, one per approving body
  opencodelaw bill submit <file>      ICC: assign a bill number, status -> submitted
  opencodelaw act enact <file> --signed-pdf <path> [--signed-by <name>]
  opencodelaw act apply <file> [--dry-run]

  opencodelaw --version

Environment:
  BASE_PATH      URL prefix the site is served from   (default /OpenCodeLaw/)
  SITE_ORIGIN    origin for canonical and OG URLs     (default https://servicetomankind.github.io)
  INCLUDE_CNAME  copy CNAME into the build            (default false)

Validation fails the build on a missing or empty provision, a duplicate or
unresolvable citation id, an unexplained gap in article numbering, an Act
reference that does not resolve, or an archived version that shadows the
current one. Exit code is non-zero on any error, so CI can gate a deploy.
`

async function validateOne (file) {
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) {
    console.error(`opencodelaw: no such file: ${file}`)
    process.exit(2)
  }
  const [{ default: Ajv }, { default: addFormats }] = await Promise.all([
    import('ajv/dist/2020.js'), import('ajv-formats')
  ])
  const schema = JSON.parse(fs.readFileSync(path.join(HERE, '../schema/opencodelaw-1.0.schema.json'), 'utf8'))
  const ajv = new Ajv({ allErrors: true, strict: false })
  addFormats(ajv)

  const doc = yaml.load(fs.readFileSync(abs, 'utf8'), { schema: yaml.CORE_SCHEMA })
  const isRegister = !!doc?.acts
  const validate = isRegister
    ? ajv.compile({ $ref: 'opencodelaw#/$defs/actRegister', ...(ajv.addSchema(schema, 'opencodelaw'), {}) })
    : ajv.compile(schema)

  if (validate(doc)) {
    const n = doc.articles?.length ?? doc.acts?.length ?? 0
    console.log(`✓ ${file} — valid ${isRegister ? `act register (${n} acts)` : `constitution (${n} articles)`}`)
    process.exit(0)
  }
  console.error(`✗ ${file} — ${validate.errors.length} schema error(s):`)
  for (const e of validate.errors) console.error(`    ${e.instancePath || '/'}: ${e.message}`)
  process.exit(1)
}

switch (command) {
  case 'validate': {
    if (rest[0]) { await validateOne(rest[0]); break }
    // No argument: run the full corpus check, including relational rules.
    const { validate } = await import('./validate.mjs')
    const { rep } = validate()
    for (const e of rep.errors) console.error(`ERROR [${e.code}] ${e.file} ${e.where ?? ''}: ${e.message}`)
    for (const w of rep.warnings) console.warn(`warn  [${w.code}] ${w.file} ${w.where ?? ''}: ${w.message}`)
    console.log(rep.errors.length ? `FAILED — ${rep.errors.length} error(s)` : `PASSED — 0 errors, ${rep.warnings.length} warning(s)`)
    process.exit(rep.errors.length ? 1 : 0)
    break
  }
  case 'build': {
    const { build, BASE_PATH } = await import('./build.mjs')
    const { written, og } = build()
    console.log(`built ${written.length} pages under ${BASE_PATH} (${og.made} OG images)`)
    break
  }
  case 'bill':
  case 'act': {
    const { runBillCommand } = await import('./bill-commands.mjs')
    await runBillCommand(command, rest)
    break
  }
  case 'spec':
    await import('./gen-spec.mjs')
    break
  case '--version':
  case '-v': {
    const pkg = JSON.parse(fs.readFileSync(path.join(HERE, '../package.json'), 'utf8'))
    console.log(pkg.version)
    break
  }
  case '--help':
  case '-h':
  case undefined:
    console.log(USAGE.trim())
    break
  default:
    console.error(`opencodelaw: unknown command "${command}"`)
    console.log(USAGE.trim())
    process.exit(2)
}
