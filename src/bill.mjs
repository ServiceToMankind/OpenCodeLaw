#!/usr/bin/env node
/**
 * Bills: validation, the Article 16(3) threshold, and application.
 *
 * The inversion this phase exists for: the bill YAML is the source of truth and
 * the signed PDF is a rendering of it. Because an operation carries the
 * COMPLETE resulting text of its target, application is a comparison rather
 * than a transcription — which is what makes it idempotent by construction
 * instead of by luck.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { normalise } from './text-compare.mjs'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OPTS = { schema: yaml.CORE_SCHEMA }
export const BILL_SCHEMA = 'schema/opencodelaw-bill-1.0.schema.json'

/** The three bodies Article 16(3) names. All are required; none is inferred. */
export const REQUIRED_BODIES = ['board', 'intermediate-board', 'units']

/**
 * Article 16(3) requires "2/3rd present and voting of the board, the
 * intermediate board and units of the NGO collectively".
 *
 * "Collectively" bears two readings: a pooled vote of all three sitting
 * together, or 2/3 within each body. Until the board adopts one by resolution,
 * enactment requires the STRICTER reading — 2/3 in each body separately — and
 * both tallies are recorded, so an Act cannot later be challenged under
 * whichever reading is adopted.
 *
 * Abstentions are excluded from the denominator: the text says present AND
 * VOTING.
 */
export const THRESHOLD = 2 / 3

export function tally (approvals = []) {
  const perBody = REQUIRED_BODIES.map(body => {
    const a = approvals.find(x => x.body === body)
    const forVotes = a?.for ?? null
    const against = a?.against ?? null
    const voting = forVotes == null || against == null ? null : forVotes + against
    const ratio = voting ? forVotes / voting : null
    return {
      body,
      recorded: !!a,
      date: a?.date ?? null,
      present: a?.present ?? null,
      for: forVotes,
      against,
      abstain: a?.abstain ?? null,
      voting,
      ratio,
      passes: ratio != null && ratio >= THRESHOLD,
      evidence: a?.evidence ?? null,
      billSha256: a?.bill_sha256 ?? null,
      meeting: a?.meeting ?? null
    }
  })

  const complete = perBody.every(b => b.recorded && b.voting != null)
  const pooledFor = perBody.reduce((n, b) => n + (b.for ?? 0), 0)
  const pooledVoting = perBody.reduce((n, b) => n + (b.voting ?? 0), 0)
  const pooledRatio = pooledVoting ? pooledFor / pooledVoting : null

  return {
    perBody,
    complete,
    pooled: { for: pooledFor, voting: pooledVoting, ratio: pooledRatio, passes: pooledRatio != null && pooledRatio >= THRESHOLD },
    // The stricter reading governs.
    passes: complete && perBody.every(b => b.passes),
    missingBodies: perBody.filter(b => !b.recorded).map(b => b.body),
    missingEvidence: perBody.filter(b => b.recorded && !b.evidence?.path).map(b => b.body),
    failedBodies: perBody.filter(b => b.recorded && b.voting != null && !b.passes).map(b => b.body)
  }
}

// ---------------------------------------------------------------------------

/**
 * The COMPILED validator is memoised, not just the Ajv instance.
 *
 * Ajv registers a schema under its `$id` on compile, so compiling the same
 * schema twice against one instance throws "schema with key or id … already
 * exists". That made validating two bills in a single process fail on the
 * second — which a CLI that validates a directory, or the site build, would hit
 * immediately.
 */
let _validateBillSchema
function billValidator () {
  if (!_validateBillSchema) {
    const ajv = new Ajv({ allErrors: true, strict: false })
    addFormats(ajv)
    _validateBillSchema = ajv.compile(JSON.parse(fs.readFileSync(path.join(ROOT, BILL_SCHEMA), 'utf8')))
  }
  return _validateBillSchema
}

export function loadBill (file) {
  return yaml.load(fs.readFileSync(file, 'utf8'), OPTS)
}

export function loadConstitution (rel = 'constitution/current.yaml') {
  return yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'), OPTS)
}

const provisionsOf = doc => {
  const m = new Map()
  if (doc.preamble) m.set(doc.preamble.id, { node: doc.preamble, kind: 'preamble' })
  for (const a of doc.articles ?? []) {
    m.set(a.id, { node: a, kind: 'article' })
    for (const s of a.sections ?? []) m.set(s.id, { node: s, kind: 'section', parent: a })
  }
  return m
}

/** Everything a reader sees under a provision, for the three-way comparison. */
export const fullText = node => node
  ? [node.content ?? '', ...(node.sections ?? []).flatMap(s => [s.title ?? '', s.content ?? ''])].join('\n').trim()
  : ''

/** The text an operation results in, in the same shape as fullText. */
export const operationText = op =>
  [op.text ?? '', ...(op.sections ?? []).flatMap(s => [s.title ?? '', s.text ?? ''])].join('\n').trim()

// ---------------------------------------------------------------------------

class Problems {
  constructor () { this.items = [] }
  error (code, message, where) { this.items.push({ level: 'error', code, message, where }) }
  warn (code, message, where) { this.items.push({ level: 'warn', code, message, where }) }
  get errors () { return this.items.filter(i => i.level === 'error') }
  get warnings () { return this.items.filter(i => i.level === 'warn') }
}

/**
 * Validate a bill. Messages are written to be read by a coordinator, not a
 * developer: each names the missing thing and what to do about it.
 */
export function validateBill (file, { constitution } = {}) {
  const p = new Problems()
  const bill = loadBill(file)
  const validate = billValidator()

  if (!validate(bill)) {
    for (const e of validate.errors) {
      p.error('schema', `${e.instancePath || '/'} ${e.message}`, e.instancePath)
    }
    return { bill, problems: p, manifest: [] }
  }

  const doc = constitution ?? loadConstitution()
  const provisions = provisionsOf(doc)

  // --- staleness -----------------------------------------------------------
  if (bill.bill.base_version !== doc.info.version) {
    p.error('rebase-required',
      `This bill was drafted against constitution version ${bill.bill.base_version}, but the ` +
      `constitution is now at ${doc.info.version}. Rebase it: re-check each operation against the ` +
      'current text, update base_version, and re-validate — so the approving bodies see what they ' +
      'are actually voting on.', 'bill.base_version')
  }

  // --- numbering -----------------------------------------------------------
  if (bill.bill.number != null && bill.status === 'draft') {
    p.error('numbered-draft',
      'This bill has a number but is still a draft. The ICC assigns a number at submission; an ' +
      'unnumbered draft is not yet before anyone.', 'bill.number')
  }
  if (bill.bill.number == null && !['draft', 'withdrawn'].includes(bill.status)) {
    p.error('unnumbered-bill',
      `A bill with status "${bill.status}" must carry a number assigned by the ICC.`, 'bill.number')
  }

  // --- operations ----------------------------------------------------------
  const seen = new Set()
  for (const [i, op] of (bill.operations ?? []).entries()) {
    const at = `operations[${i}] (${op.id})`
    if (seen.has(op.id)) p.error('duplicate-op', `${at}: id used more than once`, at)
    seen.add(op.id)

    // `renumber` is not in the enum, but authors will try the word.
    if (String(op.operation) === 'renumber' || /renumber/i.test(op.note ?? '')) {
      p.error('renumber-forbidden',
        `${at}: renumbering is not available in an ${bill.bill.type} bill. Article numbers are ` +
        'permanent citation handles — every Act, minute and shared link points at them. Renumbering ' +
        'is lawful only in a bill of type "revision", with a major version bump and an explicit ' +
        'anchor map recording where each provision moved.', at)
    }

    const existing = provisions.get(op.target)
    if (op.operation === 'insert') {
      if (existing) {
        p.error('insert-exists',
          `${at}: cannot insert ${op.target} — it already exists. Use "substitute" to replace its ` +
          'text, or "retitle" to change only its heading.', at)
      }
    } else if (!existing) {
      p.error('target-unresolved',
        `${at}: ${op.target} does not exist in constitution version ${bill.bill.base_version}. ` +
        'Check the id against the constitution, or use "insert" if the provision is new.', at)
    }

    // C1, asserted even though the schema makes it structurally impossible.
    if (/objects_and_reasons|statement of objects/i.test(op.text ?? '') ||
        /objects_and_reasons|statement of objects/i.test(op.note ?? '')) {
      p.error('sor-as-authority',
        `${at}: an operation may not derive its content from the Statement of Objects and Reasons. ` +
        'That statement is explanatory and is never a source of authority.', at)
    }

    if (op.operation === 'substitute' && existing) {
      const current = normalise(fullText(existing.node))
      const proposed = normalise(operationText(op))
      if (current === proposed && normalise(op.title ?? existing.node.title) === normalise(existing.node.title)) {
        p.warn('no-op',
          `${at}: the text proposed for ${op.target} is identical to what it already says. This ` +
          'operation would change nothing.', at)
      }
    }
  }

  // --- corrigendum constraint ---------------------------------------------
  if (bill.bill.type === 'corrigendum') {
    const flagged = knownDraftingDefects()
    for (const [i, op] of (bill.operations ?? []).entries()) {
      if (!flagged.has(op.target)) {
        p.error('corrigendum-scope',
          `operations[${i}] (${op.id}): a corrigendum may only correct a drafting error already on ` +
          `record, and ${op.target} is not among them. Provisions currently on record: ` +
          `${[...flagged].join(', ') || '(none)'}. If this is a substantive change, it needs an ` +
          'amendment bill.', `operations[${i}]`)
      }
    }
  }

  // --- approvals: evidence on disk, and bound to the text that was voted on --
  const hash = substantiveHash(bill)
  const stale = []
  for (const [i, a] of (bill.approvals ?? []).entries()) {
    const at = `approvals[${i}] (${a.body})`
    const voted = a.for != null || a.against != null

    if (a.evidence) {
      const abs = path.join(ROOT, a.evidence.path)
      if (!fs.existsSync(abs)) {
        p.error('evidence-missing',
          `${at}: the record of resolution ${a.evidence.path} is not in the repository. A live link ` +
          'is never evidence — archive the signed minutes (or the attested poll export) beside the ' +
          'bill and record its path and checksum.', at)
      } else if (a.evidence.sha256 && fileSha256(abs) !== a.evidence.sha256) {
        p.error('evidence-hash-mismatch',
          `${at}: ${a.evidence.path} does not match the checksum recorded with it. The archived ` +
          'record is not the document that was filed.', at)
      }
    } else if (voted) {
      p.error('evidence-missing',
        `${at}: a tally is recorded with no signed record of resolution. An approval without ` +
        'evidence is an assertion.', at)
    }

    // The voting rule: an approval binds to the text as voted, never to the title.
    if (voted && a.bill_sha256 && a.bill_sha256 !== hash) stale.push({ body: a.body, was: a.bill_sha256 })
    else if (voted && !a.bill_sha256) {
      p.error('approval-unbound',
        `${at}: no bill_sha256 recorded, so this vote is not bound to any particular text. ` +
        `The hash to record is ${hash}.`, at)
    }
  }

  if (stale.length) {
    p.error('approval-stale',
      `edit recorded — approvals by ${stale.map(s2 => s2.body).join(', ')} are void; move them to ` +
      'history and re-collect. ' +
      stale.map(s2 => `${s2.body} resolved on ${s2.was.slice(0, 12)}…`).join('; ') +
      `, the bill is now ${hash.slice(0, 12)}…. A rebase voids every approval, including when the ` +
      "bill's own operations are untouched: a provision can become contradictory purely because " +
      'other articles moved, and whether a rebase is semantically clean is not something a tool ' +
      'can adjudicate honestly.', 'approvals')
  }

  // --- lifecycle guards ----------------------------------------------------
  const t = tally(bill.approvals)
  if (['enacted', 'applied'].includes(bill.status)) {
    if (t.missingBodies.length) {
      p.error('approvals-incomplete',
        `Cannot be ${bill.status}: no approval recorded for ${t.missingBodies.join(', ')}. ` +
        'Article 16(3) requires the board, the intermediate board and the units — all three.', 'approvals')
    }
    if (t.missingEvidence.length) {
      p.error('approval-evidence-missing',
        `Cannot be ${bill.status}: ${t.missingEvidence.join(', ')} recorded an approval with no ` +
        'minutes reference. An approval without evidence is an assertion.', 'approvals')
    }
    if (t.complete && !t.passes) {
      p.error('threshold-not-met',
        `Cannot be ${bill.status}: ${t.failedBodies.join(', ')} did not reach two thirds of those ` +
        `present and voting${t.pooled.passes ? ' — the pooled vote across all three bodies does pass, ' +
        'but until the board resolves what "collectively" means in Article 16(3), the stricter ' +
        'reading governs and each body must pass separately' : ''}.`, 'approvals')
    }
  }
  if (bill.status === 'applied') {
    const e = bill.enactment ?? {}
    for (const [k, what] of [['act_number', 'an Act number'], ['assent_date', 'a date of assent'], ['signed_pdf', 'a signed PDF']]) {
      if (!e[k]) p.error('enactment-incomplete', `Cannot be applied: enactment is missing ${what}.`, `enactment.${k}`)
    }
    if (e.signed_pdf) {
      const abs = path.join(ROOT, e.signed_pdf)
      if (!fs.existsSync(abs)) {
        p.error('signed-pdf-missing', `Cannot be applied: ${e.signed_pdf} is not on disk.`, 'enactment.signed_pdf')
      } else if (e.signed_pdf_sha256) {
        const actual = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
        if (actual !== e.signed_pdf_sha256) {
          p.error('signed-pdf-mismatch',
            `The signed PDF on disk does not match the checksum recorded at enactment. Expected ` +
            `${e.signed_pdf_sha256}, found ${actual}. The archived instrument is not the one that was enacted.`,
            'enactment.signed_pdf_sha256')
        }
      }
    }
  }

  return { bill, problems: p, manifest: buildBillManifest(bill, doc), tally: t }
}

/** Provisions currently carrying a recorded drafting defect a corrigendum may fix. */
function knownDraftingDefects () {
  const out = new Set()
  const reg = path.join(ROOT, 'acts/register.yaml')
  if (fs.existsSync(reg)) {
    const r = yaml.load(fs.readFileSync(reg, 'utf8'), OPTS)
    for (const act of r.acts ?? []) {
      for (const d of act.drafting_discrepancy ?? []) if (d.provision) out.add(d.provision)
    }
  }
  return out
}

/**
 * What the bill would change, per operation, with before and after.
 * This is what an approval meeting reads.
 */
export function buildBillManifest (bill, doc) {
  const provisions = provisionsOf(doc)
  return (bill.operations ?? []).map(op => {
    const existing = provisions.get(op.target)
    const before = existing ? fullText(existing.node) : null
    const after = ['omit', 'reserve'].includes(op.operation) ? null : operationText(op)
    return {
      id: op.id,
      operation: op.operation,
      target: op.target,
      scope: op.scope,
      exists: !!existing,
      title_before: existing?.node.title ?? null,
      title_after: op.title ?? existing?.node.title ?? null,
      before,
      after,
      unchanged: before != null && after != null && normalise(before) === normalise(after)
    }
  })
}

/**
 * The three-way check that makes application idempotent.
 *
 *   current == proposed  → already applied, safe no-op
 *   current == base      → apply
 *   neither              → divergence, abort
 *
 * Re-running an applied Act cannot corrupt anything, which is the defect that
 * made re-running Act 1 of 2024 unsafe: its clause edits were line splices into
 * text that no longer existed after the first run.
 */
export function classifyOperation (op, currentNode, baseText = null) {
  const proposed = normalise(operationText(op))
  const current = normalise(fullText(currentNode))

  if (op.operation === 'insert') return currentNode ? 'divergent' : 'apply'
  if (['omit', 'reserve'].includes(op.operation)) return currentNode ? 'apply' : 'already-applied'
  if (op.operation === 'retitle') {
    return normalise(currentNode?.title ?? '') === normalise(op.title) ? 'already-applied' : 'apply'
  }
  if (current === proposed) return 'already-applied'
  if (baseText != null && current === normalise(baseText)) return 'apply'
  if (baseText == null) return 'apply'
  return 'divergent'
}

export function report ({ problems, manifest, tally: t, bill }) {
  const out = []
  const b = bill.bill
  out.push(`Bill: ${b.short_title}`)
  out.push(`  ${b.number ? `Bill ${b.number} of ${b.year}` : 'unnumbered draft'} · ${b.type} · status ${bill.status}`)
  out.push(`  moved by ${b.moved_by?.name ?? '—'} · against constitution ${b.base_version}`)
  out.push('')
  out.push(`  ${resolutionSentence(bill)}`)
  out.push('  Read that sentence into the minutes of every approving body: a vote binds to the')
  out.push('  hash, not to the title. Editing the bill afterwards voids the approvals.')
  out.push('')
  out.push(`Operations (${manifest.length}):`)
  for (const m of manifest) {
    out.push(`  ${m.id}  ${m.operation} ${m.target} (${m.scope})${m.unchanged ? '  — no change' : ''}`)
    if (m.title_before !== m.title_after) out.push(`      title: ${JSON.stringify(m.title_before)} → ${JSON.stringify(m.title_after)}`)
    if (m.before != null) out.push(`      before: ${m.before.replace(/\s+/g, ' ').slice(0, 100)}${m.before.length > 100 ? '…' : ''}`)
    if (m.after != null) out.push(`      after : ${m.after.replace(/\s+/g, ' ').slice(0, 100)}${m.after.length > 100 ? '…' : ''}`)
    if (m.after == null) out.push('      after : (provision removed)')
  }
  if (t) {
    out.push('')
    out.push('Approvals — Article 16(3) requires all three bodies:')
    for (const b2 of t.perBody) {
      const state = !b2.recorded ? 'not recorded'
        : b2.voting == null ? 'no tally'
          : `${b2.for}/${b2.voting} voting = ${(b2.ratio * 100).toFixed(1)}% ${b2.passes ? 'PASS' : 'BELOW 2/3'}`
      const flags = []
      if (b2.recorded && !b2.evidence?.path) flags.push('no record of resolution')
      if (b2.billSha256 && b2.billSha256 !== substantiveHash(bill)) flags.push('VOID — voted on different text')
      out.push(`  ${b2.body.padEnd(19)} ${state}${flags.length ? '  (' + flags.join('; ') + ')' : ''}`)
    }
    if (t.pooled.ratio != null) {
      out.push(`  pooled              ${t.pooled.for}/${t.pooled.voting} = ${(t.pooled.ratio * 100).toFixed(1)}% ${t.pooled.passes ? 'PASS' : 'BELOW 2/3'}`)
      out.push('  (both tallies recorded; the stricter per-body reading governs until the board resolves')
      out.push('   what "collectively" means in Article 16(3))')
    }
  }
  out.push('')
  for (const e of problems.errors) out.push(`ERROR [${e.code}] ${e.message}`)
  for (const w of problems.warnings) out.push(`warn  [${w.code}] ${w.message}`)
  out.push('')
  out.push(problems.errors.length ? `FAILED — ${problems.errors.length} error(s)` : `OK — ${problems.warnings.length} warning(s)`)
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// The substantive hash
// ---------------------------------------------------------------------------

/**
 * The fields a body actually votes on. Everything else — number, status,
 * history, approvals, enactment — is clerking that changes after drafting, and
 * including it would make a vote go stale for administrative reasons.
 */
export const SUBSTANTIVE_FIELDS = ['short_title', 'type', 'base_version', 'objects_and_reasons', 'operations']

/** RFC 8785-style canonical JSON: sorted keys, no insignificant whitespace. */
export function canonicalJson (value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  return '{' + Object.keys(value).sort()
    .filter(k => value[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + canonicalJson(value[k]))
    .join(',') + '}'
}

/**
 * sha256 over the canonical form of what the bill actually proposes.
 *
 * A vote binds to this, not to "Bill 1 of 2026" — a title is the same string
 * before and after someone edits an operation, and an approval recorded against
 * a title would silently survive a change to the text it approved.
 */
export function substantiveHash (bill) {
  const subject = {
    short_title: bill?.bill?.short_title ?? null,
    type: bill?.bill?.type ?? null,
    base_version: bill?.bill?.base_version ?? null,
    objects_and_reasons: bill?.objects_and_reasons ?? null,
    operations: bill?.operations ?? []
  }
  return crypto.createHash('sha256').update(canonicalJson(subject), 'utf8').digest('hex')
}

/** The sentence a meeting reads into its minutes. */
export function resolutionSentence (bill) {
  const b = bill.bill
  const name = b.number ? `Bill ${b.number} of ${b.year}` : `the draft bill "${b.short_title}"`
  return `This meeting resolves on ${name}, substantive hash ${substantiveHash(bill)}.`
}

export function fileSha256 (abs) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
}
