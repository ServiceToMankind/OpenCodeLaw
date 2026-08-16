/**
 * `opencodelaw bill …` and `opencodelaw act …`.
 *
 * Every guard failure names the missing thing and what to do about it: these
 * messages are read by a coordinator, not a developer.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import yaml from 'js-yaml'
import {
  ROOT, loadBill, loadConstitution, validateBill, report, tally, classifyOperation,
  fullText, operationText, REQUIRED_BODIES, OPERATION_STATUS,
  resolveTarget, parentIdOf, ownText, provisionIndex, unsettledOperations, applyOperation
} from './bill.mjs'
import { billToYaml } from './scripts/bill-serialise.mjs'

const OPTS = { schema: yaml.CORE_SCHEMA }
const DUMP = { lineWidth: -1, noRefs: true, quotingType: '"' }
const today = () => new Date().toISOString().slice(0, 10)

/**
 * Bill files are written through the same emitter the propose page uses.
 *
 * Not for the hash — that is computed from parsed content and never depended on
 * serialisation. The reasons are operational: a page-authored draft re-dumped
 * by a different dumper is wholly reformatted at submission, so the gate's
 * reviewer sees style noise burying the one substantive change, and this
 * system's review culture is "read the diff". It also puts both producers under
 * the round-trip guard, which previously covered only the browser's path.
 *
 * Register and constitution writes keep js-yaml; they were never part of this.
 *
 * Note that any write strips comments: an emitter emits an object, and comments
 * are not in the object.
 */
const save = (file, bill) => fs.writeFileSync(file, billToYaml(bill, { header: false }))

function push (bill, from, to, actor, evidence, note) {
  bill.history ??= []
  bill.history.push({ date: today(), from, to, actor, ...(evidence ? { evidence } : {}), ...(note ? { note } : {}) })
  bill.status = to
}

export function billsDir (year) {
  return path.join(ROOT, 'bills', String(year))
}

export function listBills () {
  const base = path.join(ROOT, 'bills')
  if (!fs.existsSync(base)) return []
  const out = []
  for (const year of fs.readdirSync(base)) {
    const dir = path.join(base, year)
    if (!fs.statSync(dir).isDirectory()) continue
    for (const f of fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f))) {
      const file = path.join(dir, f)
      try { out.push({ file, rel: path.relative(ROOT, file), bill: loadBill(file) }) } catch { /* skip unreadable */ }
    }
  }
  return out
}

// ---------------------------------------------------------------------------

export function billNew ({ type = 'amendment', year = new Date().getFullYear(), name } = {}) {
  const template = fs.readFileSync(path.join(ROOT, 'bills/TEMPLATE.yaml'), 'utf8')
  const dir = billsDir(year)
  fs.mkdirSync(dir, { recursive: true })
  const slug = (name ?? `draft-${Date.now()}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const file = path.join(dir, `${slug}.yaml`)
  if (fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} already exists`)

  const doc = loadConstitution()
  const body = template
    .replace(/^  year: \d+$/m, `  year: ${year}`)
    .replace(/^  type: amendment .*$/m, `  type: ${type}                         # amendment | corrigendum | revision`)
    .replace(/^  base_version: "[^"]*"$/m, `  base_version: "${doc.info.version}"`)
    .replace(/^  drafted: .*$/m, `  drafted: ${today()}`)
  fs.writeFileSync(file, body)
  return { file, rel: path.relative(ROOT, file), baseVersion: doc.info.version }
}

export function billSubmit (file, { actor = 'ICC' } = {}) {
  const bill = loadBill(file)
  if (bill.status !== 'draft') {
    throw new Error(`This bill is "${bill.status}", not a draft. Only a draft can be submitted.`)
  }
  const { problems } = validateBill(file)
  if (problems.errors.length) {
    throw new Error('This bill does not validate, so it cannot be submitted. Run ' +
      '`opencodelaw bill validate` and fix the errors listed there first.')
  }
  const year = bill.bill.year
  const taken = listBills()
    .filter(b => b.bill.bill.year === year && typeof b.bill.bill.number === 'number')
    .map(b => b.bill.bill.number)
  bill.bill.number = (taken.length ? Math.max(...taken) : 0) + 1
  push(bill, 'draft', 'submitted', actor, null, `Numbered Bill ${bill.bill.number} of ${year} on submission.`)
  save(file, bill)
  return { number: bill.bill.number, year }
}

// ---------------------------------------------------------------------------

/**
 * `constitution` is a seam, not a feature: `actApply` already validates against
 * a document it is handed, and this one could only ever validate against the
 * real constitution — so a bill drafted on the fixture could not be enacted
 * even in a test, and the enactment guards had no fixture coverage at all. The
 * CLI passes nothing and the default is unchanged.
 */
export function actEnact (file, { actor = 'ICC', signedPdf, signedBy, assentDate, assentedBy, constitution } = {}) {
  const bill = loadBill(file)
  const { problems, tally: t } = validateBill(file, { constitution })

  const blockers = []
  if (!['approved', 'scheduled', 'submitted', 'under-review'].includes(bill.status)) {
    blockers.push(`This bill is "${bill.status}". Only a bill that has been through approval can be enacted.`)
  }
  if (t.missingBodies.length) {
    blockers.push(`No approval is recorded for: ${t.missingBodies.join(', ')}. Article 16(3) requires ` +
      'the board, the intermediate board and the units — all three. Record each meeting\'s tally and ' +
      'its minutes reference before enacting.')
  }
  if (t.missingEvidence.length) {
    blockers.push(`These bodies approved but have no minutes reference: ${t.missingEvidence.join(', ')}. ` +
      'An approval with no evidence is an assertion; add the minutes reference to `evidence`.')
  }
  if (t.complete && !t.passes) {
    blockers.push(`Below the threshold in: ${t.failedBodies.join(', ')}. Article 16(3) needs two thirds ` +
      'of those present and voting' +
      (t.pooled.passes
        ? '. The pooled vote across all three bodies does pass — but until the board resolves by ' +
          'resolution what "collectively" means, the stricter reading governs and each body must ' +
          'reach two thirds on its own.'
        : '.'))
  }
  if (!signedPdf) blockers.push('No signed PDF given. Pass --signed-pdf <path> to the scanned, signed instrument.')
  else if (!fs.existsSync(path.join(ROOT, signedPdf))) blockers.push(`The signed PDF ${signedPdf} is not on disk.`)

  const schemaErrors = problems.errors.filter(e => !['approvals-incomplete', 'approval-evidence-missing', 'threshold-not-met', 'enactment-incomplete'].includes(e.code))
  for (const e of schemaErrors) blockers.push(e.message)

  if (blockers.length) {
    throw new Error('This bill cannot be enacted yet:\n' + blockers.map(b => `  - ${b}`).join('\n'))
  }

  const year = bill.bill.year
  const takenActs = listBills()
    .filter(b => b.bill.enactment?.act_year === year && b.bill.enactment?.act_number)
    .map(b => b.bill.enactment.act_number)
  const actNumber = (takenActs.length ? Math.max(...takenActs) : 0) + 1

  const abs = path.join(ROOT, signedPdf)
  bill.enactment = {
    ...(bill.enactment ?? {}),
    act_number: actNumber,
    act_year: year,
    assent_date: assentDate ?? today(),
    assented_by: assentedBy ?? 'Internal Compliance Committee',
    signed_by: signedBy ?? null,
    signed_pdf: signedPdf,
    signed_pdf_sha256: crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'),
    rendered_from: path.relative(ROOT, path.resolve(file))
  }
  push(bill, bill.status, 'enacted', actor, signedPdf, `Enacted as Act ${actNumber} of ${year}.`)
  save(file, bill)
  return { actNumber, year, sha256: bill.enactment.signed_pdf_sha256 }
}

// ---------------------------------------------------------------------------

/**
 * Apply an enacted Act. The bill's own operations are the expected-change
 * manifest: nothing outside them may move, and each operation is classified
 * three ways before anything is written.
 */
export function actApply (file, { actor = 'ICC', dryRun = false, constitutionFile = 'constitution/current.yaml' } = {}) {
  const bill = loadBill(file)
  if (bill.status !== 'enacted') {
    throw new Error(`This bill is "${bill.status}". Only an enacted Act can be applied.`)
  }
  const doc = loadConstitution(constitutionFile)
  if (bill.bill.base_version !== doc.info.version) {
    throw new Error(
      `This Act was drafted against constitution ${bill.bill.base_version} and the constitution is ` +
      `now ${doc.info.version}. It cannot be applied to text it was not approved against. The bill ` +
      'must be rebased and re-approved.')
  }

  const { problems } = validateBill(file, { constitution: doc })
  const fatal = problems.errors.filter(e => e.code !== 'enactment-incomplete')
  if (fatal.length) {
    throw new Error('This Act does not validate:\n' + fatal.map(e => `  - ${e.message}`).join('\n'))
  }

  const before = structuredClone(doc)
  const actId = `act-${bill.enactment.act_number}-${bill.enactment.act_year}`
  const outcomes = []

  for (const op of bill.operations) {
    const node = resolveTarget(doc, op.target)?.node ?? null

    // THE SKIP DECISION IS classifyOperation, and nothing else. A private
    // shortcut here is how a heading came to be skipped behind a content match
    // — Article 12's defect, reborn inside the applier written to prevent it.
    const verdict = classifyOperation(op, node, null)

    if (verdict === 'divergent') {
      throw new Error(
        `ABORT: ${op.target} does not read as this Act expects. It says neither what the Act ` +
        'prescribes nor what the Act was drafted against, which means it was changed by something ' +
        'else. Nothing has been written. Resolve the divergence before applying.')
    }
    if (verdict === 'already-applied') { outcomes.push({ op: op.id, target: op.target, result: 'already applied' }); continue }

    try {
      applyOperation(doc, op, { actId })
    } catch (err) {
      throw new Error(`ABORT: ${op.id} (${op.operation} ${op.target}) could not be applied — ${err.message} Nothing has been written.`)
    }
    outcomes.push({ op: op.id, target: op.target, result: 'applied' })
  }

  // --- the Act must have actually landed -----------------------------------
  //
  // Applying is not finished when the loop ends; it is finished when the
  // document reads as the Act prescribes. Every operation is re-classified
  // against what was just written, so an operation that quietly did nothing
  // cannot report success. That is the structural close on the whole class of
  // defect the clause-scope omission belonged to, rather than on that one
  // instance of it: a future operation bug can be silent only by making its own
  // target read as prescribed, which is the same thing as working.
  const unsettled = unsettledOperations(bill, doc)
  if (unsettled.length) {
    throw new Error(
      'ABORT: this Act was applied and the constitution still does not read as it prescribes. ' +
      'Nothing has been written.\n' +
      unsettled.map(u => `  - ${u.op.id} (${u.op.operation} ${u.op.target}): ${u.reason}`).join('\n'))
  }

  // --- nothing outside the manifest may have moved -------------------------
  //
  // Per provision, on its OWN text. `fullText` includes a provision's clauses,
  // so a lawful clause-scope operation made its article look like an undeclared
  // change and aborted the Act — which is why no clause-scope substitution or
  // retitle could be applied at all. A provision may move when its own id is
  // declared, or when its article's is: an article-scope substitution restates
  // the clauses it carries.
  const declared = new Set(bill.operations.map(o => o.target))
  const permitted = id => declared.has(id) || declared.has(parentIdOf(id))
  const snap = d => {
    const m = new Map()
    for (const [id, entry] of provisionIndex(d)) m.set(id, ownText(entry.node))
    return m
  }
  const s0 = snap(before); const s1 = snap(doc)
  const moved = [...new Set([...s0.keys(), ...s1.keys()])].filter(k => s0.get(k) !== s1.get(k))
  const outside = moved.filter(k => !permitted(k))
  if (outside.length) {
    throw new Error(`ABORT: these provisions changed but the Act does not touch them: ${outside.join(', ')}. ` +
      'Nothing has been written.')
  }

  // --- version bump --------------------------------------------------------
  const [maj, min, pat] = doc.info.version.split('.').map(Number)
  doc.info.version = bill.bill.version_bump === 'major' ? `${maj + 1}.0.0` : `${maj}.${min + 1}.${pat}`
  doc.info.effective_from = bill.enactment.assent_date
  doc.info.legal_status = 'adopted'

  if (!dryRun) {
    fs.writeFileSync(path.join(ROOT, constitutionFile), yaml.dump(doc, DUMP))
    push(bill, 'enacted', 'applied', actor, null, `Applied to the constitution; version ${doc.info.version}.`)
    save(file, bill)
  }
  return { actId, outcomes, version: doc.info.version, moved }
}

export { report, validateBill, tally, loadBill }
