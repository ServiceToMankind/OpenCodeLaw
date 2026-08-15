/**
 * The clerking desk behind /icc/.
 *
 * It reads the proposer's file, checks it the way the CLI checks it, and helps
 * the coordinator write down what happened: the bill's number, the dates it
 * moved on, what each of the three bodies resolved, and which signed document
 * proves it. Then it hands back one file.
 *
 * It does not submit. It does not enact. It does not apply. Everything it
 * produces is re-verified downstream by `act enact` and the CI gate — evidence
 * files present on disk and matching their checksums, thresholds recomputed
 * from the tallies, the bill's hash checked against every approval that cites
 * it — so this page is convenience and none of it is authority.
 *
 * The Article 16(3) verdict is computed HERE, live, as tallies are typed. Not
 * because the page decides anything, but because a coordinator who finds out at
 * enactment that a body fell short has already sent the file on.
 */

import { billToYaml, canonicalJson, substantiveSubject } from './bill-serialise.mjs'
import { REQUIRED_BODIES, tally, buildBillManifest, resolutionSentenceFor, provisionIndex } from './bill-core.mjs'
import { renderBillText, titlesFromConstitution } from '../bill-render.mjs'
import { ballotDocument, ballotGuard } from '../ballot.mjs'

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel))
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const STORAGE_KEY = 'opencodelaw.icc.desk.v1'
const SITE = new URL('../../', import.meta.url)
const BODY_LABEL = {
  board: 'The board',
  'intermediate-board': 'The intermediate board',
  units: 'The units'
}

let DOC = null
let REGISTER = { bills: [] }
let VALIDATE = null
let BILL = null         // the uploaded bill, as parsed
let HASH = null         // its substantive hash, computed once from the parsed file
const CLERK = { number: null, submitted: '', scheduled: '', actor: '' }
const MEETINGS = new Map()   // body -> { date, mode, place, presiding, present, for, against, abstain }
const EVIDENCE = new Map()   // body -> { kind, path, sha256, filename }

if ($('#bill-file')) start().catch(err => {
  const box = $('#upload-report')
  if (box) {
    box.className = 'banner banner--superseded'
    box.innerHTML = `<p>The desk could not start: ${esc(err.message)}. Everything here is also
      available from the command line — see <code>opencodelaw bill --help</code>.</p>`
  }
})

async function start () {
  const [doc, register, validator] = await Promise.all([
    fetch(new URL('constitution.json', SITE)).then(r => r.json()),
    fetch(new URL('bills.json', SITE)).then(r => r.ok ? r.json() : { bills: [] }).catch(() => ({ bills: [] })),
    import(new URL('../bill-validator.mjs', import.meta.url).href)
      .then(m => m.default ?? m).catch(() => null)
  ])
  DOC = doc
  REGISTER = register
  VALIDATE = typeof validator === 'function' ? validator : null

  $('#bill-file').addEventListener('change', onUpload)
  $('#clear-draft')?.addEventListener('click', clearDraft)
  $('#copy-resolution')?.addEventListener('click', copyResolution)
  $('#download-ballots')?.addEventListener('click', downloadBallots)
  $('#icc-download')?.addEventListener('click', downloadRecord)
  for (const [sel, key] of [['#bill-number', 'number'], ['#submitted-date', 'submitted'],
    ['#scheduled-date', 'scheduled'], ['#actor', 'actor']]) {
    $(sel)?.addEventListener('input', () => {
      CLERK[key] = key === 'number' ? Number($(sel).value) || null : $(sel).value
      refresh()
    })
  }
  offerRestore()
}

// ---------------------------------------------------------------------------
// 1. Open the proposal
// ---------------------------------------------------------------------------

async function onUpload (e) {
  const file = e.target.files?.[0]
  if (!file) return
  const box = $('#upload-report')
  box.className = 'banner'
  box.innerHTML = '<p>Reading the file…</p>'
  try {
    const { load, CORE_SCHEMA } = await import(new URL('../vendor/js-yaml.mjs', import.meta.url).href)
    await accept(load(await file.text(), { schema: CORE_SCHEMA }), box)
  } catch (err) {
    box.className = 'banner banner--superseded'
    box.innerHTML = `<h3 class="banner__title">That file could not be read</h3><p>${esc(err.message)}</p>`
  }
  e.target.value = ''
}

async function accept (bill, box) {
  const problems = checkOnArrival(bill)
  const fatal = problems.filter(p => p.fatal)

  if (fatal.length) {
    box.className = 'banner banner--superseded'
    box.innerHTML = `<h3 class="banner__title">This file cannot be clerked as it stands</h3>
      <ul class="banner__list">${fatal.map(p => `<li>${p.html ?? esc(p.message)}</li>`).join('')}</ul>`
    stages(false)
    return
  }

  BILL = bill
  HASH = await substantiveHash(bill)
  seedClerk(bill)
  buildBodyCards()
  stages(true)

  const warnings = problems.filter(p => !p.fatal)
  box.className = 'banner'
  box.innerHTML = `<h3 class="banner__title">Opened</h3>
    <p><strong>${esc(bill.bill.short_title)}</strong>, moved by
    ${esc(bill.bill.moved_by?.name ?? '—')}${bill.bill.moved_by?.membership_id
      ? `, membership ${esc(bill.bill.moved_by.membership_id)}` : ''}.
    ${bill.operations.length} operation${bill.operations.length === 1 ? '' : 's'}, drafted against
    constitution ${esc(bill.bill.base_version)}, which is the version in force.</p>
    ${bill.bill.moved_by?.membership_id
      ? '<p class="banner__note">Check that membership number against the register. Nothing in this system can.</p>'
      : '<p class="banner__note">No membership number was given. Confirm the mover is a member before proceeding.</p>'}
    ${warnings.length
      ? `<h4 class="banner__title">Worth a second look</h4><ul class="banner__list">${
        warnings.map(p => `<li>${esc(p.message)}</li>`).join('')}</ul>`
      : ''}`

  renderReview()
  refresh()
}

/**
 * The checks that happen the moment a file arrives: its shape, the provisions
 * it names, and whether the constitution has moved since it was written.
 *
 * A stale file is refused rather than repaired. The proposer re-opens it in
 * /propose/, which rebases by construction — so the fix happens where the
 * person who wrote the words is looking at them.
 */
function checkOnArrival (bill) {
  const out = []
  if (VALIDATE && !VALIDATE(bill)) {
    for (const e of VALIDATE.errors ?? []) {
      out.push({ fatal: true, message: `${e.instancePath || 'the file'} ${e.message}` })
    }
    return out
  }
  if (!bill.operations?.length) {
    out.push({ fatal: true, message: 'The bill contains no operations — it proposes nothing.' })
  }
  if (bill.bill.base_version !== DOC.version) {
    out.push({
      fatal: true,
      html: `This was drafted against constitution version <strong>${esc(String(bill.bill.base_version))}</strong>,
        and the constitution is now at <strong>${esc(DOC.version)}</strong>. Send it back: the proposer
        re-opens it on the <a href="../propose/">propose page</a>, which re-makes every change
        against the current text and tells them which ones no longer fit. Nobody should vote on a
        change written against words that have moved.`
    })
  }
  const index = provisionIndex(DOC)
  for (const op of bill.operations ?? []) {
    const exists = index.has(op.target)
    if (op.operation === 'insert' && exists) {
      out.push({ fatal: true, message: `${op.id}: cannot insert ${op.target} — it already exists.` })
    } else if (op.operation !== 'insert' && !exists) {
      out.push({ fatal: true, message: `${op.id}: ${op.target} does not exist in the constitution.` })
    }
  }
  if (bill.bill.number != null && bill.status === 'draft') {
    out.push({ message: `The file already carries the number ${bill.bill.number} while still a draft. Numbering is yours to assign.` })
  }
  if ((bill.approvals ?? []).some(a => a.for != null || a.against != null)) {
    out.push({ message: 'The file already carries tallies. Check them against the minutes rather than assuming them.' })
  }
  return out
}

const stages = on => { for (const s of $$('[data-stage]')) s.hidden = !on }

function seedClerk (bill) {
  const year = bill.bill.year
  const taken = (REGISTER.bills ?? []).filter(b => b.year === year && typeof b.number === 'number')
    .map(b => b.number)
  CLERK.number = bill.bill.number ?? (taken.length ? Math.max(...taken) : 0) + 1
  CLERK.submitted ||= today()
  CLERK.actor ||= 'Internal Compliance Coordinator'
  $('#bill-number').value = String(CLERK.number)
  $('#submitted-date').value = CLERK.submitted
  $('#actor').value = CLERK.actor
}

const today = () => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// 2. Read what it does
// ---------------------------------------------------------------------------

function renderReview () {
  const manifest = buildBillManifest(BILL, DOC)
  $('#manifest').innerHTML = manifest.map((m, i) => `
    <article class="change">
      <h3 class="change__title">${i + 1}. ${esc(verbFor(m))}</h3>
      ${m.title_before !== m.title_after
        ? `<p class="change__heading">Heading: <del>${esc(m.title_before ?? '—')}</del> → <ins>${esc(m.title_after ?? '—')}</ins></p>`
        : ''}
      ${m.unchanged ? '<p class="change__note">This operation would change nothing.</p>' : ''}
      ${m.before != null
        ? `<p class="change__label">It says now</p><pre class="bill-text">${esc(m.before)}</pre>`
        : '<p class="change__label">This provision does not exist yet.</p>'}
      ${m.after == null
        ? '<p class="change__label">It would be removed. Its number stays, and is never reused.</p>'
        : `<p class="change__label">It would say</p><pre class="bill-text">${esc(m.after)}</pre>`}
    </article>`).join('')

  $('#objects').textContent = BILL.objects_and_reasons || '(none given)'
  $('#instrument').textContent = instrumentOf(withClerking())
}

const label = target => target === 'preamble'
  ? 'the preamble'
  : (() => {
      const m = /^art-(\d+)(?:-s-(\d+))?$/.exec(target)
      return m ? (m[2] ? `Article ${m[1]}, clause (${m[2]})` : `Article ${m[1]}`) : target
    })()

const verbFor = m => m.operation === 'insert'
  ? `Insert a new ${label(m.target)}${m.title_after ? ` — ${m.title_after}` : ''}`
  : m.operation === 'omit' ? `Omit ${label(m.target)}`
    : m.operation === 'reserve' ? `Reserve ${label(m.target)}, keeping its number`
      : m.operation === 'retitle' ? `Retitle ${label(m.target)}`
        : `Substitute ${label(m.target)}`

function instrumentOf (bill) {
  try {
    return renderBillText(bill, { info: DOC.info, titles: titlesFromConstitution(DOC) })
  } catch (err) {
    return `The instrument could not be rendered (${err.message}).`
  }
}

// ---------------------------------------------------------------------------
// 3 & 4. Numbering, and what the three bodies resolved
// ---------------------------------------------------------------------------

function buildBodyCards () {
  const tpl = $('#body-template').content
  const evTpl = $('#evidence-template').content
  const bodies = $('#bodies')
  const evidence = $('#evidence-list')
  bodies.innerHTML = ''
  evidence.innerHTML = ''

  for (const body of REQUIRED_BODIES) {
    MEETINGS.set(body, MEETINGS.get(body) ?? {
      date: '', mode: '', place: '', presiding: '', present: '', for: '', against: '', abstain: ''
    })

    const card = tpl.firstElementChild.cloneNode(true)
    card.dataset.body = body
    $('.body-card__name', card).textContent = BODY_LABEL[body]
    for (const input of $$('[data-role]', card)) {
      const role = input.dataset.role
      if (role === 'verdict') continue
      input.value = MEETINGS.get(body)[role] ?? ''
      input.addEventListener('input', () => {
        MEETINGS.get(body)[role] = input.value
        refresh()
      })
    }
    bodies.appendChild(card)

    const ev = evTpl.firstElementChild.cloneNode(true)
    ev.dataset.body = body
    $('.body-card__name', ev).textContent = BODY_LABEL[body]
    $('[data-role="file"]', ev).addEventListener('change', e => onEvidence(body, e, ev))
    $('[data-role="kind"]', ev).addEventListener('change', e => {
      const rec = EVIDENCE.get(body)
      if (rec) { rec.kind = e.target.value; refresh() }
    })
    $('[data-role="path"]', ev).addEventListener('input', e => {
      const rec = EVIDENCE.get(body)
      if (rec) { rec.path = e.target.value.trim(); refresh() }
    })
    evidence.appendChild(ev)
  }
}

const num = v => {
  const n = Number(String(v ?? '').trim())
  return String(v ?? '').trim() === '' || !Number.isFinite(n) ? null : n
}

/** Approvals as they currently stand, in the shape the schema and `tally` read. */
function approvals () {
  return REQUIRED_BODIES.map(body => {
    const m = MEETINGS.get(body) ?? {}
    const ev = EVIDENCE.get(body)
    const voted = num(m.for) != null || num(m.against) != null
    return {
      body,
      meeting: {
        date: m.date || null,
        ...(m.mode ? { mode: m.mode } : {}),
        ...(m.place ? { place: m.place } : {}),
        ...(m.presiding ? { presiding: m.presiding } : {})
      },
      present: num(m.present),
      for: num(m.for),
      against: num(m.against),
      abstain: num(m.abstain),
      // An approval binds to the text as voted. Recorded only once a vote is,
      // because a null tally has resolved on nothing.
      bill_sha256: voted ? HASH : null,
      ...(ev ? { evidence: { kind: ev.kind, path: ev.path, sha256: ev.sha256 } } : {}),
      ...(CLERK.actor ? { recorded_by: CLERK.actor } : {})
    }
  })
}

function renderVerdicts (t) {
  for (const card of $$('.body-card[data-body]', $('#bodies'))) {
    const b = t.perBody.find(x => x.body === card.dataset.body)
    const out = $('[data-role="verdict"]', card)
    if (!b || b.voting == null) {
      out.className = 'body-card__verdict'
      out.textContent = 'Enter the numbers voting for and against to see where this body stands.'
      continue
    }
    const pct = (b.ratio * 100).toFixed(1)
    out.className = `body-card__verdict body-card__verdict--${b.passes ? 'pass' : 'fail'}`
    out.textContent = `${b.for} of ${b.voting} present and voting — ${pct}% — ` +
      `${b.passes ? 'above two thirds. This body has approved.' : 'below two thirds. This body has NOT approved.'}` +
      (b.abstain ? ` ${b.abstain} abstained, and abstentions are outside the denominator.` : '')
  }

  const box = $('#verdict')
  if (!t.complete) {
    box.className = 'banner'
    box.innerHTML = `<p>Waiting on ${esc(t.missingBodies.map(b => BODY_LABEL[b]).join(', ') ||
      'a full tally from every body')}. Article 16(3) requires all three.</p>`
    return
  }
  box.className = `banner ${t.passes ? '' : 'banner--superseded'}`
  box.innerHTML = t.passes
    ? '<h3 class="banner__title">All three bodies have approved</h3><p>Each reached two thirds of ' +
      'those present and voting. Attach the minutes, then generate the record.</p>'
    : `<h3 class="banner__title">This bill has not been approved</h3>
       <p>${esc(t.failedBodies.map(b => BODY_LABEL[b]).join(' and '))} did not reach two thirds of
       those present and voting.${t.pooled.passes
         ? ' The pooled vote across all three bodies does pass — but until the board resolves by ' +
           'resolution what “collectively” means in Article 16(3), the stricter reading governs and ' +
           'each body must reach two thirds on its own.'
         : ''}</p>
       <p>Record it as it happened. A bill that failed is part of the record, and the register
       publishes it.</p>`
}

// ---------------------------------------------------------------------------
// 5. The minutes
// ---------------------------------------------------------------------------

async function onEvidence (body, e, card) {
  const file = e.target.files?.[0]
  const out = $('[data-role="out"]', card)
  const pathInput = $('[data-role="path"]', card)
  if (!file) { EVIDENCE.delete(body); out.textContent = ''; pathInput.value = ''; refresh(); return }

  // Computed here, in this browser, over the exact bytes. The file is never
  // uploaded — what travels is the fingerprint, and later the document itself,
  // by hand. `act enact` re-reads the file from disk and re-computes this: if
  // the two disagree, the archived record is not the document that was filed.
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  const sha256 = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
  const year = BILL.bill.year
  const ext = (file.name.match(/\.[a-z0-9]+$/i) ?? ['.pdf'])[0].toLowerCase()
  const suggested = `bills/${year}/evidence/bill-${CLERK.number ?? 'N'}-${year}-${body}-minutes${ext}`
  const filePath = pathInput.value.trim() || suggested
  pathInput.value = filePath

  EVIDENCE.set(body, { kind: $('[data-role="kind"]', card).value, path: filePath, sha256, filename: file.name })
  out.innerHTML = `<span class="evidence__file">${esc(file.name)}</span>
    <span class="evidence__hash">sha256 ${esc(sha256)}</span>
    <span class="evidence__path">Send the file to the technical department; the record names it as
    <code>${esc(filePath)}</code></span>`
  refresh()
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/**
 * The uploaded bill plus everything clerked so far.
 *
 * `enactment` is carried through untouched and never written: assent, the
 * signed instrument and its checksum belong to the technical department. That
 * boundary is also the icc entry in SURFACE_EXCLUSIONS, which the serialiser
 * tests hold this file to.
 */
function withClerking () {
  const t = tally(approvals())
  const status = !t.complete
    ? (CLERK.scheduled ? 'scheduled' : 'submitted')
    : (t.passes ? 'approved' : 'rejected')

  const history = [...(BILL.history ?? [])]
  const add = (from, to, date, note, evidence) => {
    if (!date) return
    history.push({ date, from, to, actor: CLERK.actor || 'Internal Compliance Coordinator', ...(evidence ? { evidence } : {}), note })
  }
  add('draft', 'submitted', CLERK.submitted,
    `Numbered Bill ${CLERK.number ?? '—'} of ${BILL.bill.year} on submission.`)
  add('submitted', 'scheduled', CLERK.scheduled,
    'Form review complete; circulated to the board, the intermediate board and the units.')
  if (t.complete) {
    const last = t.perBody.map(b => b.meeting?.date).filter(Boolean).sort().pop()
    add('scheduled', status, last || CLERK.scheduled,
      status === 'approved'
        ? 'Approved by all three bodies under Article 16(3).'
        : `Not approved: ${t.failedBodies.join(', ')} below two thirds of those present and voting.`)
  }

  return {
    ...BILL,
    bill: { ...BILL.bill, number: CLERK.number ?? null },
    status,
    history,
    approvals: approvals()
  }
}

function refresh () {
  if (!BILL) return
  const t = tally(approvals())
  renderVerdicts(t)

  const record = withClerking()
  $('#resolution').textContent = resolutionSentenceFor(record, HASH)
  $('#instrument').textContent = instrumentOf(record)

  const problems = []
  if (!CLERK.number) problems.push('Give the bill a number.')
  if (!CLERK.submitted) problems.push('Record the date the bill was received.')
  if (!CLERK.actor.trim()) problems.push('Record who is clerking this.')
  for (const b of t.perBody) {
    if (!b.recorded || b.voting == null) problems.push(`${BODY_LABEL[b.body]}: no tally recorded yet.`)
    else if (b.present != null && b.voting + (b.abstain ?? 0) > b.present) {
      problems.push(`${BODY_LABEL[b.body]}: more votes and abstentions than members present.`)
    }
    if (!b.meeting?.date) problems.push(`${BODY_LABEL[b.body]}: no meeting date.`)
    if (b.voting != null && !EVIDENCE.has(b.body)) {
      problems.push(`${BODY_LABEL[b.body]}: a tally with no signed record behind it is an assertion. Attach the minutes.`)
    }
  }
  if (VALIDATE && !VALIDATE(record)) {
    for (const e of VALIDATE.errors ?? []) problems.push(`${e.instancePath || 'the record'} ${e.message}`)
  }

  // One record legitimately proves a joint sitting. Differing dates or modes
  // behind one file is also exactly what a copy-paste looks like, so it is
  // surfaced without being forbidden.
  const shared = new Map()
  for (const [body, ev] of EVIDENCE) {
    if (!shared.has(ev.sha256)) shared.set(ev.sha256, [])
    shared.get(ev.sha256).push(body)
  }
  const notes = []
  for (const [, bodies] of shared) {
    if (bodies.length < 2) continue
    const dates = new Set(bodies.map(b => MEETINGS.get(b)?.date))
    const modes = new Set(bodies.map(b => MEETINGS.get(b)?.mode))
    if (dates.size > 1 || modes.size > 1) {
      notes.push(`${bodies.map(b => BODY_LABEL[b]).join(', ')} share one record, but their meetings ` +
        'differ. One compiled record covering separate meetings is legitimate — check that this is ' +
        'that, and not the same file attached twice by mistake.')
    }
  }

  const box = $('#icc-report')
  box.className = problems.length ? 'banner banner--superseded' : 'banner'
  box.innerHTML = problems.length
    ? `<h3 class="banner__title">Not ready to generate</h3><ul class="banner__list">${
      problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`
    : `<p><strong>Ready.</strong> This record says the bill is <em>${esc(record.status)}</em>.</p>` +
      (notes.length ? `<ul class="banner__list">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '')
  $('#icc-download').disabled = problems.length > 0
  save()
}

// ---------------------------------------------------------------------------

function downloadBallots () {
  const record = withClerking()
  // The freeze point, enforced the same way the CLI enforces it: a sheet for a
  // bill still under form review would carry a hash the ICC is about to change.
  const blocked = ballotGuard({ ...record, status: record.status === 'submitted' ? 'scheduled' : record.status })
  if (blocked) { toast(blocked); return }
  send(ballotDocument(record, { info: DOC.info, hash: HASH }),
    `bill-${CLERK.number ?? 'draft'}-${BILL.bill.year}-ballots.html`, 'text/html')
  toast('Three sheets downloaded. Print them and take them to the meetings.')
}

function downloadRecord () {
  const record = withClerking()
  send(billToYaml(record, { header: false }),
    `bill-${CLERK.number}-${BILL.bill.year}.yaml`, 'text/yaml')
  toast('Record downloaded. Send it with the minutes PDFs, in one message.')
}

async function copyResolution () {
  try { await navigator.clipboard.writeText($('#resolution').textContent) } catch { /* fall through */ }
  toast('Resolution sentence copied.')
}

async function substantiveHash (bill) {
  // Hash what will be parsed, never what is displayed — see bill-serialise.mjs.
  const bytes = new TextEncoder().encode(canonicalJson(substantiveSubject(bill)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// The copy saved in this browser — same honesty as the proposer's page.
// ---------------------------------------------------------------------------

function save () {
  try {
    const savedAt = new Date().toISOString()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      savedAt,
      bill: BILL,
      clerk: CLERK,
      meetings: Object.fromEntries(MEETINGS),
      evidence: Object.fromEntries(EVIDENCE)
    }))
    const n = $('#saved-at')
    if (n) n.textContent = `Last saved in this browser at ${new Date(savedAt).toLocaleString()}.`
  } catch { /* private mode, or full: the downloaded record is the record */ }
}

function offerRestore () {
  let saved
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') } catch { saved = null }
  if (!saved?.bill) return

  const box = $('#restore')
  box.hidden = false
  box.innerHTML = `
    <h2 class="banner__title">There is an unfinished record in this browser</h2>
    <p>${esc(saved.bill.bill?.short_title ?? 'A bill')}, saved
    ${esc(new Date(saved.savedAt).toLocaleString())}.</p>
    <p><button type="button" class="btn btn--primary" id="restore-yes">Carry on with it</button>
    <button type="button" class="btn" id="restore-no">Start again</button></p>`

  $('#restore-yes').addEventListener('click', async () => {
    box.hidden = true
    Object.assign(CLERK, saved.clerk ?? {})
    MEETINGS.clear(); EVIDENCE.clear()
    for (const [k, v] of Object.entries(saved.meetings ?? {})) MEETINGS.set(k, v)
    for (const [k, v] of Object.entries(saved.evidence ?? {})) EVIDENCE.set(k, v)
    await accept(saved.bill, $('#upload-report'))
    $('#scheduled-date').value = CLERK.scheduled ?? ''
    // Re-checking a restored file rather than trusting it: the constitution may
    // have moved since it was set down, which is exactly the case that must not
    // pass silently.
  })
  $('#restore-no').addEventListener('click', () => { box.hidden = true; clearDraft() })
}

function clearDraft () {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* nothing to clear */ }
  const n = $('#saved-at')
  if (n) n.textContent = ''
  toast('The copy saved in this browser has been cleared.')
}

function send (text, filename, type) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function toast (message) {
  const t = document.getElementById('toast')
  if (!t) return
  t.textContent = message
  t.classList.add('is-visible')
  setTimeout(() => t.classList.remove('is-visible'), 4000)
}
