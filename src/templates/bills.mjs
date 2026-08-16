/**
 * The bills register — /bills/.
 *
 * The amendment register looks backwards, at instruments already signed. This
 * page looks forwards, at the ones that are not. It exists because of how the
 * three Acts of 2024 reached the constitution: authored as prose PDFs and
 * applied to the YAML by hand, which produced a half-applied document, an
 * application nobody recorded, a line splice that made re-running an Act
 * unsafe, an amend-or-insert ambiguity in Article 15, and fourteen
 * reconciliation questions.
 *
 * The inversion this page publishes: THE BILL YAML IS THE SOURCE OF TRUTH AND
 * THE SIGNED PDF IS A RENDERING OF IT. Because each operation carries the
 * complete resulting text of its target, the diff shown here is the same
 * comparison the applier makes — so what an approval meeting reads is what
 * will land in the constitution, and application is mechanical by construction
 * rather than by care.
 *
 * Nothing here is org-specific: it renders whatever bills/ holds, and links to
 * repository files through the repository recorded in package.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { escapeHtml as defaultEscapeHtml, slugMap } from '../lib/paths.mjs'
import { tally, buildBillManifest, loadConstitution, REQUIRED_BODIES, THRESHOLD } from '../bill.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Statuses at which a bill is before someone, so its diff is public. */
const PUBLIC_DIFF = new Set([
  'submitted', 'under-review', 'returned', 'scheduled', 'approved',
  'rejected', 'enacted', 'applied', 'withdrawn', 'lapsed'
])

/** Statuses whose record is a vote, so the tallies are shown whatever they say. */
const VOTED = new Set(['approved', 'rejected', 'enacted', 'applied'])

/**
 * What each status means, in one line. The pill carries the word; this carries
 * the meaning — a reader should never have to know the enum to read the page,
 * and status must never be encoded in colour alone.
 */
const STATUS_GLOSS = {
  draft: 'with its mover; not yet before anyone, and it carries no number',
  submitted: 'lodged with the ICC, which numbered it',
  'under-review': 'with the ICC for drafting review',
  returned: 'sent back to the mover for revision; it can be resubmitted',
  scheduled: 'listed for the approval meetings of all three bodies',
  approved: 'carried by the board, the intermediate board and the units',
  rejected: 'not carried — and it stays on this register',
  enacted: 'assented to and signed as an Act',
  applied: 'written into the constitution, which took the resulting version',
  withdrawn: 'withdrawn by its mover before approval',
  lapsed: 'lapsed by decision of the board, recorded by hand'
}

const TYPE_GLOSS = {
  amendment: 'the ordinary instrument; bumps the minor version',
  corrigendum: 'corrects a drafting error already on record, and nothing else',
  revision: 'a full re-adoption; the only type that may renumber, and the only major bump'
}

const BODY_LABEL = {
  board: 'Board',
  'intermediate-board': 'Intermediate board',
  units: 'Units'
}

const pct = r => `${(r * 100).toFixed(1)}%`

/**
 * The threshold in words. A fraction printed as a percentage is a different
 * rule: two thirds of 63 votes is 42, but "66.7% of 63" is 43. Prose says the
 * fraction; only actual tallies get a percentage.
 */
const thresholdWords = Math.abs(THRESHOLD - 2 / 3) < 1e-9 ? 'two thirds' : pct(THRESHOLD)

/** Small numbers are words in prose; the count still comes from the constant. */
const numberWord = n => ['no', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n)

// ---------------------------------------------------------------------------

/**
 * Where a repository file lives on the web, read from this repository's own
 * package.json rather than hardcoded. A fork's bills page must point at the
 * fork's `process/PROPOSING.md`, not at ours; `HEAD` avoids naming a branch.
 */
let _sourceBase
function repositorySourceBase () {
  if (_sourceBase !== undefined) return _sourceBase
  _sourceBase = null
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
    if (raw) {
      const web = String(raw)
        .replace(/^git\+/, '')
        .replace(/^git@([^:]+):/, 'https://$1/')
        .replace(/^ssh:\/\/git@/, 'https://')
        .replace(/\.git$/, '')
        .replace(/\/+$/, '')
      if (/^https?:\/\//.test(web)) _sourceBase = `${web}/blob/HEAD/`
    }
  } catch { /* no package.json, or an unreadable one: fall back to plain text */ }
  return _sourceBase
}

/**
 * The document the diffs are taken against, when the caller does not pass one.
 *
 * It reads the same file the build renders — `CONSTITUTION_FILE`, with the same
 * default — because a bills page showing a "before" from some other document
 * would be a lie of exactly the kind this pipeline exists to stop. It is never
 * a hardcoded path: a build pointed at another constitution diffs against that
 * one, and a build pointed at none simply shows no before-text.
 */
let _fallbackDoc
function fallbackConstitution () {
  if (_fallbackDoc !== undefined) return _fallbackDoc
  try {
    _fallbackDoc = loadConstitution(process.env.CONSTITUTION_FILE ?? 'constitution/current.yaml')
  } catch {
    _fallbackDoc = null
  }
  return _fallbackDoc
}

/** A repository file, linked where we know the repository and set in code where we do not. */
function sourceFile (rel, { esc, sourceBase }) {
  const base = sourceBase === undefined ? repositorySourceBase() : sourceBase
  const code = `<code>${esc(rel)}</code>`
  return base ? `<a href="${esc(base + rel)}">${code}</a>` : code
}

/** Path as the repository sees it, so a card names the file it was built from. */
const repoRelative = file => {
  const s = String(file ?? '').replace(/\\/g, '/')
  const i = s.indexOf('bills/')
  return i >= 0 ? s.slice(i) : s.split('/').pop() ?? s
}

// ---------------------------------------------------------------------------

const yearOf = item => {
  const y = item?.bill?.bill?.year
  if (Number.isInteger(y)) return y
  const m = /(?:^|\/)(\d{4})\//.exec(String(item?.file ?? '').replace(/\\/g, '/'))
  return m ? Number(m[1]) : null
}

/** A stable in-page anchor. Numbered bills get their number; drafts get their filename. */
export function billAnchor (item) {
  const b = item?.bill?.bill ?? {}
  const year = yearOf(item)
  if (b.number != null && year != null) return `bill-${year}-${b.number}`
  const stem = (repoRelative(item?.file).split('/').pop() ?? 'bill')
    .replace(/\.ya?ml$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `bill-draft-${stem || 'untitled'}`
}

const billLabel = item => {
  const b = item?.bill?.bill ?? {}
  const year = yearOf(item)
  return b.number != null && year != null ? `Bill ${b.number} of ${year}` : 'unnumbered draft'
}

/**
 * Newest year first; within a year by the number the ICC assigned, with
 * unnumbered drafts last — they are not yet before anyone, so they cannot take
 * a place in the running order.
 */
function groupByYear (bills = []) {
  const groups = new Map()
  for (const item of bills) {
    const year = yearOf(item)
    const key = year ?? 'undated'
    if (!groups.has(key)) groups.set(key, { year, items: [] })
    groups.get(key).items.push(item)
  }
  const out = [...groups.values()].sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity))
  for (const g of out) {
    g.items.sort((a, b) => {
      const na = a?.bill?.bill?.number ?? Infinity
      const nb = b?.bill?.bill?.number ?? Infinity
      if (na !== nb) return na - nb
      const ta = String(a?.bill?.bill?.short_title ?? '')
      const tb = String(b?.bill?.bill?.short_title ?? '')
      return ta.localeCompare(tb) || String(a.file).localeCompare(String(b.file))
    })
  }
  return out
}

const groupId = g => `bills-${g.year ?? 'undated'}`
const groupLabel = g => (g.year == null ? 'Undated bills' : `Bills of ${g.year}`)

/** Contents entries for the page shell. Standing sections are there in every state. */
export function billsTocItems (bills = []) {
  const items = groupByYear(bills).map(g => ({
    id: groupId(g),
    label: groupLabel(g),
    sub: g.items.map(item => ({
      id: billAnchor(item),
      label: item?.bill?.bill?.short_title ?? billLabel(item)
    }))
  }))
  if (!items.length) items.push({ id: 'no-bills', label: 'No bills before the board' })
  items.push({ id: 'approval-threshold', label: 'Approval under Article 16(3)' })
  items.push({ id: 'lifecycle', label: 'How a bill becomes an Act' })
  return items
}

// ---------------------------------------------------------------------------

/**
 * The diff an approval meeting reads. Built from the constitution the caller
 * passes, never from one this module goes and finds: rendering a bill against a
 * document it was not drafted against would show a "before" that is not the
 * before, which is the precise class of error this pipeline exists to prevent.
 */
function manifestOf (item, doc) {
  if (Array.isArray(item?.manifest)) return item.manifest
  if (doc) {
    try { return buildBillManifest(item.bill, doc) } catch { /* fall through */ }
  }
  // Degraded but honest: the operations still carry their own resulting text,
  // so the "after" is knowable without the constitution. The "before" is not.
  return (item?.bill?.operations ?? []).map(op => ({
    id: op.id,
    operation: op.operation,
    target: op.target,
    scope: op.scope,
    exists: null,
    title_before: null,
    title_after: op.title ?? null,
    before: undefined,
    after: ['omit', 'reserve'].includes(op.operation)
      ? null
      : [op.text ?? '', ...(op.sections ?? []).flatMap(s => [s.title ?? '', s.text ?? ''])].join('\n').trim(),
    unchanged: false
  }))
}

function targetLabel (target) {
  if (target === 'preamble') return 'Preamble'
  const m = /^art-(\d+)(?:-s-(\d+))?$/.exec(String(target ?? ''))
  if (!m) return String(target ?? '—')
  return m[2] ? `Article ${m[1]}, clause ${m[2]}` : `Article ${m[1]}`
}

/**
 * Anchors are the citation handle, so a target links to where the provision
 * actually is. A provision a bill would create has nowhere to link yet, and a
 * link to an anchor that is not there is worse than none.
 */
function targetHref (target, { url, slugs }) {
  const m = /^art-(\d+)(?:-s-(\d+))?$/.exec(String(target ?? ''))
  const articleId = m ? `art-${m[1]}` : null
  if (articleId && slugs?.get?.(articleId)) {
    const base = url(`articles/${slugs.get(articleId)}/`)
    return m[2] ? `${base}#${target}` : base
  }
  return `${url('')}#${target}`
}

/** Provision text, escaped, with clause breaks kept. Never markdown: this is a quotation. */
function quoteText (s, esc) {
  const body = String(s ?? '').trim()
  if (!body) return '<p><em>(no text)</em></p>'
  return body.split(/\n{2,}/)
    .map(para => `<p>${para.split('\n').map(l => esc(l.trim())).filter(Boolean).join('<br>')}</p>`)
    .join('')
}

// ---------------------------------------------------------------------------

function operationsList (item, manifest, { url, esc, slugs }) {
  const ops = item?.bill?.operations ?? []
  const rows = manifest.map((m, i) => {
    const op = ops.find(o => o.id === m.id) ?? ops[i] ?? {}
    const label = targetLabel(m.target)
    const heading = m.title_after ?? m.title_before
    const named = m.exists === false || m.operation === 'insert'
      ? `${esc(label)} <span class="bill-new">new provision</span>`
      : `<a href="${targetHref(m.target, { url, slugs })}">${esc(label)}</a>`
    const retitled = m.title_before && m.title_after && m.title_before !== m.title_after
      ? ` · heading <code>${esc(m.title_before)}</code> → <code>${esc(m.title_after)}</code>`
      : (m.operation === 'retitle' && m.title_after ? ` · heading <code>${esc(m.title_after)}</code>` : '')
    return `<li>${named} — ${esc(m.operation)} (${esc(m.scope ?? op.scope ?? 'article')} scope)` +
      `${heading && !retitled ? ` · <code>${esc(heading)}</code>` : retitled}` +
      `${m.unchanged ? ' · <strong>would change nothing</strong>' : ''}</li>`
  }).join('')
  return rows
    ? `<ul class="act__provisions">${rows}</ul>`
    : '<p class="act__none">This bill records no operations.</p>'
}

function operationDiffs (item, manifest, { esc }) {
  const ops = item?.bill?.operations ?? []
  return manifest.map((m, i) => {
    const op = ops.find(o => o.id === m.id) ?? ops[i] ?? {}
    const before = m.before === undefined
      ? '<p class="disc__note">The text in force is not available in this build. Run <code>npx opencodelaw bill validate</code> against the bill file for the full comparison.</p>'
      : (m.before == null
          ? '<p><em>This provision does not exist in the constitution as it stands.</em></p>'
          : `<blockquote class="bill-text">${quoteText(m.before, esc)}</blockquote>`)
    // A retitle carries no text, and rendering its empty `after` as a
    // quotation would read as "this provision is emptied" — which is the
    // opposite of what a retitle does.
    const after = m.operation === 'retitle'
      ? '<p><em>The text of the provision is not touched. Only its heading changes.</em></p>'
      : (m.after == null
          ? `<p><em>The provision is ${m.operation === 'reserve' ? 'reserved — its number is held and its text removed' : 'removed'}.</em></p>`
          : `<blockquote class="bill-text">${quoteText(m.after, esc)}</blockquote>`)

    return `
      <details class="disc bill-op">
        <summary>${esc(m.id)} — ${esc(m.operation)} ${esc(targetLabel(m.target))}${m.unchanged ? ' (no change)' : ''}</summary>
        ${m.title_before !== m.title_after
          ? `<p class="disc__note">Heading: <code>${esc(m.title_before ?? '(none)')}</code> → <code>${esc(m.title_after ?? '(none)')}</code></p>`
          : ''}
        <p class="disc__label">Before — the text in force</p>
        ${before}
        <p class="disc__label">After — the whole provision, as this bill would leave it</p>
        ${after}
        ${m.unchanged ? '<p class="disc__note">This operation would leave the provision exactly as it reads today.</p>' : ''}
        ${op.note ? `<p class="disc__label">Drafting note — explanatory, never operative</p><p class="disc__note">${esc(op.note)}</p>` : ''}
      </details>`
  }).join('')
}

/**
 * The Article 16(3) record.
 *
 * Both readings of "collectively" are printed, every time, because the board
 * has not adopted one: a pooled vote of all three sitting together, or two
 * thirds within each body. Until it resolves by resolution the stricter
 * per-body reading governs, and recording both is what keeps an Act from being
 * challenged under whichever reading is eventually adopted.
 */
function approvalsBlock (item, { esc }) {
  const bill = item?.bill ?? {}
  const t = item?.tally ?? tally(bill.approvals ?? [])
  const anyRecorded = t.perBody.some(b => b.recorded && b.voting != null)
  if (!VOTED.has(bill.status) && !anyRecorded) return ''

  const cell = b => {
    if (!b.recorded) return '<td colspan="6">No approval recorded</td>'
    const n = v => (v == null ? '—' : String(v))
    return `<td>${esc(b.date ?? '—')}</td><td>${n(b.present)}</td><td>${n(b.for)}</td>` +
      `<td>${n(b.against)}</td><td>${n(b.abstain)}</td>` +
      `<td>${b.voting == null ? '—' : `${b.for}/${b.voting} = ${pct(b.ratio)}`}</td>`
  }
  const verdict = b => {
    if (!b.recorded || b.voting == null) return '<span class="bill-tally__verdict">no tally</span>'
    return b.passes
      ? '<span class="bill-tally__verdict bill-tally__verdict--pass">meets 2/3</span>'
      : '<span class="bill-tally__verdict bill-tally__verdict--fail">below 2/3</span>'
  }

  // The minutes reference sits under the body's name rather than in a column
  // of its own: it is prose in a table of numbers, and a column that has to
  // wrap pushes the tally off the side of the page.
  const rows = t.perBody.map(b => `
        <tr>
          <th scope="row">${esc(BODY_LABEL[b.body] ?? b.body)}
            <span class="bill-tally__evidence">${b.recorded
              ? (b.evidence ? esc(b.evidence) : '<em>no minutes reference</em>')
              : '<em>no meeting recorded</em>'}</span></th>
          ${cell(b)}
          <td>${verdict(b)}</td>
        </tr>`).join('')

  // Sums are shown only where every body reported the column; a total built by
  // treating an unreported number as zero is a fabricated total.
  const sum = key => {
    const vals = t.perBody.map(b => (b.recorded ? b[key] : null))
    return vals.every(v => v != null) ? String(vals.reduce((n, v) => n + v, 0)) : '—'
  }
  const pooled = t.pooled.ratio == null
    ? ''
    : `<tr class="bill-tally__pooled">
          <th scope="row">All three pooled</th>
          <td>—</td><td>${sum('present')}</td><td>${t.pooled.for}</td>
          <td>${t.pooled.voting - t.pooled.for}</td><td>${sum('abstain')}</td>
          <td>${t.pooled.for}/${t.pooled.voting} = ${pct(t.pooled.ratio)}</td>
          <td>${t.pooled.passes
            ? '<span class="bill-tally__verdict bill-tally__verdict--pass">meets 2/3</span>'
            : '<span class="bill-tally__verdict bill-tally__verdict--fail">below 2/3</span>'}</td>
        </tr>`

  const notes = []
  if (t.missingBodies.length) {
    notes.push(`No approval is recorded for ${t.missingBodies.map(b => esc(BODY_LABEL[b] ?? b)).join(' and ')}. ` +
      'Article 16(3) names all three bodies and none of them may be inferred from another.')
  }
  if (t.missingEvidence.length) {
    notes.push(`${t.missingEvidence.map(b => esc(BODY_LABEL[b] ?? b)).join(' and ')} recorded an approval with ` +
      'no minutes reference. An approval without evidence is an assertion.')
  }
  if (t.complete && !t.passes && t.pooled.passes) {
    notes.push('The pooled vote reaches two thirds; ' +
      `${t.failedBodies.map(b => esc(BODY_LABEL[b] ?? b)).join(' and ')} did not. Under the stricter reading, ` +
      'which governs until the board resolves what "collectively" means, that is not an approval.')
  }

  return `
      <h4 class="act__sub">Approvals — Article 16(3)</h4>
      <div class="bill-scroll" role="region" aria-label="Approval tallies" tabindex="0">
        <table class="bill-tally">
          <caption class="visually-hidden">Approval tallies by body, with the minutes reference and the
          pooled vote</caption>
          <thead>
            <tr>
              <th scope="col">Body and minutes</th><th scope="col">Date</th><th scope="col">Present</th>
              <th scope="col">For</th><th scope="col">Against</th><th scope="col">Abstain</th>
              <th scope="col">Of those voting</th><th scope="col">Two thirds?</th>
            </tr>
          </thead>
          <tbody>${rows}${pooled}</tbody>
        </table>
      </div>
      <p class="bill-note">Both readings are recorded: ${thresholdWords} within each body, and
      ${thresholdWords} of all three pooled. Until the board adopts a reading of "collectively"
      <strong>by resolution</strong>, the stricter per-body reading governs — so a bill carries only where
      every body reached ${thresholdWords} of its own members present and voting. Abstentions are excluded
      from the denominator, because Article 16(3) says present <em>and voting</em>.</p>
      ${notes.map(n => `<p class="bill-note">${n}</p>`).join('')}`
}

function historyBlock (item, { esc }) {
  const h = item?.bill?.history ?? []
  if (!h.length) return ''
  return `
      <details class="disc">
        <summary>Status history (${h.length})</summary>
        <ol class="act__provisions">
          ${h.map(e => `<li><strong>${esc(e.date ?? '—')}</strong> — ${esc(e.from ? `${e.from} → ${e.to}` : e.to)}, ` +
            `by ${esc(e.actor ?? '—')}${e.evidence ? ` · ${esc(e.evidence)}` : ''}` +
            `${e.note ? `<span class="banner__note">${esc(e.note)}</span>` : ''}</li>`).join('')}
        </ol>
      </details>`
}

function enactmentRows (item, { url, esc, actIndex }) {
  const e = item?.bill?.enactment ?? {}
  const rows = []
  if (e.act_number != null && e.act_year != null) {
    const id = `act-${e.act_number}-${e.act_year}`
    const act = actIndex?.[id]
    rows.push(`<dt>Enacted as</dt><dd><a href="${url('amendments/')}#${esc(id)}">${
      esc(act?.title ?? `Act ${e.act_number} of ${e.act_year}`)}</a>${
      act ? '' : ' — not yet listed on the amendment register'}</dd>`)
  }
  if (e.assent_date) rows.push(`<dt>Assent</dt><dd>${esc(e.assent_date)}${e.assented_by ? ` · ${esc(e.assented_by)}` : ''}</dd>`)
  if (e.signed_by) rows.push(`<dt>Signed by</dt><dd>${esc(e.signed_by)}</dd>`)
  if (e.signed_pdf) {
    rows.push(`<dt>Instrument</dt><dd><a href="${url(e.signed_pdf)}">Signed Act (PDF)</a>${
      e.signed_pdf_sha256
        ? ` · <code title="sha256 ${esc(e.signed_pdf_sha256)}">sha256 ${esc(e.signed_pdf_sha256.slice(0, 12))}…</code>`
        : ''}</dd>`)
  }
  return rows.join('')
}

function billCard (item, doc, { url, esc, actIndex, slugs, sourceBase }) {
  const bill = item?.bill ?? {}
  const meta = bill.bill ?? {}
  const status = bill.status ?? 'draft'
  const manifest = manifestOf(item, doc)
  const anchor = billAnchor(item)
  const rel = repoRelative(item?.file)

  const mover = [meta.moved_by?.name, meta.moved_by?.role].filter(Boolean).map(esc).join(' · ')

  return `
    <article class="act bill" id="${esc(anchor)}" aria-labelledby="h-${esc(anchor)}">
      <h3 class="act__title" id="h-${esc(anchor)}">
        <span class="act__num">${esc(billLabel(item))}</span>
        ${esc(meta.short_title ?? '(untitled bill)')}
        <span class="act__status bill-status bill-status--${esc(status)}">${esc(status.replace(/-/g, ' '))}</span>
      </h3>
      ${meta.also_known_as ? `<p class="act__short">Also called the ${esc(meta.also_known_as)}</p>` : ''}
      <dl class="act__meta">
        <dt>Status</dt><dd>${esc(status.replace(/-/g, ' '))}${STATUS_GLOSS[status] ? ` — ${esc(STATUS_GLOSS[status])}` : ''}</dd>
        <dt>Type</dt><dd>${esc(meta.type ?? '—')}${TYPE_GLOSS[meta.type] ? ` — ${esc(TYPE_GLOSS[meta.type])}` : ''}</dd>
        <dt>Moved by</dt><dd>${mover || '—'}</dd>
        ${meta.drafted ? `<dt>Drafted</dt><dd>${esc(meta.drafted)}</dd>` : ''}
        <dt>Drafted against</dt><dd>constitution ${esc(meta.base_version ?? '—')}${
          doc?.info?.version && meta.base_version && doc.info.version !== meta.base_version
            ? ` — the constitution is now at ${esc(doc.info.version)}, so this bill must be rebased before it can be voted on`
            : ''}</dd>
        <dt>On enactment</dt><dd>${esc(meta.version_bump ?? 'minor')} version bump</dd>
        ${enactmentRows(item, { url, esc, actIndex })}
        <dt>Source</dt><dd>${sourceFile(rel, { esc, sourceBase })}</dd>
      </dl>
      <h4 class="act__sub">Provisions this bill would change</h4>
      ${operationsList(item, manifest, { url, esc, slugs })}
      ${PUBLIC_DIFF.has(status)
        ? `<h4 class="act__sub">What it would change, in full</h4>
      ${operationDiffs(item, manifest, { esc })}`
        : `<p class="act__none">The before-and-after text is published once a bill is submitted. Until then
        the mover can read it at any time with <code>npx opencodelaw bill validate ${esc(rel)}</code>.</p>`}
      ${approvalsBlock(item, { esc })}
      ${bill.objects_and_reasons
        ? `<details class="disc">
        <summary>Statement of Objects and Reasons</summary>
        <p class="disc__label">Explanatory only — never operative, and never the authority for anything</p>
        ${quoteText(bill.objects_and_reasons, esc)}
      </details>`
        : ''}
      ${historyBlock(item, { esc })}
    </article>`
}

// ---------------------------------------------------------------------------

function emptyState ({ url, esc, actIndex, sourceBase, proposeEnabled }) {
  const acts = Object.keys(actIndex ?? {}).length
  return `
    <section class="bill-empty" aria-labelledby="no-bills">
      <h2 class="act__sub" id="no-bills">No bills before the board</h2>
      <p>Nothing has been introduced. That is the ordinary state of this register between
      amendments, not a page that failed to load${acts
        ? ` — every instrument already enacted is on the <a href="${url('amendments/')}">amendment register</a>`
        : ''}.</p>
      <p>Any member may propose one, and what they write is the instrument itself:</p>
      ${proposeEnabled
        ? `<ol class="act__provisions">
        <li><a href="${url('propose/')}">Open the constitution and change what you want changed</a>. Every
        provision is editable in place; the page works out precisely which ones you touched and what each
        would say afterwards.</li>
        <li>Read your own before-and-after. It is what the approval meetings will read — not your
        explanation of it.</li>
        <li>Download your proposal and email it to the ICC, which numbers it at submission and coordinates
        the approvals of all three bodies under Article 16(3).</li>
      </ol>
      <p class="bill-note">Writing the file by hand is fully supported and produces exactly the same
      thing: ${sourceFile('process/AUTHORING-BY-HAND.md', { esc, sourceBase })} and
      ${sourceFile('bills/TEMPLATE.yaml', { esc, sourceBase })}. Clerking one:
      <a href="${url('icc/')}">the ICC desk</a>.</p>`
        : `<ol class="act__provisions">
        <li>Read ${sourceFile('process/PROPOSING.md', { esc, sourceBase })} — what a bill has to say, and to whom.</li>
        <li>Copy ${sourceFile('bills/TEMPLATE.yaml', { esc, sourceBase })} into <code>bills/&lt;year&gt;/</code>
        and describe the change. Each operation carries the <strong>complete resulting text</strong> of the
        provision it touches — not a diff, and never "insert after the words".</li>
        <li>Run <code>npx opencodelaw bill validate bills/&lt;year&gt;/your-bill.yaml</code> as often as you
        like. It checks the drafting and prints the before-and-after the approval meetings will read.</li>
        <li>Send it to the ICC, which numbers it at submission and coordinates the approvals of all three
        bodies under Article 16(3).</li>
      </ol>`}
    </section>`
}

function standingSections ({ esc, url, slugs, sourceBase }) {
  const art16 = targetHref('art-16', { url, slugs })
  return `
    <h2 class="act__sub" id="approval-threshold">Approval under Article 16(3)</h2>
    <blockquote class="bill-text"><p><a href="${art16}">Article 16(3)</a>: All proposed amendments must be
    approved by a 2/3rd present and voting of the board, the intermediate board and units of the NGO
    collectively.</p></blockquote>
    <p><strong>All three bodies are required.</strong> This is fixed constitutional policy, not a default
    setting: a checklist, tool or shortcut that enacts on fewer than three approvals is invalid on its
    face, whatever convenience recommends it. The ICC coordinates and records the approvals of all three —
    the Acts of 2024 recorded only the ICC's own assent, which is the gap this pipeline closes for good.</p>
    <p><strong>"Collectively" is genuinely ambiguous.</strong> It can mean a pooled vote of all three
    bodies sitting together, or two thirds within each body separately. The board has not adopted a
    reading. Until it does <strong>by resolution</strong>, enactment requires the stricter one — at least
    ${thresholdWords} of those present and voting in each of the ${numberWord(REQUIRED_BODIES.length)} bodies, taken
    separately — and every bill records both tallies, so the record satisfies whichever reading is
    eventually adopted. Abstentions are excluded from the denominator, because the Article says present
    <em>and voting</em>. The choice between the readings is pending.</p>
    <p><strong>Meeting mechanics are not decided here.</strong> Notice, quorum and how a vote is taken
    belong to the by-laws under Article 16(2). This register records who was present and how they voted;
    it does not invent a quorum rule the constitution does not state.</p>

    <h2 class="act__sub" id="lifecycle">How a bill becomes an Act</h2>
    <p>The bill file is the source of truth and the signed PDF is a rendering of it. The three Acts of
    2024 went the other way — prose first, applied to the machine-readable text by hand afterwards — and
    that is what produced a half-applied constitution, an application nobody recorded, and an Act that
    could not safely be re-run. An amendment drafted here is machine-applicable from the moment it exists,
    so applying it is a comparison rather than a transcription.</p>
    <ol class="act__provisions">
      <li><strong>draft</strong> — with its mover, unnumbered. It is not yet before anyone.</li>
      <li><strong>submitted</strong> — lodged with the ICC, which assigns the number: Bill 1 of 2026, per
      year.</li>
      <li><strong>under review</strong> — the ICC reads the drafting. It may be <strong>returned</strong>
      for revision and resubmitted, as often as that takes.</li>
      <li><strong>scheduled</strong> — listed for the approval meetings of the board, the intermediate
      board and the units.</li>
      <li><strong>approved</strong> or <strong>rejected</strong> — on the tallies recorded above, under
      Article 16(3).</li>
      <li><strong>enacted</strong> — assented to and signed. The Act takes its own number at enactment:
      Act 1 of 2026, per year.</li>
      <li><strong>applied</strong> — written into the constitution, which takes the new version. Because
      each operation carries the complete resulting text, applying the same Act twice changes nothing the
      second time.</li>
    </ol>
    <p>A mover may <strong>withdraw</strong> a bill at any time before approval. The board may record one
    as <strong>lapsed</strong>; that is set by hand, because the constitution states no time limit and this
    pipeline does not invent one.</p>
    <p>Every applied Act bumps the <strong>minor</strong> version. Major is reserved for a full revision,
    which is also the only instrument that may renumber a provision — article numbers are permanent
    citation handles. There are no patch releases of provision text: an editorial edit without an
    instrument is exactly what this system exists to prevent.</p>
    <p>The rules in full: ${sourceFile('process/AMENDMENT-PROCESS.md', { esc, sourceBase })}. For authors:
    ${sourceFile('process/PROPOSING.md', { esc, sourceBase })}, and
    ${sourceFile('process/AUTHORING-BY-HAND.md', { esc, sourceBase })} with
    ${sourceFile('bills/TEMPLATE.yaml', { esc, sourceBase })} for anyone writing the file directly.</p>`
}

/**
 * The /bills/ page body.
 *
 * `bills` is `{ file, bill }` as loaded from bills/<year>/*.yaml; an item may
 * also carry a precomputed `manifest` and `tally`. `constitution` is the
 * document the diffs are taken against — pass the one the build already loaded,
 * so a page can never show a "before" from a different document.
 */
export function billsMain (bills = [], {
  url, escapeHtml: esc = defaultEscapeHtml, actIndex = {}, constitution = null,
  slugs = null, sourceBase, proposeEnabled = false
} = {}) {
  const groups = groupByYear(bills)
  const counted = bills.length
  // Only look for a constitution if there is a bill to diff against it.
  const doc = constitution ?? (counted ? fallbackConstitution() : null)
  // Article pages are the better link target where the caller knows the slugs;
  // where it does not, they are derivable from the same document.
  const slugIndex = slugs ?? (doc?.articles ? slugMap(doc.articles) : null)

  const body = groups.map(g => `
    <section class="bill-year" aria-labelledby="${esc(groupId(g))}">
      <h2 class="act__sub" id="${esc(groupId(g))}">${esc(groupLabel(g))}</h2>
      ${g.items.map(item => billCard(item, doc, { url, esc, actIndex, slugs: slugIndex, sourceBase })).join('')}
    </section>`).join('')

  return `
    <h1 class="page-title">Bills</h1>
    <p class="page-lead">Proposed amendments to this constitution, from the moment they are drafted. The
    bill file is the instrument: the before-and-after a bill publishes here is the same comparison made
    when it is applied, so what the approving bodies read is exactly what lands in the text.</p>
    <p>Every bill needs the approval of the board, the intermediate board and the units under
    <a href="${targetHref('art-16', { url, slugs: slugIndex })}">Article 16(3)</a>. <strong>Bills that were rejected, withdrawn or lapsed
    stay on this page.</strong> A legislature's failed bills are part of its record — what was proposed and
    refused says as much as what was carried, and a register that quietly drops them is a register that
    only ever agrees with itself.</p>
    ${counted
      ? `<p class="bill-note">${counted} bill${counted === 1 ? '' : 's'} on record.
      Signed Acts are on the <a href="${url('amendments/')}">amendment register</a>.</p>${body}`
      : emptyState({ url, esc, actIndex, sourceBase, proposeEnabled })}
    ${standingSections({ esc, url, slugs: slugIndex, sourceBase })}`
}

/**
 * Styling for the classes this page adds, ready to drop into the layout's
 * `head`. Optional: everything above reuses `act`, `disc` and `banner`, and the
 * page reads correctly without a line of this — a bill register that depends on
 * a stylesheet to be legible is not a record. It is here so the page does not
 * have to wait on a stylesheet to look finished, and can move into
 * src/styles/layout.css unchanged whenever styling catches up.
 */
// The /bills/ rules now live in src/styles/layout.css with every other
// component. They were exported here as a <style> string that no page
// imported, so the page shipped unstyled.
export default billsMain
