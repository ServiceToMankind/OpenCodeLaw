#!/usr/bin/env node
/**
 * Compiles the bill schema into a standalone browser validator.
 *
 * The propose page must enforce the SAME schema the CLI enforces. Hand-writing
 * a second check in the page would create a second, drifting implementation —
 * which is the class of failure this project began with, when the docs, the
 * specs and the renderer each described a different root key.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import standaloneCode from 'ajv/dist/standalone/index.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function generateBillValidator () {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/opencodelaw-bill-1.0.schema.json'), 'utf8'))
  const ajv = new Ajv({ code: { source: true, esm: true }, allErrors: true, strict: false })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  return standaloneCode(ajv, validate)
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (direct) {
  const out = path.join(ROOT, 'dist/scripts/bill-validator.mjs')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, generateBillValidator())
  console.log(`wrote ${path.relative(ROOT, out)} (${fs.statSync(out).size} bytes)`)
}
