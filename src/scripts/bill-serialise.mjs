/**
 * The bill's canonical form, its hash subject, and its YAML.
 *
 * Shared verbatim by the CLI (Node) and the propose page (browser). It lives
 * under scripts/ because the build ships that directory to the site; the point
 * is that there is exactly ONE of each of these functions, for the same reason
 * there is exactly one schema.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INVARIANT
 *
 *   Hash what will be PARSED, never what is DISPLAYED.
 *
 * The substantive hash is computed on the bytes → parse → canonical-JSON
 * pipeline. Any code path that hashes screen state, a textarea's value, or a
 * pre-serialisation object recreates the defect this comment exists to prevent:
 * the propose page once displayed a hash the CLI did not agree with, because a
 * YAML block scalar round-trips with exactly one trailing newline and the page
 * was hashing the raw textarea. A meeting would have read a hash into its
 * minutes that did not match the file it was voting on.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * The exact string a YAML `|` block yields on the way back in.
 *
 * Block-scalar chomping makes trailing newlines representationally unstable,
 * which is what bit the hash — and what would otherwise produce a phantom edit,
 * where an author changes nothing and the applier reports a change nobody made.
 * Normalising here, in one place used by both sides, is what keeps
 * "unchanged text" comparing equal.
 */
export const blockText = s => {
  const body = String(s ?? '').replace(/\s+$/, '')
  // Empty stays empty. A YAML `|` block with no content yields '', not '\n',
  // so claiming a newline here would be a value the format cannot round-trip —
  // and a provision with no text is empty, not "a newline".
  return body === '' ? '' : body + '\n'
}

/** RFC 8785-style canonical JSON: sorted keys, no insignificant whitespace. */
export function canonicalJson (value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  return '{' + Object.keys(value).sort()
    .filter(k => value[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + canonicalJson(value[k]))
    .join(',') + '}'
}

/** The fields a body actually votes on. Everything else is clerking. */
export const SUBSTANTIVE_FIELDS = ['short_title', 'type', 'base_version', 'objects_and_reasons', 'operations']

export function substantiveSubject (bill) {
  return {
    short_title: bill?.bill?.short_title ?? null,
    type: bill?.bill?.type ?? null,
    base_version: bill?.bill?.base_version ?? null,
    objects_and_reasons: bill?.objects_and_reasons ?? null,
    operations: bill?.operations ?? []
  }
}

// ---------------------------------------------------------------------------
// YAML
// ---------------------------------------------------------------------------

/**
 * Keys the propose page must never emit with a value. This list IS the page's
 * authority boundary, written down: the form produces drafts, and structurally
 * cannot produce a numbered, approved or enacted bill.
 */
export const PAGE_EXCLUDED = Object.freeze([
  'bill.number',        // the ICC numbers a bill at submission
  'history',            // written by the pipeline, never by an author
  'approvals[].meeting.mode',
  'approvals[].meeting.place',
  'approvals[].meeting.presiding',
  'approvals[].present',
  'approvals[].for',
  'approvals[].against',
  'approvals[].abstain',
  'approvals[].bill_sha256',
  'approvals[].evidence',
  'approvals[].recorded_by',
  'approvals[].note',
  'enactment.act_number',
  'enactment.act_year',
  'enactment.assent_date',
  'enactment.assented_by',
  'enactment.signed_by',
  'enactment.signed_pdf',
  'enactment.signed_pdf_sha256',
  'enactment.rendered_from'
])

/**
 * Emit an optional key only when it is PRESENT — never when it is merely
 * truthy. An empty string is not absence, and neither is null: both record
 * something (a field deliberately left blank, a transition with no evidence)
 * that a falsy test would erase. This is the same defect twice over, so it is
 * funnelled through one helper.
 */
const opt = (obj, key, line) => (key in obj && obj[key] !== undefined) ? [line(obj[key])] : []

const scalar = s => {
  const str = String(s ?? '')
  return /^[\w .,'’()\-/&:]+$/.test(str) && !/^\s|\s$/.test(str) && !/:\s/.test(str)
    ? str
    : JSON.stringify(str)
}

/**
 * Emit an arbitrary object. Needed for `history[].approval`, which carries a
 * voided approval verbatim and is deliberately open-ended in the schema: a
 * body's vote is a legislative fact even after the text moves on, so it is
 * preserved exactly as it stood rather than reshaped to a fixed form.
 */
function anyValue (v, indent) {
  const pad = ' '.repeat(indent)
  if (v === null || v === undefined) return '~'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'string') return v.includes('\n') ? `|\n${indentBlock(v, indent + 2)}` : scalar(v)
  if (Array.isArray(v)) {
    if (!v.length) return '[]'
    return '\n' + v.map(x => `${pad}- ${anyValue(x, indent + 2).replace(/^\n/, '')}`).join('\n')
  }
  const keys = Object.keys(v)
  if (!keys.length) return '{}'
  return '\n' + keys.map(k => `${pad}${k}: ${anyValue(v[k], indent + 2)}`).join('\n')
}

const indentBlock = (text, indent) => blockText(text).replace(/\n$/, '')
  .split('\n').map(l => (l ? ' '.repeat(indent) + l : '')).join('\n')

/**
 * Serialise a bill to YAML. Hand-written because a YAML library in the browser
 * is a large dependency for one fixed shape — and policed by a round-trip test
 * over a fixture with every optional field populated, plus a schema-coverage
 * test that fails BY NAME when the schema gains a field this does not handle.
 */
export function billToYaml (bill, { header = true } = {}) {
  const b = bill.bill
  const out = []
  if (header) {
    out.push('# Drafted with the propose page. Review it, then send it to the ICC.',
      '# The bill file is the source of truth; the signed PDF is a rendering of it.', '')
  }
  out.push('opencodelaw_bill: "1.0"', 'bill:')
  out.push(`  short_title: ${scalar(b.short_title)}`)
  out.push(...opt(b, 'also_known_as', v => `  also_known_as: ${scalar(v)}`))
  out.push(`  year: ${b.year}`)
  out.push(`  number: ${b.number == null ? '~' : b.number}`)
  out.push(`  type: ${b.type}`)
  out.push('  moved_by:')
  out.push(`    name: ${scalar(b.moved_by?.name)}`)
  out.push(...opt(b.moved_by ?? {}, 'role', v => `    role: ${scalar(v)}`))
  out.push(...opt(b.moved_by ?? {}, 'contact', v => `    contact: ${scalar(v)}`))
  out.push(`  drafted: ${b.drafted == null ? '~' : b.drafted}`)
  out.push(`  base_version: "${b.base_version}"`)
  out.push(`  version_bump: ${b.version_bump}`)
  out.push(`status: ${bill.status}`)

  if (!bill.history?.length) out.push('history: []')
  else {
    out.push('history:')
    for (const h of bill.history) {
      out.push(`  - date: ${h.date}`)
      out.push(...opt(h, 'from', v => `    from: ${v}`))
      out.push(`    to: ${h.to}`)
      out.push(`    actor: ${scalar(h.actor)}`)
      // Present-but-null is not the same as absent: dropping it loses the
      // record that this transition had no evidence, which is itself a fact.
      if ('evidence' in h) out.push(`    evidence: ${h.evidence == null ? '~' : scalar(h.evidence)}`)
      out.push(...opt(h, 'note', v => `    note: ${scalar(v)}`))
      out.push(...opt(h, 'approval', v => `    approval:${anyValue(v, 6)}`))
    }
  }

  if (blockText(bill.objects_and_reasons) === '') out.push('objects_and_reasons: ""')
  else { out.push('objects_and_reasons: |'); out.push(indentBlock(bill.objects_and_reasons, 2)) }

  out.push('operations:')
  for (const op of bill.operations ?? []) {
    out.push(`  - id: ${op.id}`)
    out.push(`    operation: ${op.operation}`)
    out.push(`    target: ${op.target}`)
    out.push(`    scope: ${op.scope}`)
    out.push(...opt(op, 'clauses', v => `    clauses: ${scalar(v)}`))
    out.push(...opt(op, 'title', v => `    title: ${scalar(v)}`))
    out.push(...opt(op, 'note', v => `    note: ${scalar(v)}`))
    out.push(...opt(op, 'source_lines', v => `    source_lines: ${scalar(v)}`))
    if (op.text != null) {
      const t = blockText(op.text)
      if (t === '') out.push('    text: ""')
      else { out.push('    text: |'); out.push(indentBlock(op.text, 6)) }
    }
    if (op.sections?.length) {
      out.push('    sections:')
      for (const s of op.sections) {
        out.push(`      - number: ${s.number}`)
        out.push(`        title: ${scalar(s.title)}`)
        const st = blockText(s.text)
        if (st === '') out.push('        text: ""')
        else { out.push('        text: |'); out.push(indentBlock(s.text, 10)) }
      }
    }
  }

  if (bill.approvals?.length) {
    out.push('approvals:')
    for (const a of bill.approvals) {
      out.push(`  - body: ${a.body}`)
      if (a.meeting) {
        const m = a.meeting
        const bits = [`date: ${m.date == null ? '~' : m.date}`]
        bits.push(...opt(m, 'mode', v => `mode: ${v}`))
        bits.push(...opt(m, 'place', v => `place: ${scalar(v)}`))
        bits.push(...opt(m, 'presiding', v => `presiding: ${scalar(v)}`))
        out.push(`    meeting: {${bits.join(', ')}}`)
      }
      for (const k of ['present', 'for', 'against', 'abstain']) {
        if (k in a) out.push(`    ${k}: ${a[k] == null ? '~' : a[k]}`)
      }
      if ('bill_sha256' in a) out.push(`    bill_sha256: ${a.bill_sha256 == null ? '~' : `"${a.bill_sha256}"`}`)
      if (a.evidence) {
        out.push('    evidence:')
        out.push(`      kind: ${a.evidence.kind}`)
        out.push(`      path: ${scalar(a.evidence.path)}`)
        out.push(`      sha256: "${a.evidence.sha256}"`)
        out.push(...opt(a.evidence, 'url', v => `      url: ${scalar(v)}`))
      }
      out.push(...opt(a, 'recorded_by', v => `    recorded_by: ${scalar(v)}`))
      out.push(...opt(a, 'note', v => `    note: ${scalar(v)}`))
    }
  }

  if (bill.enactment) {
    out.push('enactment:')
    for (const k of ['act_number', 'act_year', 'assent_date', 'assented_by', 'signed_by', 'signed_pdf', 'signed_pdf_sha256', 'rendered_from']) {
      if (!(k in bill.enactment)) continue
      const v = bill.enactment[k]
      out.push(`  ${k}: ${v == null ? '~' : (typeof v === 'number' ? v : scalar(v))}`)
    }
  }

  return out.join('\n') + '\n'
}
