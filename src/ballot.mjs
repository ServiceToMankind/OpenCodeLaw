/**
 * The resolution sheet a meeting signs.
 *
 * Pre-filled with the bill number, short title, substantive hash, the
 * resolution sentence and a summary of the operations — so the coordinator
 * never composes a legal record from scratch and the hash cannot be mistyped.
 *
 * Rendered only for a bill at `scheduled` or later. Circulation is the freeze
 * point: a ballot for a bill still under form review would carry a hash that
 * the ICC is about to change.
 *
 * The hash is PASSED IN, never computed here, so that this file has no Node
 * dependency and the /icc/ page downloads the same sheets `bill ballot` writes
 * rather than a lookalike. It is required rather than defaulted: a sheet that
 * silently printed `undefined` where the hash belongs is a sheet a meeting
 * would sign.
 */
import { resolutionSentenceFor, REQUIRED_BODIES } from './scripts/bill-core.mjs'
import { houseStyle } from './bill-render.mjs'

const BALLOTABLE = new Set(['scheduled', 'approved', 'enacted', 'applied'])

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const BODY_LABEL = {
  board: 'the Board',
  'intermediate-board': 'the Intermediate Board',
  units: 'the Units'
}

export function ballotGuard (bill) {
  if (BALLOTABLE.has(bill.status)) return null
  return `This bill is "${bill.status}". A resolution sheet is rendered only once a bill is ` +
    'scheduled, because circulation is the freeze point: the hash printed on the sheet is the ' +
    'text the bodies vote on, and a bill still under form review is one the ICC may yet change. ' +
    'Complete form review, set the bill to scheduled, then render.'
}

export function ballotSheet (bill, body, options = {}) {
  const m = houseStyle(options)
  const b = bill.bill
  const hash = options.hash
  if (!/^[a-f0-9]{64}$/.test(String(hash ?? ''))) {
    throw new Error('ballotSheet needs the bill\'s substantive hash passed as options.hash — ' +
      'the sheet exists to carry that hash into the minutes, so rendering one without it would ' +
      'produce a resolution sheet that resolves on nothing.')
  }
  const name = b.number ? `Bill ${b.number} of ${b.year}` : `the draft bill "${b.short_title}"`

  const ops = bill.operations.map((op, i) => {
    const what = op.operation === 'insert' ? `insert ${op.target}`
      : op.operation === 'omit' ? `omit ${op.target}`
        : op.operation === 'reserve' ? `reserve ${op.target}`
          : op.operation === 'retitle' ? `retitle ${op.target}`
            : `substitute ${op.target}`
    // Clauses this operation removes are named here, in words. A body voting on
    // a restatement must be told which clauses it is voting to end, not left to
    // notice their absence from a list.
    const dying = (op.sections ?? []).filter(s => s.status === 'omitted')
      .map(s => `clause (${s.number})`)
    return `<li>${i + 1}. ${esc(what)}${op.title ? ` — ${esc(op.title)}` : ''} <span class="sub">(${esc(op.scope)} scope)</span>` +
      (dying.length
        ? `<br><strong>and omits ${esc(dying.join(', '))}</strong>, which keep${dying.length > 1 ? '' : 's'} its number and every citation to it`
        : '') +
      '</li>'
  }).join('')

  return `<section class="sheet" aria-label="Resolution sheet for ${esc(BODY_LABEL[body] ?? body)}">
  <header class="sheet-head">
    <p class="org">${esc(m.organization)}</p>
    ${m.committee ? `<p class="cttee">${esc(m.committee)}</p>` : ''}
    <h2>Record of Resolution — ${esc(BODY_LABEL[body] ?? body)}</h2>
  </header>

  <p class="resolution"><strong>${esc(resolutionSentenceFor(bill, hash))}</strong></p>
  <p class="hash-note">The presiding officer reads the sentence above, including the hash, into the
  minutes. A vote binds to that hash and not to the bill's title: if the bill is edited afterwards,
  this resolution is void and this body must resolve again.</p>

  <dl class="meta">
    <dt>Bill</dt><dd>${esc(name)}</dd>
    <dt>Short title</dt><dd>${esc(b.short_title)}</dd>
    <dt>Type</dt><dd>${esc(b.type)}</dd>
    <dt>Moved by</dt><dd>${esc(b.moved_by?.name ?? '')}${b.moved_by?.role ? `, ${esc(b.moved_by.role)}` : ''}</dd>
    <dt>Drafted against</dt><dd>constitution version ${esc(b.base_version)}</dd>
    <dt>Substantive hash</dt><dd class="mono">${esc(hash)}</dd>
  </dl>

  <h3>What this bill does</h3>
  <ol class="ops">${ops}</ol>
  <p class="sub">The full before-and-after text is in the bill's validation report, which accompanies
  this sheet.</p>

  <h3>Resolution of ${esc(BODY_LABEL[body] ?? body)}</h3>
  <table class="tally">
    <tbody>
      <tr><th scope="row">Date</th><td class="fill"></td></tr>
      <tr><th scope="row">Mode</th><td class="fill">in-person / online / hybrid</td></tr>
      <tr><th scope="row">Place or platform</th><td class="fill"></td></tr>
      <tr><th scope="row">Members present</th><td class="fill"></td></tr>
      <tr><th scope="row">Voting FOR</th><td class="fill"></td></tr>
      <tr><th scope="row">Voting AGAINST</th><td class="fill"></td></tr>
      <tr><th scope="row">Abstaining</th><td class="fill"></td></tr>
    </tbody>
  </table>
  <p class="sub">Article 16(3) requires two thirds of those <strong>present and voting</strong>.
  Abstentions are outside the denominator. Record tallies and attendance counts only — individual
  members' votes are not published.</p>

  <div class="signatures">
    <div><div class="rule"></div><p>Presiding officer (signature and name)</p></div>
    <div><div class="rule"></div><p>Attested — Internal Compliance Coordinator</p></div>
  </div>
</section>`
}

export function ballotDocument (bill, options = {}) {
  const m = houseStyle(options)
  const sheets = REQUIRED_BODIES.map(b => ballotSheet(bill, b, options)).join('\n')
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Resolution sheets — ${esc(bill.bill.short_title)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #000; background: #fff;
         font-size: 11pt; line-height: 1.5; max-width: 46em; margin: 0 auto; padding: 2em 1em; }
  .sheet { break-after: page; padding-bottom: 2em; }
  .sheet:last-child { break-after: auto; }
  .sheet-head { text-align: center; margin-bottom: 1.5em; }
  .org { font-weight: bold; letter-spacing: .04em; margin: 0; }
  .cttee { text-transform: uppercase; letter-spacing: .08em; font-size: .9em; margin: .2em 0 0; }
  h2 { font-size: 1.15em; margin: .8em 0 0; }
  h3 { font-size: 1em; margin: 1.4em 0 .4em; border-bottom: 1px solid #000; padding-bottom: .2em; }
  .resolution { border: 1.5px solid #000; padding: .8em; margin: 1em 0 .4em; }
  .hash-note, .sub { font-size: .82em; color: #333; }
  dl.meta { display: grid; grid-template-columns: 12em 1fr; gap: .25em 1em; margin: 1em 0; }
  dl.meta dt { font-weight: bold; }
  dl.meta dd { margin: 0; }
  .mono { font-family: 'DejaVu Sans Mono', Consolas, monospace; font-size: .78em; word-break: break-all; }
  ol.ops { margin: .4em 0 .4em 1.2em; padding: 0; }
  ol.ops li { list-style: none; margin: .2em 0; }
  table.tally { width: 100%; border-collapse: collapse; margin: .6em 0; }
  table.tally th { text-align: left; width: 14em; padding: .45em .5em; border: 1px solid #000; font-weight: normal; }
  table.tally td.fill { border: 1px solid #000; padding: .45em .5em; height: 1.9em; color: #666; font-size: .85em; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 2em; margin-top: 3em; }
  .signatures .rule { border-bottom: 1px solid #000; height: 2.6em; }
  .signatures p { font-size: .82em; margin: .3em 0 0; }
</style></head>
<body>
<p class="sub">Rendered from the bill file, which is the source of truth. This sheet is a rendering
of it. ${esc(m.organization)}</p>
${sheets}
</body></html>
`
}
