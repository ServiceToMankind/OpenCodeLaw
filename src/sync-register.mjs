#!/usr/bin/env node
/**
 * Derives the amendment register's factual fields from the instruments and the
 * constitution, so it cannot drift from the text it registers.
 *
 * `provisions` and `amends` come from `acts/text/` — what each Act actually
 * does. `application_status` comes from `constitution/current.yaml` — whether
 * each target records that Act in `amended_by`.
 *
 * Everything hand-authored (dates, signatories, drafting discrepancies, the
 * approval chain) is preserved untouched; only the derived fields are rewritten.
 *
 * This exists because the register said two Acts were "pending" on the same
 * page that said reconciliation was complete. A register disagreeing with the
 * text it registers is the exact failure this project was built to remove.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { loadActs } from './acts-parse.mjs'
import { ACT_ID } from './manifest.mjs'
import { statementOfObjectsLine } from './validate.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REGISTER = path.join(ROOT, 'acts/register.yaml')
const CURRENT = path.join(ROOT, 'constitution/current.yaml')
const OPTS = { schema: yaml.CORE_SCHEMA }

/** What the instruments say each Act does, and whether the text reflects it. */
/**
 * Acts born from bills derive their register entry from the bill file, the same
 * way external-pdf Acts derive theirs from acts/text/. Both halves are computed,
 * so neither kind can drift from the text it registers.
 */
export function deriveFromBills () {
  const dir = path.join(ROOT, 'bills')
  const out = new Map()
  if (!fs.existsSync(dir)) return out
  const doc = yaml.load(fs.readFileSync(CURRENT, 'utf8'), OPTS)
  const amendedBy = new Map([doc.preamble, ...(doc.articles ?? [])].map(n => [n.id, new Set(n.amended_by ?? [])]))

  for (const year of fs.readdirSync(dir)) {
    const yd = path.join(dir, year)
    if (!fs.statSync(yd).isDirectory()) continue
    for (const f of fs.readdirSync(yd).filter(f => /\.ya?ml$/.test(f))) {
      const bill = yaml.load(fs.readFileSync(path.join(yd, f), 'utf8'), OPTS)
      const e = bill?.enactment
      if (!e?.act_number || !e?.act_year) continue
      const actId = `act-${e.act_number}-${e.act_year}`
      const targets = [...new Set(bill.operations.map(o => o.target))]
      const reflected = targets.filter(t => amendedBy.get(t)?.has(actId))
      out.set(actId, {
        amends: targets,
        provisions: bill.operations.map(o => ({
          target: o.target, operation: o.operation, scope: o.scope,
          ...(o.title ? { note: `Act states the title as "${o.title}".` } : {})
        })),
        application_status: reflected.length === 0 ? 'pending' : (reflected.length === targets.length ? 'applied' : 'partially-applied'),
        reflected,
        bill_file: path.relative(ROOT, path.join(yd, f)),
        origin: 'bill'
      })
    }
  }
  return out
}

export function derive () {
  const doc = yaml.load(fs.readFileSync(CURRENT, 'utf8'), OPTS)
  const nodes = [doc.preamble, ...doc.articles]
  const amendedBy = new Map(nodes.map(n => [n.id, new Set(n.amended_by ?? [])]))

  const out = new Map()
  for (const act of loadActs(ROOT)) {
    const actId = ACT_ID[path.basename(act.file)]
    const sor = statementOfObjectsLine(fs.readFileSync(path.join(ROOT, act.file), 'utf8').replace(/\f/g, ''))

    const provisions = act.provisions.map(p => {
      const entry = {
        target: p.target,
        operation: p.operation,
        scope: p.scope,
        source_lines: `${p.source_line}-${Math.min(p.end_line, sor - 1)}`
      }
      if (p.clauses) entry.clauses = p.clauses
      if (p.enacted_title) entry.note = `Act restates the title as "${p.enacted_title}".`
      return entry
    })

    const targets = [...new Set(provisions.map(p => p.target))]
    const reflected = targets.filter(t => amendedBy.get(t)?.has(actId))
    const status = reflected.length === 0
      ? 'pending'
      : (reflected.length === targets.length ? 'applied' : 'partially-applied')

    out.set(actId, { amends: targets, provisions, application_status: status, reflected, origin: 'external-pdf' })
  }
  // Acts born from bills are derived from their bill file instead.
  for (const [id, d] of deriveFromBills()) out.set(id, d)
  return out
}

export function syncRegister ({ write = true } = {}) {
  const register = yaml.load(fs.readFileSync(REGISTER, 'utf8'), OPTS)
  const derived = derive()
  const changes = []

  for (const act of register.acts) {
    const d = derived.get(act.id)
    if (!d) continue
    if (act.application_status !== d.application_status) {
      changes.push(`${act.id}: status ${act.application_status} -> ${d.application_status}`)
    }
    const beforeCount = act.provisions?.length ?? 0
    if (beforeCount !== d.provisions.length) {
      changes.push(`${act.id}: provisions ${beforeCount} -> ${d.provisions.length}`)
    }
    act.application_status = d.application_status
    act.amends = d.amends
    act.provisions = d.provisions
  }

  if (write && changes.length) {
    const header = fs.readFileSync(REGISTER, 'utf8').split('\n')
      .filter(l => l.startsWith('#')).join('\n')
    fs.writeFileSync(REGISTER, (header ? header + '\n\n' : '') +
      yaml.dump(register, { lineWidth: -1, noRefs: true, quotingType: '"' }))
  }
  return changes
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (direct) {
  const changes = syncRegister({ write: !process.argv.includes('--check') })
  if (!changes.length) { console.log('register: already in step with the instruments and the text'); process.exit(0) }
  for (const c of changes) console.log('  ' + c)
  if (process.argv.includes('--check')) { console.error('\nregister has drifted; run `npm run sync-register`'); process.exit(1) }
  console.log(`\nregister updated (${changes.length} change(s))`)
}
