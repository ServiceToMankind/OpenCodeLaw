#!/usr/bin/env node
/**
 * The historical re-check, run once when the comparator was split in two.
 *
 * `normalise` was born comparing YAML against `pdftotext` output, where folding
 * whitespace, case, typography and enumerator formatting is correct — noise is
 * not text. It was then promoted into `classifyOperation`, the apply loop and
 * the self-audit, where both sides are canonical YAML and NOTHING is noise. In
 * that world a renumbered clause is an amendment and `units` → `Units` is a
 * retitle, so the fold was silently deciding that real changes had already
 * happened.
 *
 * Splitting it changes what the system would say about the record. This reads
 * the record and says what changed. It WRITES NOTHING, and it fixes nothing:
 *
 *   - The 2024 verdicts stay FORENSIC. Those Acts were compared against text
 *     extracted from scanned PDFs; tolerance was their job and remains correct
 *     for them. PROVENANCE.md is not reopened by a comparator migration.
 *   - Where the two comparators now disagree, that is a FINDING for the record.
 *     A migration that quietly absorbed such a disagreement would be doing the
 *     exact thing this project exists to prevent — changing what the document
 *     is taken to say, with no instrument behind it.
 *
 *   node src/comparator-recheck.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { normalise, operativeEqual, forensicEqual, similarity, MATCH_THRESHOLD } from './text-compare.mjs'
import { provisionIndex, fullText, classifyOperation } from './scripts/bill-core.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OPTS = { schema: yaml.CORE_SCHEMA }
const load = rel => yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'), OPTS)

export function recheck () {
  const doc = load('constitution/current.yaml')
  const index = provisionIndex(doc)
  const register = fs.existsSync(path.join(ROOT, 'acts/register.yaml'))
    ? load('acts/register.yaml')
    : { acts: [] }

  const rows = []

  // --- 1. The applied record: every Act, every provision it claims ---------
  //
  // The 2024 Acts exist as prose instruments, not as bill files: their
  // operations were transcribed by hand, which is the defect the whole
  // pipeline was built to retire. So there is no operative text to compare
  // against — only the extracted PDF text, which is forensic by construction.
  // That is itself the finding, and it is stated rather than worked around.
  for (const act of register.acts ?? []) {
    for (const p of act.provisions ?? []) {
      const node = index.get(p.target)?.node ?? null
      rows.push({
        kind: 'act-provision',
        act: `Act ${act.number} of ${act.year}`,
        target: p.target,
        resolves: !!node,
        source: 'pdf-extract',
        comparator: 'forensic',
        note: 'no operative text on record — this Act was transcribed from a signed PDF'
      })
    }
  }

  // --- 2. Bills on disk: these DO carry operative text ---------------------
  const bills = []
  const base = path.join(ROOT, 'bills')
  if (fs.existsSync(base)) {
    for (const year of fs.readdirSync(base)) {
      const dir = path.join(base, year)
      if (!fs.statSync(dir).isDirectory()) continue
      for (const f of fs.readdirSync(dir).filter(n => /\.ya?ml$/.test(n))) {
        bills.push({ rel: `bills/${year}/${f}`, bill: load(`bills/${year}/${f}`) })
      }
    }
  }

  for (const { rel, bill } of bills) {
    for (const op of bill.operations ?? []) {
      const node = index.get(op.target)?.node ?? null
      // The verdict each comparator gives, side by side. A reclassification is
      // the only thing that matters here.
      const operative = classifyOperation(op, node, null)
      const forensicSame = forensicEqual(fullText(node), op.text ?? '')
      const operativeSame = operativeEqual(fullText(node), op.text ?? '')
      if (forensicSame !== operativeSame || op.title != null) {
        rows.push({
          kind: 'bill-operation',
          file: rel,
          op: op.id,
          target: op.target,
          operative,
          forensicSame,
          operativeSame,
          reclassified: forensicSame !== operativeSame
        })
      }
    }
  }

  // --- 3. Where the two comparators disagree about the live text -----------
  //
  // Every provision, against itself under both folds. They cannot disagree
  // here — a string equals itself — but a provision whose text differs from its
  // own title only by case or numbering is exactly the shape that used to be
  // invisible, so the count of provisions the forensic fold would collapse is
  // worth stating.
  const collapsible = []
  const seen = new Map()
  for (const [id, entry] of index) {
    const key = normalise(fullText(entry.node))
    if (!key) continue
    if (seen.has(key)) collapsible.push([seen.get(key), id])
    else seen.set(key, id)
  }

  return { rows, collapsible, provisions: index.size, version: doc.info.version, bills: bills.length }
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (direct) {
  const r = recheck()
  console.log(`comparator re-check — constitution ${r.version}, ${r.provisions} provisions, ${r.bills} bill file(s)`)
  console.log('')

  const acts = r.rows.filter(x => x.kind === 'act-provision')
  console.log(`Applied record: ${acts.length} provision claim(s) across the register.`)
  const unresolved = acts.filter(a => !a.resolves)
  console.log(`  resolve against the current text: ${acts.length - unresolved.length}/${acts.length}`)
  if (unresolved.length) {
    for (const a of unresolved) console.log(`  UNRESOLVED  ${a.act} → ${a.target}`)
  }
  console.log('  comparator: FORENSIC, unchanged. Every one of these Acts was transcribed from a')
  console.log('  signed PDF, so there is no operative text on record to compare. Splitting the')
  console.log('  comparator cannot reclassify them, and PROVENANCE.md is not reopened.')
  console.log('')

  const ops = r.rows.filter(x => x.kind === 'bill-operation')
  const moved = ops.filter(o => o.reclassified)
  console.log(`Bill operations carrying operative text: ${ops.length}`)
  console.log(`  RECLASSIFIED by the split: ${moved.length}`)
  for (const o of moved) {
    console.log(`    ${o.file} ${o.op} ${o.target}: forensic ${o.forensicSame ? 'same' : 'differs'} → operative ${o.operativeSame ? 'same' : 'differs'} (now ${o.operative})`)
  }
  console.log('')

  console.log(`Provisions the forensic fold would collapse onto each other: ${r.collapsible.length}`)
  for (const [a, b] of r.collapsible) console.log(`    ${a} ≡ ${b} under the forensic fold`)
  console.log('')
  console.log(r.collapsible.length || moved.length
    ? 'FINDINGS ABOVE. Nothing has been written. Rule on them before relying on the split.'
    : 'No reclassification. The split changes no verdict already on the record.')
}
