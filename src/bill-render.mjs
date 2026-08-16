/**
 * Rendering a bill as the instrument — plain text, and print-ready HTML.
 *
 * THIS OUTPUT IS A RENDERING AND NEVER THE SOURCE OF TRUTH. The bill YAML is:
 * it carries the complete resulting text of every provision it touches, and the
 * applier works from that. What this module produces — and the PDF a browser
 * prints from it — is a rendering of that YAML for people to read, sign and
 * file. If the two ever disagree, the YAML governs and the paper is stale.
 *
 * The 2024 Acts ran the other way round: prose PDFs, transcribed into the YAML
 * by hand. That is where the half-applied constitution, the unrecorded
 * application, the art-7 line splice and the fourteen reconciliation questions
 * came from. Inverting it is the whole point of this phase.
 *
 * The LAYOUT is not invented here. It is taken from the extracted text of the
 * 2024 Acts — acts/text/first-…, second-… and third-constitution-amendment-act-
 * 2024.txt — down to the assent line, the operative item phrasings ("Amendment
 * to Article 13:", "Insertion of new Article 21 - Financial Management:",
 * "Amendment of Preamble:", "Amendment to Article 6, clause 1,2,3,4 and 5:"),
 * the restated provision beneath each item, the ————— separator and the name
 * standing over the office in the signature block.
 *
 * The WORDING that belongs to one organisation is not. Committee, signatory
 * title, Act title pattern, enacting formula and the address footer are CONTENT:
 * they live in the constitution's `info.instrument` and are passed in —
 *
 *   renderBillText(bill, { info: doc.info, orgYear: 2, titles })
 *
 * — or given directly as `organization`, `committee`, `signatoryTitle`,
 * `footer`, `actTitlePattern`, `enactingFormula`, which override the block. A
 * fork replaces the YAML and the renderer follows without being edited.
 *
 * Two things are deliberately NOT printed:
 *   - `operations[].note` — a drafting note is explanatory, and convention C1
 *     keeps explanation out of operative text.
 *   - approval tallies — Article 16(3) approvals live in the bill record and in
 *     the register, not on the face of the instrument.
 */
import { escapeHtml } from './lib/paths.mjs'

/** Column width of the plain-text instrument, matching the extracted Acts. */
export const PAGE_WIDTH = 90

// House style is CONTENT, not engine: it lives in the constitution's
// `info.instrument` and is passed in. An organisation adopting this repository
// replaces those values and the renderer follows without being edited. The
// address footer of the 2024 Acts is therefore NOT a default here — it is in
// constitution/current.yaml, read from the extracted Act text.
export const FOOTER_LINES = Object.freeze([])

export const DEFAULT_ORGANIZATION = ''
// No default: a fork with no info.instrument must not print another
// organisation's committee on its masthead.
export const DEFAULT_COMMITTEE = ''
export const DEFAULT_SIGNATORY_TITLE = ''
export const DEFAULT_ACT_TITLE_PATTERN = '{ordinal} Constitution Amendment Act, {year}'
export const SEPARATOR = '—'.repeat(5)

/**
 * House style, resolved from `info.instrument` with direct options overriding.
 * Snake_case in the YAML, camelCase in the option — the YAML is the contract a
 * fork edits, the options are what a caller passes.
 */
export function houseStyle (options = {}) {
  const info = options.info ?? null
  const inst = options.instrument ?? info?.instrument ?? {}
  return {
    organization: options.organization ?? info?.organization ?? DEFAULT_ORGANIZATION,
    committee: options.committee ?? inst.committee ?? DEFAULT_COMMITTEE,
    signatoryTitle: options.signatoryTitle ?? inst.signatory_title ?? DEFAULT_SIGNATORY_TITLE,
    footer: options.footer ?? inst.footer_lines ?? FOOTER_LINES,
    actTitlePattern: options.actTitlePattern ?? inst.act_title_pattern ?? DEFAULT_ACT_TITLE_PATTERN,
    enactingFormula: options.enactingFormula ?? inst.enacting_formula ?? null
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const ORDINAL_WORDS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh',
  'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth',
  'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth']
const TENS_ORDINAL = ['', '', 'Twentieth', 'Thirtieth', 'Fortieth', 'Fiftieth', 'Sixtieth',
  'Seventieth', 'Eightieth', 'Ninetieth']
const TENS_CARDINAL = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy',
  'Eighty', 'Ninety']

/** 3 → "3rd". Used for the day in the assent line. */
export function ordinalNumber (n) {
  const i = Number(n)
  if (!Number.isFinite(i)) return String(n)
  const rem100 = Math.abs(i) % 100
  const rem10 = Math.abs(i) % 10
  const suffix = rem100 >= 11 && rem100 <= 13 ? 'th'
    : rem10 === 1 ? 'st' : rem10 === 2 ? 'nd' : rem10 === 3 ? 'rd' : 'th'
  return `${i}${suffix}`
}

/** 3 → "Third". The Act number becomes the ordinal in the title. */
export function ordinalWord (n) {
  const i = Number(n)
  if (!Number.isInteger(i) || i < 1) return null
  if (i < 20) return ORDINAL_WORDS[i]
  if (i < 100) {
    const tens = Math.floor(i / 10)
    const unit = i % 10
    return unit === 0 ? TENS_ORDINAL[tens] : `${TENS_CARDINAL[tens]}-${ORDINAL_WORDS[unit]}`
  }
  return ordinalNumber(i)
}

/** "2024-05-03" → "3rd May, 2024". Parsed as a plain date; no timezone shift. */
export function formatLongDate (iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  if (!m) return iso ? String(iso) : null
  const [, y, mo, d] = m
  const month = MONTHS[Number(mo) - 1]
  if (!month) return String(iso)
  return `${ordinalNumber(Number(d))} ${month}, ${y}`
}

/**
 * Provision headings for targets the bill does not restate itself. A
 * clause-scoped operation prints its article's heading above the clause, and
 * only the constitution knows it.
 */
export function titlesFromConstitution (doc) {
  const out = {}
  if (!doc) return out
  if (doc.preamble) out[doc.preamble.id ?? 'preamble'] = doc.preamble.title ?? 'Preamble'
  for (const a of doc.articles ?? []) {
    out[a.id] = a.title
    for (const s of a.sections ?? []) out[s.id] = s.title
  }
  return out
}

// --- target parsing --------------------------------------------------------

const TARGET_RE = /^art-(\d+)(?:-s-(\d+))?$/

function parseTarget (target) {
  if (target === 'preamble') return { preamble: true, articleId: 'preamble' }
  const m = TARGET_RE.exec(String(target ?? ''))
  if (!m) return { preamble: false, articleId: String(target ?? ''), unknown: true }
  return {
    preamble: false,
    article: Number(m[1]),
    clause: m[2] ? Number(m[2]) : null,
    articleId: `art-${m[1]}`
  }
}

/** [1,2,3,4,5] → "1,2,3,4 and 5" — exactly how Act 1 of 2024 lists clauses. */
function joinClauses (ns) {
  if (!ns.length) return ''
  if (ns.length === 1) return String(ns[0])
  return `${ns.slice(0, -1).join(',')} and ${ns[ns.length - 1]}`
}

function clausesOf (op, t) {
  if (t.clause != null) return [t.clause]
  if (op.scope === 'clause' && op.sections?.length) {
    return op.sections.map(s => Number(s.number)).filter(Number.isFinite)
  }
  return []
}

/**
 * The operative item line. The phrasings are the Acts' own:
 *   Act 1: "Amendment to Article 6, clause 1,2,3,4 and 5:", "Insertion of new
 *          Article 18 - Suspension/Termination:"
 *   Act 2: "Amendment of Preamble:", "Amendment of Article 15 - Exit Process"
 *          (a retitle stated on the item line)
 *   Act 3: "Amendment to Article 13:"
 */
function itemLabel (op, title) {
  const t = parseTarget(op.target)
  const clauses = clausesOf(op, t)
  const where = t.preamble
    ? 'Preamble'
    : `Article ${t.article ?? op.target}${clauses.length ? `, clause ${joinClauses(clauses)}` : ''}`

  switch (op.operation) {
    case 'insert':
      return `Insertion of new ${where}${title ? ` - ${title}` : ''}:`
    case 'omit':
      return `Omission of ${where}:`
    case 'reserve':
      return `Reservation of ${where}:`
    case 'retitle':
      return `Amendment to ${where}${op.title ? ` - ${op.title}` : ''}:`
    case 'substitute':
    default:
      // "Amendment OF Preamble" is how Act 2 phrases it; "Amendment TO Article N"
      // is how Acts 1 and 3 phrase an article.
      return t.preamble ? 'Amendment of Preamble:' : `Amendment to ${where}:`
  }
}

/** "13. Annual Report" — the restated provision's heading, or null if unknown. */
function provisionHeading (op, t, titles) {
  if (['omit', 'reserve', 'retitle'].includes(op.operation)) return null
  const title = op.title ?? titles[t.articleId] ?? null
  if (t.preamble) return title ?? 'Preamble'
  if (t.article == null) return title
  return title ? `${t.article}. ${title}` : null
}

// --- text blocks -----------------------------------------------------------

/**
 * An enumerator opens a new block: "(1)", "1.", "(a)", "(iv)". Everything else
 * is a continuation of the item above it, so a provision authored with hard
 * line breaks still sets as flowing paragraphs while its list structure holds.
 */
const ENUM_RE = /^\s*(?:\((?:\d+|[a-z]|[ivxl]+)\)|(?:\d+|[a-z]|[ivxl]+)[.)])\s+/i

/** Authored text → blocks, each with the relative indent the author gave it. */
export function blocks (text) {
  const out = []
  let cur = null
  for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) { cur = null; continue }
    const indent = Math.min((raw.match(/^ */)?.[0].length ?? 0), 12)
    if (cur && !ENUM_RE.test(raw)) {
      cur.text += ' ' + raw.trim()
    } else {
      cur = { indent, text: raw.trim() }
      out.push(cur)
    }
  }
  return out
}

function wrap (text, width) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ''
  for (const w of words) {
    if (!cur) cur = w
    else if (cur.length + 1 + w.length <= width) cur += ' ' + w
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

const pad = n => ' '.repeat(Math.max(0, n))
const centre = (s, width = PAGE_WIDTH) => pad(Math.floor((width - s.length) / 2)) + s
const right = (s, width = PAGE_WIDTH) => pad(width - s.length) + s

function textBlocks (text, indent, width = PAGE_WIDTH) {
  return blocks(text).flatMap(b =>
    wrap(b.text, Math.max(20, width - indent - b.indent)).map(l => pad(indent + b.indent) + l))
}

// --- the model both renderers read ----------------------------------------

const ENACTED = new Set(['enacted', 'applied'])

/**
 * Everything the instrument states, resolved once, so the text and the HTML
 * cannot drift apart. Works for a bill that has never been before anyone and
 * for an Act that was signed two years ago.
 */
export function billInstrument (bill, options = {}) {
  const meta = bill?.bill ?? {}
  const enactment = bill?.enactment ?? {}
  const { organization, committee, signatoryTitle, footer, actTitlePattern, enactingFormula } =
    houseStyle(options)
  const titles = options.titles instanceof Map
    ? Object.fromEntries(options.titles)
    : (options.titles ?? {})

  // The Act number is assigned at enactment and the assent date at signature.
  // They are read separately: a rendering states what the record states, and
  // never infers one from the other.
  const actNumber = enactment.act_number ?? null
  const actYear = enactment.act_year ?? meta.year ?? null
  const assentDate = enactment.assent_date ?? null
  const enacted = !!assentDate && (actNumber != null || ENACTED.has(bill?.status))

  // --- masthead ------------------------------------------------------------
  const header = actNumber != null
    ? `Act No. : ${actNumber} of ${actYear}`
    : meta.number != null
      ? `Bill No. : ${meta.number} of ${meta.year}`
      : 'DRAFT BILL — unnumbered'

  const assenter = withThe(enactment.assented_by ?? committee)

  const assent = enacted
    ? [`The following Act received the assent from ${assenter} on ${formatLongDate(assentDate)}.`]
    : proposedLines(bill?.status)

  // --- titles --------------------------------------------------------------
  // An unenacted bill has no Act number, so it cannot carry the ordinal: it is
  // titled by its own short title until enactment supplies one.
  const ordinal = actNumber == null ? null : ordinalWord(actNumber)
  const patterned = String(actTitlePattern)
    .replaceAll('{ordinal}', ordinal ?? '')
    .replaceAll('{year}', String(actYear ?? ''))
  // The pattern is house style for an amending Act. A corrigendum and a
  // revision are named off it rather than off a second pattern, so a fork
  // configures one line and still gets all three right.
  const title = !ordinal
    ? (meta.short_title ?? 'A Bill')
    : meta.type === 'revision'
      ? patterned.replace(/\bAmendment\b/, 'Revision')
      : meta.type === 'corrigendum'
        ? patterned.replace(/\bAmendment\b/, 'Amendment (Corrigendum)')
        : patterned

  const of = organization ? ` of ${organization}` : ''
  const longTitle = meta.type === 'revision'
    ? `Further to revise the Constitution${of}`
    : `Further to amend the Constitution${of}`

  const yearWord = typeof options.orgYear === 'number'
    ? ordinalWord(options.orgYear)
    : /^\d+$/.test(String(options.orgYear ?? '')) ? ordinalWord(Number(options.orgYear))
      : (options.orgYear ?? null)
  const enacting = enactingLine({ enactingFormula, yearWord, organization })

  // --- operative items -----------------------------------------------------
  const items = []
  if (meta.also_known_as) {
    items.push({ label: `This Act also called the “${meta.also_known_as}”`, heading: null, body: [] })
  }
  for (const op of bill?.operations ?? []) {
    const t = parseTarget(op.target)
    const heading = provisionHeading(op, t, titles)
    items.push({
      id: op.id,
      label: itemLabel(op, op.title ?? (op.operation === 'insert' ? null : titles[t.articleId] ?? null)),
      heading,
      body: bodyOf(op, t, titles)
    })
  }

  return {
    header,
    committee: committee.toUpperCase(),
    assent,
    enacted,
    status: bill?.status ?? null,
    title,
    longTitle,
    enacting,
    items,
    objectsAndReasons: (bill?.objects_and_reasons ?? '').trim() || null,
    // The mover is printed on the face of the instrument. The 2024 Acts named
    // nobody, so their proposer had to be reconstructed afterwards and never
    // was (Q8); recording moved_by in the bill only fixes that if the signed
    // paper carries it too.
    movedBy: meta.moved_by ?? null,
    signature: signatureOf(enactment.signed_by, signatoryTitle),
    renderedFrom: options.renderedFrom ?? enactment.rendered_from ?? null,
    footer
  }
}

/** "the Example Society Incorporated", but never "the The Guild". */
const withThe = name => {
  const s = String(name ?? '').trim()
  if (!s) return ''
  return /^the\s/i.test(s) ? s : `the ${s}`
}

/**
 * The BE IT ENACTED line. `enacting_formula` from `info.instrument` governs,
 * with {ordinal_year} and {organization} substituted.
 *
 * The formula is only used when everything it asks for is known: a formula that
 * names the regnal year, rendered for a bill whose caller supplied none, would
 * print "in the  Year of" — a hole in an instrument. The neutral wording is
 * used instead. Nothing is guessed; a year the caller did not state is a year
 * the instrument does not claim.
 */
function enactingLine ({ enactingFormula, yearWord, organization }) {
  if (enactingFormula && (yearWord || !enactingFormula.includes('{ordinal_year}'))) {
    return String(enactingFormula)
      .replaceAll('{ordinal_year}', yearWord ?? '')
      .replaceAll('{organization}', organization ?? '')
  }
  const org = organization ? ` of ${withThe(organization)}` : ''
  return yearWord
    ? `BE IT ENACTED by the boards in the ${yearWord} Year${org ? org : ''} as follows:`
    : `BE IT ENACTED by the boards${org} as follows:`
}

/**
 * The name over the office, as the 2024 Acts print it:
 *
 *     P. Priya,
 *     <signatory_title from info.instrument>
 *
 * A record that carries the office with the name ("P. Priya, Internal Compliance
 * Coordinator") is split, and the configured office wins when it is the fuller
 * form of the same office — so the office is stated once, and a signatory
 * holding some other office is not silently retitled.
 *
 * An unsigned bill gets a standing line in place of a name: a bill that is not
 * signed must not read as though it were.
 */
function signatureOf (signedBy, signatoryTitle) {
  const raw = String(signedBy ?? '').trim().replace(/[,\s]+$/, '')
  if (!raw) return { name: null, placeholder: '(to be signed on enactment)', title: signatoryTitle }
  const comma = raw.indexOf(',')
  if (comma === -1) return { name: raw, placeholder: null, title: signatoryTitle }
  const name = raw.slice(0, comma).trim()
  const office = raw.slice(comma + 1).trim()
  const configured = String(signatoryTitle ?? '')
  const title = office && !configured.toLowerCase().startsWith(office.toLowerCase())
    ? office
    : configured
  return { name, placeholder: null, title }
}

/** The line that stands where the assent line stands on an enacted Act. */
function proposedLines (status) {
  switch (status) {
    case 'rejected':
      return ['REJECTED — not enacted. This Bill was not approved and has no force.']
    case 'withdrawn':
      return ['WITHDRAWN by the mover — not enacted. This Bill has no force.']
    case 'lapsed':
      return ['LAPSED — not enacted. This Bill has no force.']
    default:
      return [
        'PROPOSED — not yet enacted. This Bill has received no assent and has no force.',
        'It requires the approval of the board, the intermediate board and the units of the NGO ' +
        'under Article 16(3).'
      ]
  }
}

/**
 * The restated provision, as blocks of authored text. A clause-scoped operation
 * whose text does not already carry its own marker gets one, the way Act 1
 * prints "(4) Any person who donates…" under the heading "7. Membership".
 */
function bodyOf (op, t, titles) {
  if (['omit', 'reserve', 'retitle'].includes(op.operation)) return []
  const out = []
  const clauses = clausesOf(op, t)
  const single = t.clause != null ? t.clause : null

  if (op.text?.trim()) {
    let text = op.text
    if (single != null) {
      const clauseTitle = op.title ?? titles[op.target] ?? null
      if (clauseTitle) out.push({ heading: `(${single}) ${clauseTitle}` })
      else if (!ENUM_RE.test(text)) text = `(${single}) ${text.replace(/^\s+/, '')}`
    }
    out.push({ text })
  } else if (single != null && !op.sections?.length && clauses.length) {
    out.push({ heading: `(${single})` })
  }

  for (const s of op.sections ?? []) {
    // A clause the Act removes is STATED, in words, because that sentence is
    // what the bodies vote on. It is not enough that the clause quietly stops
    // appearing: a meeting must be able to read exactly what dies.
    if (s.status === 'omitted') {
      out.push({ heading: `(${s.number}) ${s.title ?? ''}`.trim() })
      out.push({ text: `Clause (${s.number}) is omitted.${s.note ? ` ${String(s.note).trim()}` : ''}` })
      continue
    }
    out.push({ heading: `(${s.number}) ${s.title}` })
    out.push({ text: s.text })
  }
  return out
}

// --- plain text ------------------------------------------------------------

/**
 * The instrument as plain text, laid out like the extracted 2024 Acts: the Act
 * number right-aligned at the top, the committee and title centred, operative
 * items numbered from 1, the Statement of Objects and Reasons last, then the
 * separator, the signature and the address footer.
 */
export function renderBillText (bill, options = {}) {
  const m = billInstrument(bill, options)
  const width = options.width ?? PAGE_WIDTH
  const out = []

  out.push(right(m.header, width), '')
  out.push(centre(m.committee, width), '')
  for (const line of m.assent) out.push(...wrap(line, width))
  out.push('', '')
  out.push(centre(m.title, width), '')
  out.push(...wrap(m.longTitle, width - 8).map(l => centre(l, width)), '')
  out.push(...wrap(m.enacting, width - 6).map(l => pad(3) + l), '')

  m.items.forEach((item, i) => {
    out.push(`${pad(2)}${String(i + 1).padStart(2)}. ${item.label}`)
    if (item.heading || item.body.length) out.push('')
    if (item.heading) out.push(pad(8) + item.heading)
    for (const part of item.body) {
      if (part.heading) out.push(pad(8) + part.heading)
      if (part.text) out.push(...textBlocks(part.text, 8, width))
    }
    out.push('')
  })

  if (m.objectsAndReasons) {
    out.push('', centre('STATEMENT OF OBJECTS AND REASONS', width), '')
    out.push(...textBlocks(m.objectsAndReasons, 3, width))
    out.push('')
  }

  if (m.movedBy?.name) {
    out.push('')
    out.push(pad(3) + `Moved by ${m.movedBy.name}${m.movedBy.role ? `, ${m.movedBy.role}` : ''}`)
  }
  out.push('', centre(SEPARATOR, width), '', '')
  out.push(right(m.signature.name ? `${m.signature.name},` : m.signature.placeholder, width - 2))
  if (m.signature.title) out.push(right(m.signature.title, width - 2))
  out.push('', '')
  if (m.renderedFrom) {
    out.push(...wrap(
      `Rendered from ${m.renderedFrom}. That bill file is the source of truth; this document is a ` +
      'rendering of it.', width - 6).map(l => pad(3) + l))
    out.push('')
  }
  for (const line of m.footer) out.push(centre(line, width))

  return out.join('\n').replace(/[ \t]+$/gm, '') + '\n'
}

// --- HTML ------------------------------------------------------------------

/**
 * Print CSS, inline: the page must be self-contained, so a browser opening the
 * file offline and printing to PDF produces the signable instrument. The
 * address footer is fixed to the bottom of every printed sheet, which is where
 * the 2024 Acts carry it.
 */
const STYLE = `
  :root { color-scheme: light; }
  @page { size: A4; margin: 22mm 20mm 30mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #f2f0ec; color: #14110d;
    font-family: Georgia, "Times New Roman", Times, serif;
    font-size: 12pt; line-height: 1.55; text-rendering: optimizeLegibility;
  }
  .sheet {
    max-width: 190mm; margin: 24px auto 96px; padding: 26mm 22mm 22mm;
    background: #fff; box-shadow: 0 2px 24px rgba(0,0,0,.14);
  }
  .no { text-align: right; margin: 0 0 1.6em; font-size: 11pt; }
  .committee {
    text-align: center; font-size: 13.5pt; font-weight: 700; letter-spacing: .06em;
    margin: 0 0 1.4em; text-transform: uppercase;
  }
  .assent { margin: 0 0 3em; }
  .assent--proposed { font-weight: 700; }
  .title { text-align: center; font-size: 16pt; font-weight: 700; margin: 0 0 1em; }
  .long-title { text-align: center; margin: 0 0 1.8em; }
  .enacting { margin: 0 0 1.8em; text-indent: 2em; }
  ol.items { margin: 0; padding-left: 2.4em; }
  ol.items > li { margin: 0 0 1.6em; }
  ol.items > li::marker { font-weight: 700; }
  .item__label { margin: 0; font-weight: 700; break-after: avoid; page-break-after: avoid; }
  .provision { margin: .8em 0 0 1.2em; }
  .provision__heading { margin: 0 0 .35em; font-weight: 700; break-after: avoid; page-break-after: avoid; }
  .provision p { margin: 0 0 .5em; }
  .sor { margin: 2.4em 0 0; }
  .sor__heading {
    text-align: center; font-size: 12.5pt; font-weight: 700; letter-spacing: .04em;
    margin: 0 0 1em; text-transform: uppercase;
  }
  .sor p { margin: 0 0 .5em; }
  .rule { text-align: center; margin: 2.4em 0; letter-spacing: .1em; }
  .sign { margin: 3em 0 0; text-align: right; break-inside: avoid; page-break-inside: avoid; }
  .sign p { margin: 0; }
  .sign__name { margin-bottom: .3em !important; }
  .sign__placeholder { color: #5a544b; font-style: italic; }
  .provenance { margin: 3em 0 0; font-size: 9.5pt; color: #5a544b; }
  .foot {
    margin: 3em 0 0; padding-top: 1em; border-top: 1px solid #d8d2c8;
    text-align: center; font-size: 9.5pt; color: #3c362e;
  }
  .foot p { margin: 0; }
  @media print {
    body { background: #fff; font-size: 11pt; orphans: 2; widows: 2; }
    .sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
    /* The printed 2024 Acts repeat the address on every sheet. A position:fixed
       footer is the only way a browser can do that, and it is not safe: Chrome
       paints it over the text at the top of later pages, which silently drops
       operative text. The footer therefore prints once, at the end. Losing a
       line of an Act to reproduce a letterhead is not a trade worth making. */
    .foot { break-inside: avoid; page-break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
`

/** One authored block, keeping the relative indent the author gave a nested list. */
const para = b =>
  `<p${b.indent ? ` style="margin-left:${(b.indent * 0.6).toFixed(1)}em"` : ''}>${escapeHtml(b.text)}</p>`

/** Authored text → one `<p>` per block, as an array of single-line strings. */
const htmlBlocks = text => blocks(text).map(para)

/**
 * The instrument as a self-contained HTML document — no external stylesheet, no
 * font, no script, nothing to fetch. Open it and print to PDF and you have the
 * signable paper; the YAML it came from remains the source of truth.
 */
export function renderBillHtml (bill, options = {}) {
  const m = billInstrument(bill, options)

  const items = m.items.map(item => {
    const parts = []
    if (item.heading) parts.push(`<p class="provision__heading">${escapeHtml(item.heading)}</p>`)
    for (const part of item.body) {
      if (part.heading) parts.push(`<p class="provision__heading">${escapeHtml(part.heading)}</p>`)
      if (part.text) parts.push(...htmlBlocks(part.text))
    }
    return [
      `      <li${item.id ? ` id="${escapeHtml(item.id)}"` : ''}>`,
      `        <p class="item__label">${escapeHtml(item.label)}</p>`,
      ...(parts.length
        ? ['        <div class="provision">', ...parts.map(p => `          ${p}`), '        </div>']
        : []),
      '      </li>'
    ].join('\n')
  }).join('\n')

  const assent = m.assent.map(l =>
    `<p class="assent${m.enacted ? '' : ' assent--proposed'}">${escapeHtml(l)}</p>`).join('\n    ')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(m.title)}</title>
    <meta name="robots" content="noindex">
    <style>${STYLE}</style>
  </head>
  <body>
    <article class="sheet">
    <p class="no">${escapeHtml(m.header)}</p>
    <p class="committee">${escapeHtml(m.committee)}</p>
    ${assent}
    <h1 class="title">${escapeHtml(m.title)}</h1>
    <p class="long-title">${escapeHtml(m.longTitle)}</p>
    <p class="enacting">${escapeHtml(m.enacting)}</p>

    <ol class="items">
${items}
    </ol>
${m.objectsAndReasons
    ? `
    <section class="sor">
      <h2 class="sor__heading">Statement of Objects and Reasons</h2>
      ${htmlBlocks(m.objectsAndReasons).join('\n      ')}
    </section>`
    : ''}

    ${m.movedBy?.name
      ? `<p class="moved">Moved by ${escapeHtml(m.movedBy.name)}${m.movedBy.role ? `, ${escapeHtml(m.movedBy.role)}` : ''}</p>`
      : ''}
    <p class="rule">${SEPARATOR}</p>

    <div class="sign">
      ${m.signature.name
        ? `<p class="sign__name">${escapeHtml(m.signature.name)},</p>`
        : `<p class="sign__name sign__placeholder">${escapeHtml(m.signature.placeholder)}</p>`}
      ${m.signature.title ? `<p>${escapeHtml(m.signature.title)}</p>` : ''}
    </div>
${m.renderedFrom
    ? `
    <p class="provenance">Rendered from ${escapeHtml(m.renderedFrom)}. That bill file is the source of
    truth; this document is a rendering of it.</p>`
    : ''}

    <footer class="foot">
      ${m.footer.map(l => `<p>${escapeHtml(l)}</p>`).join('\n      ')}
    </footer>
    </article>
  </body>
</html>
`
}
