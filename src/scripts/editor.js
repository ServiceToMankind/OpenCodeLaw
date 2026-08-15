/**
 * The document editor behind /propose/.
 *
 * The proposer edits a copy of the constitution. Everything legislative —
 * operations, targets, ids, scopes, numbering — is derived from the difference
 * between their copy and the original, by bill-derive.mjs, which the tests
 * drive directly in Node. This file is the surface: it renders the document,
 * collects keystrokes, and shows what has been derived.
 *
 * Three properties are structural rather than checked:
 *
 *  - Operations carry the complete resulting text, because the text IS what is
 *    in the box. No diff is ever taken.
 *  - Numbers are assigned, never typed. There is no input for one.
 *  - Renumbering and reordering cannot be expressed. There is no control, and
 *    no function in bill-derive.mjs that could emit one.
 *
 * The hash shown here is computed over the same canonical subject the CLI
 * hashes — see the invariant at the top of bill-serialise.mjs. It is the number
 * a meeting reads into its minutes, so the page and the file must never
 * disagree about it.
 */

import { billToYaml, canonicalJson, substantiveSubject } from './bill-serialise.mjs'
import {
  modelFromDoc, deriveOperations, buildDraft, reviewProblems, rebasePlan,
  applyOperationsToModel, addArticle, addClause, removeArticle, restoreArticle,
  removeClause, nextArticleNumber, reservedNumbers, isEmptied
} from './bill-derive.mjs'
import { renderBillText, titlesFromConstitution } from '../bill-render.mjs'

const $ = (sel, root = document) => root.querySelector(sel)
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const STORAGE_KEY = 'opencodelaw.propose.draft.v1'
const SITE = new URL('../../', import.meta.url)

let DOC = null          // the constitution as published
let MODEL = null        // the proposer's working copy
let VALIDATE = null
let ops = []

// Transient screen state, deliberately outside the model: what the proposer is
// being asked to confirm is not part of what they are proposing.
const CONFIRMING = new Set()
let CHOOSING_NUMBER = false

const el = $('#editor')
if (el) start().catch(err => fail(err))

function fail (err) {
  if (!el) return
  el.setAttribute('aria-busy', 'false')
  el.innerHTML = `<p class="no-text">The editor could not start: ${esc(err.message)}. You can still
    propose a change by writing to the ICC in an email.</p>`
}

async function start () {
  const [doc, validator] = await Promise.all([
    fetch(new URL('constitution.json', SITE)).then(r => {
      if (!r.ok) throw new Error(`the constitution could not be loaded (${r.status})`)
      return r.json()
    }),
    import(new URL('../bill-validator.mjs', import.meta.url).href)
      .then(m => m.default ?? m).catch(() => null)
  ])
  DOC = doc
  VALIDATE = typeof validator === 'function' ? validator : null
  MODEL = modelFromDoc(DOC)

  renderDocument()
  wire()
  offerRestore()
  refresh()
}

// ---------------------------------------------------------------------------
// Rendering the document
// ---------------------------------------------------------------------------

const articleLabel = a => `Article ${a.number}`
const clauseLabel = (a, s) => `Article ${a.number}, clause (${s.number})`

function renderDocument () {
  const focused = document.activeElement?.id ?? null
  const parts = [provisionCard(MODEL.preamble, { label: 'Preamble', kind: 'preamble' })]
  for (const a of MODEL.articles) parts.push(articleCard(a))
  parts.push(`
    <div class="editor__add">
      ${CHOOSING_NUMBER
        ? numberChoice()
        : '<button type="button" class="btn" data-act="add-article">Add a new article</button>'}
      <p class="field__help">${addArticleHelp()}</p>
    </div>`)
  el.innerHTML = parts.join('')
  el.setAttribute('aria-busy', 'false')
  if (focused) document.getElementById(focused)?.focus()
}

function addArticleHelp () {
  const next = nextArticleNumber(MODEL)
  const held = reservedNumbers(MODEL)
  return held.length
    ? `The number is assigned for you: the next free one is ${next}. ` +
      `Article ${held.join(', ')} ${held.length > 1 ? 'are' : 'is'} reserved — held deliberately ` +
      'empty — and may be occupied instead. Numbering may not otherwise skip.'
    : `The number is assigned for you: the next free one is ${next}. Numbering may not skip.`
}

/**
 * The number is offered, never typed. Where a slot was held open deliberately,
 * it appears as its own button; there is no field in which a number could be
 * invented, and nothing to validate afterwards.
 */
function numberChoice () {
  const next = nextArticleNumber(MODEL)
  const held = reservedNumbers(MODEL)
  return `
    <fieldset class="number-choice">
      <legend>Which number should the new article take?</legend>
      <button type="button" class="btn btn--primary" data-act="new-article" data-number="${next}">
        Article ${next} — the next free number</button>
      ${held.map(n => `<button type="button" class="btn" data-act="new-article" data-number="${n}">
        Article ${n} — reserved, held deliberately empty</button>`).join('')}
      <button type="button" class="btn btn--quiet" data-act="cancel-add">Cancel</button>
    </fieldset>`
}

function articleCard (a) {
  // A number held deliberately empty — reserved, or omitted by an earlier Act.
  // It is shown, because the number is part of the document and a reader
  // looking for Article 19 must find it. It is not editable, because typing
  // text into a reserved provision would derive an operation that gives it a
  // body while leaving it marked reserved. Occupying the number is a different
  // act, and it has its own control.
  if (isEmptied(a) && !a.added) {
    const held = a.status === 'reserved'
    return `
    <article class="prov prov--article prov--held" data-id="${esc(a.id)}">
      <h3 class="prov__heading">
        <span class="prov__num">${esc(articleLabel(a))}</span>
        <span class="prov__title prov__title--held">${esc(a.title)}</span>
      </h3>
      <p class="prov__held-note">${held
        ? 'This number is <strong>reserved</strong> — held deliberately empty rather than skipped.'
        : 'This article was <strong>removed</strong> by an earlier Act. Its number is never reused, so every citation made to it still resolves.'}
      ${a.note ? esc(a.note) : ''}</p>
      ${held
        ? '<p class="prov__held-note">To put an article here, use <em>Add a new article</em> at the ' +
          'foot of the document and choose this number.</p>'
        : ''}
    </article>`
  }

  if (a.removed) {
    return `
    <article class="prov prov--removed" data-id="${esc(a.id)}">
      <h3 class="prov__heading">
        <span class="prov__num">${esc(articleLabel(a))}</span>
        <span class="prov__title prov__title--struck">${esc(a.title)}</span>
      </h3>
      <p class="prov__removed-note"><strong>You are proposing to remove this article.</strong>
      Its number stays and is never reused, so every citation ever made to it still resolves. The
      articles after it do not move.</p>
      <div class="field">
        <label for="why-${esc(a.id)}">Why is it being removed?</label>
        <input id="why-${esc(a.id)}" data-role="reason" value="${esc(a.removal_reason ?? '')}">
      </div>
      <button type="button" class="btn" data-act="restore">Keep this article after all</button>
    </article>`
  }

  const clauses = (a.sections ?? []).map(s => provisionCard(s, {
    label: clauseLabel(a, s), kind: 'clause', parent: a.id
  })).join('')

  return `
  <article class="prov prov--article${a.added ? ' prov--added' : ''}" data-id="${esc(a.id)}">
    ${a.added ? '<p class="prov__badge">New article</p>' : ''}
    ${provisionHead(a, articleLabel(a))}
    ${textBox(a, `Text of ${articleLabel(a)}`)}
    <div class="prov__clauses">${clauses}
      <div class="editor__add editor__add--clause">
        <button type="button" class="btn" data-act="add-clause">Add a clause to ${esc(articleLabel(a))}</button>
      </div>
    </div>
    <div class="prov__tools">
      ${CONFIRMING.has(a.id)
        ? confirmPanel(a, articleLabel(a), false)
        : `<button type="button" class="btn btn--quiet" data-act="ask-remove">Remove ${esc(articleLabel(a))}</button>`}
    </div>
  </article>`
}

function provisionCard (node, { label, kind, parent }) {
  return `
  <article class="prov prov--${kind}" data-id="${esc(node.id)}"${parent ? ` data-parent="${esc(parent)}"` : ''}>
    ${provisionHead(node, label)}
    ${textBox(node, `Text of ${label}`)}
    ${kind === 'clause'
      ? `<div class="prov__tools">
           ${CONFIRMING.has(node.id)
             ? confirmPanel(node, label, true)
             : '<button type="button" class="btn btn--quiet" data-act="ask-remove">Remove this clause</button>'}
         </div>`
      : ''}
  </article>`
}

/** The confirmation shows exactly what disappears — in full, not summarised. */
function confirmPanel (node, label, isClause) {
  const body = String(node.content ?? '').trim()
  const clauses = (node.sections ?? []).map(s =>
    `(${s.number}) ${s.title}\n${String(s.content ?? '').trim()}`).join('\n\n')
  return `
  <div class="confirm" role="group" aria-label="Confirm removing ${esc(label)}">
    <p class="confirm__q"><strong>Remove ${esc(label)}?</strong> This is what would go:</p>
    ${node.title ? `<p class="confirm__title">${esc(node.title)}</p>` : ''}
    <pre class="bill-text">${esc([body, clauses].filter(Boolean).join('\n\n') || '(no text)')}</pre>
    <p class="confirm__note">${isClause
      ? 'The clauses after it keep their own numbers. Nothing is renumbered.'
      : 'Its number stays and is never reused, so every citation ever made to it still resolves. The articles after it do not move.'}</p>
    <button type="button" class="btn btn--primary" data-act="confirm-remove">Yes, remove ${esc(label)}</button>
    <button type="button" class="btn" data-act="cancel-remove">Keep it</button>
  </div>`
}

function provisionHead (node, label) {
  return `
  <h3 class="prov__heading">
    <span class="prov__num">${esc(label)}</span>
    <label class="visually-hidden" for="h-${esc(node.id)}">Heading of ${esc(label)}</label>
    <input class="prov__title" id="h-${esc(node.id)}" data-role="title" value="${esc(node.title ?? '')}">
  </h3>`
}

function textBox (node, label) {
  const rows = Math.max(3, Math.min(24, String(node.content ?? '').split('\n').length + 1))
  return `
  <label class="visually-hidden" for="t-${esc(node.id)}">${esc(label)}</label>
  <textarea class="prov__text" id="t-${esc(node.id)}" data-role="text" rows="${rows}">${esc(node.content ?? '')}</textarea>`
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

const find = id => {
  if (MODEL.preamble?.id === id) return { node: MODEL.preamble }
  for (const a of MODEL.articles) {
    if (a.id === id) return { node: a, article: a }
    for (const s of a.sections ?? []) if (s.id === id) return { node: s, article: a }
  }
  return null
}

function wire () {
  el.addEventListener('input', e => {
    const card = e.target.closest('.prov')
    if (!card) return
    const hit = find(card.dataset.id)
    if (!hit) return
    const role = e.target.dataset.role
    if (role === 'title') hit.node.title = e.target.value
    else if (role === 'text') hit.node.content = e.target.value
    else if (role === 'reason') hit.node.removal_reason = e.target.value
    schedule()
  })

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]')
    if (!btn) return
    const act = btn.dataset.act
    // Where the keyboard should land once the document is re-rendered. A
    // control that re-renders and says nothing about focus sends whoever
    // pressed it back to the top of the page — which for a document this long
    // means losing their place entirely.
    let focusAfter = null

    if (act === 'add-article') { CHOOSING_NUMBER = true; focusAfter = '[data-act="new-article"]' }
    else if (act === 'cancel-add') { CHOOSING_NUMBER = false; focusAfter = '[data-act="add-article"]' }
    else if (act === 'new-article') {
      const number = Number(btn.dataset.number)
      addArticle(MODEL, { number, title: '', text: '' })
      CHOOSING_NUMBER = false
      focusAfter = `#h-art-${number}`
    } else {
      const card = btn.closest('.prov')
      if (!card) return
      const hit = find(card.dataset.id)
      if (!hit) return
      const isClause = hit.node !== hit.article
      const within = sel => `.prov[data-id="${CSS.escape(hit.node.id)}"] ${sel}`

      if (act === 'ask-remove') {
        CONFIRMING.add(hit.node.id)
        focusAfter = within('[data-act="confirm-remove"]')
      } else if (act === 'cancel-remove') {
        CONFIRMING.delete(hit.node.id)
        focusAfter = within('[data-act="ask-remove"]')
      } else if (act === 'confirm-remove') {
        CONFIRMING.delete(hit.node.id)
        if (isClause) removeClause(hit.article, hit.node)
        else removeArticle(hit.node, '')
        // Straight to the reason box, because a removal is not complete
        // without one and the review will say so.
        focusAfter = isClause
          ? `.prov[data-id="${CSS.escape(hit.article.id)}"] [data-act="add-clause"]`
          : `#why-${hit.node.id}`
      } else if (act === 'restore') {
        restoreArticle(hit.node)
        focusAfter = within('[data-act="ask-remove"]')
      } else if (act === 'add-clause') {
        const clause = addClause(hit.article, { title: '', text: '' })
        focusAfter = `#h-${clause.id}`
      } else return
    }

    renderDocument()
    if (focusAfter) el.querySelector(focusAfter)?.focus()
    refresh()
  })

  for (const id of ['#p-name', '#p-role', '#p-id', '#p-contact', '#p-title', '#p-objects', '#p-type']) {
    $(id)?.addEventListener('input', schedule)
    $(id)?.addEventListener('change', schedule)
  }
  $('#generate')?.addEventListener('click', download)
  $('#hash-copy')?.addEventListener('click', copyHash)
  $('#clear-draft')?.addEventListener('click', clearDraft)
  $('#upload')?.addEventListener('change', onUpload)
}

// ---------------------------------------------------------------------------
// Deriving, checking, showing
// ---------------------------------------------------------------------------

let timer
const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 200) }

const meta = () => ({
  name: $('#p-name')?.value ?? '',
  role: $('#p-role')?.value ?? '',
  membership_id: $('#p-id')?.value ?? '',
  contact: $('#p-contact')?.value ?? '',
  short_title: $('#p-title')?.value ?? '',
  objects_and_reasons: $('#p-objects')?.value ?? '',
  type: $('#p-type')?.value ?? 'amendment'
})

async function refresh () {
  if (!MODEL) return
  ops = deriveOperations(DOC, MODEL)
  const bill = buildDraft({ baseDoc: DOC, model: MODEL, meta: meta() })

  renderReview()

  const problems = reviewProblems(MODEL, ops, meta())
  if (VALIDATE && !problems.length && !VALIDATE(bill)) {
    for (const e of VALIDATE.errors ?? []) problems.push(`${e.instancePath || 'the proposal'} ${e.message}`)
  }
  report(problems)

  $('#hash-out').textContent = await substantiveHash(bill)
  $('#preview').textContent = instrumentPreview(bill)
  $('#generate').disabled = problems.length > 0
  save()
}

function renderReview () {
  const count = $('#change-count')
  const list = $('#changes')
  if (!ops.length) {
    count.textContent = 'You have not changed anything yet.'
    list.innerHTML = ''
    return
  }
  count.textContent = `You are proposing ${ops.length} change${ops.length > 1 ? 's' : ''}.`

  const base = index(DOC)
  list.innerHTML = ops.map((op, i) => {
    const before = base.get(op.target)
    const label = labelFor(op.target)
    const beforeText = before ? nodeText(before) : null
    const afterText = ['omit', 'reserve'].includes(op.operation) ? null : operationTextOf(op)
    const headingMoved = op.title != null && before && op.title !== before.title

    return `
    <article class="change" id="change-${i + 1}">
      <h3 class="change__title">${i + 1}. ${esc(verbFor(op, label))}</h3>
      ${headingMoved
        ? `<p class="change__heading">Heading: <del>${esc(before.title)}</del> → <ins>${esc(op.title)}</ins></p>`
        : ''}
      ${beforeText != null
        ? `<p class="change__label">It says now</p><pre class="bill-text">${esc(beforeText)}</pre>`
        : '<p class="change__label">This provision does not exist yet.</p>'}
      ${afterText == null
        ? '<p class="change__label">It would be removed. Its number stays, and is never reused.</p>'
        : `<p class="change__label">It would say</p><pre class="bill-text">${esc(afterText)}</pre>`}
      ${op.note ? `<p class="change__note">Reason recorded: ${esc(op.note)}</p>` : ''}
    </article>`
  }).join('')
}

const index = doc => {
  const m = new Map()
  if (doc.preamble) m.set(doc.preamble.id, doc.preamble)
  for (const a of doc.articles ?? []) {
    m.set(a.id, a)
    for (const s of a.sections ?? []) m.set(s.id, s)
  }
  return m
}

const nodeText = node =>
  [node.content ?? '', ...(node.sections ?? []).flatMap(s => [s.title ?? '', s.content ?? ''])]
    .join('\n').trim()

const operationTextOf = op =>
  [op.text ?? '', ...(op.sections ?? []).flatMap(s => [s.title ?? '', s.text ?? ''])].join('\n').trim()

function labelFor (id) {
  if (id === 'preamble') return 'the preamble'
  const m = /^art-(\d+)(?:-s-(\d+))?$/.exec(id)
  if (!m) return id
  return m[2] ? `Article ${m[1]}, clause (${m[2]})` : `Article ${m[1]}`
}

const verbFor = (op, label) => op.operation === 'insert'
  ? `A new ${label}${op.title ? ` — ${op.title}` : ''}`
  : op.operation === 'omit' ? `Remove ${label}`
    : op.operation === 'reserve' ? `Empty ${label}, keeping its number`
      : op.operation === 'retitle' ? `Change the heading of ${label}`
        : `Change ${label}`

function report (problems) {
  const box = $('#check-report')
  if (!problems.length) {
    box.className = 'banner'
    box.innerHTML = '<p><strong>Your proposal is ready.</strong> Download it, then email it to the ICC.</p>'
    return
  }
  box.className = 'banner banner--superseded'
  box.innerHTML = `<h3 class="banner__title">Not ready yet</h3><ul class="banner__list">${
    problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`
}

function instrumentPreview (bill) {
  try {
    return renderBillText(bill, { info: DOC.info, titles: titlesFromConstitution(DOC) })
  } catch (err) {
    return `The readable preview could not be rendered (${err.message}). Your proposal file is unaffected.`
  }
}

async function substantiveHash (bill) {
  // Hash what will be parsed, never what is displayed — see bill-serialise.mjs.
  const bytes = new TextEncoder().encode(canonicalJson(substantiveSubject(bill)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Continuing a proposal: the rebase
// ---------------------------------------------------------------------------

async function onUpload (e) {
  const file = e.target.files?.[0]
  if (!file) return
  const box = $('#rebase-report')
  box.className = 'banner'
  box.innerHTML = '<p>Reading your file…</p>'
  try {
    const { load, CORE_SCHEMA } = await import(new URL('../vendor/js-yaml.mjs', import.meta.url).href)
    const bill = load(await file.text(), { schema: CORE_SCHEMA })
    if (!bill?.operations) throw new Error('this does not look like a proposal file')
    await adopt(bill, box)
  } catch (err) {
    box.className = 'banner banner--superseded'
    box.innerHTML = `<h3 class="banner__title">That file could not be opened</h3>
      <p>${esc(err.message)}. If it came from this page it should end in <code>.yaml</code>. Send it
      to the ICC as it is and they will look at it.</p>`
  }
  e.target.value = ''
}

/**
 * Replay an uploaded proposal onto TODAY's constitution.
 *
 * The old text is never re-opened as-is. The model is rebuilt from what the
 * constitution says now, the file's operations are classified one by one, and
 * only the ones that still fit are re-made. Whatever is generated afterwards
 * therefore carries the current version as its base — not as a rule anyone
 * follows, but as the only thing this page can produce.
 */
async function adopt (bill, box) {
  const baseVersion = bill.bill?.base_version ?? null
  const baseDoc = baseVersion && baseVersion !== DOC.version ? await fetchArchived(baseVersion) : null
  const plan = rebasePlan(bill, DOC, baseDoc)

  MODEL = applyOperationsToModel(modelFromDoc(DOC), plan.carried)
  fill(bill)
  renderDocument()
  refresh()

  const bits = []
  bits.push(`<h3 class="banner__title">Your proposal has been re-made against version ${esc(DOC.version)}</h3>`)
  if (!plan.moved) {
    bits.push('<p>The constitution has not changed since you drafted this, so every change carried over exactly.</p>')
  } else {
    bits.push(`<p>You drafted this against version ${esc(String(baseVersion))}; the constitution is
      now at ${esc(DOC.version)}. Each change was checked against the words that are there today.</p>`)
  }
  if (plan.carried.length) {
    bits.push(`<p><strong>${plan.carried.length} change${plan.carried.length > 1 ? 's' : ''} carried
      over unchanged.</strong> ${plan.carried.map(o => esc(labelFor(o.target))).join(', ')}.</p>`)
  }
  if (plan.dropped.length) {
    bits.push(`<p><strong>${plan.dropped.length} change${plan.dropped.length > 1 ? 's are' : ' is'}
      no longer needed.</strong> ${plan.dropped.map(d => esc(labelFor(d.op.target))).join(', ')}
      already ${plan.dropped.length > 1 ? 'read' : 'reads'} the way you proposed — somebody else's
      Act carried the change while your draft was waiting. ${plan.dropped.length > 1 ? 'They have' : 'It has'}
      been dropped.</p>`)
  }
  if (plan.conflicts.length) {
    bits.push(`<h4 class="banner__title">${plan.conflicts.length} change${plan.conflicts.length > 1 ? 's need' : ' needs'} re-making</h4>`)
    bits.push(plan.baseAvailable
      ? '<p>These provisions were rewritten while your draft was waiting. Your version and the ' +
        'current one are below. Nothing has been carried over for these — make the change again ' +
        'in the document, against the words that are actually there.</p>'
      : `<p>Version ${esc(String(baseVersion))} is not published in machine-readable form, so this
         page cannot prove these provisions still say what they said when you drafted. It will not
         guess on a constitution. Make each change again against the current words.</p>`)
    bits.push(plan.conflicts.map(c => `
      <div class="conflict">
        <p class="conflict__what">${esc(labelFor(c.op.target))}</p>
        <div class="conflict__pair">
          <div><p class="change__label">It says now</p><pre class="bill-text">${esc(c.current)}</pre></div>
          <div><p class="change__label">You had proposed</p><pre class="bill-text">${esc(c.proposed)}</pre></div>
        </div>
        <p><a href="#t-${esc(c.op.target)}">Go to ${esc(labelFor(c.op.target))} in the document →</a></p>
      </div>`).join(''))
  }
  box.className = plan.conflicts.length ? 'banner banner--superseded' : 'banner'
  box.innerHTML = bits.join('')
}

async function fetchArchived (version) {
  try {
    const r = await fetch(new URL(`archive/${version}/constitution.json`, SITE))
    return r.ok ? await r.json() : null
  } catch { return null }
}

function fill (bill) {
  const b = bill.bill ?? {}
  const set = (sel, v) => { const n = $(sel); if (n && v != null) n.value = String(v) }
  set('#p-name', b.moved_by?.name)
  set('#p-role', b.moved_by?.role)
  set('#p-id', b.moved_by?.membership_id)
  set('#p-contact', b.moved_by?.contact)
  set('#p-title', b.short_title)
  set('#p-objects', (bill.objects_and_reasons ?? '').replace(/\n$/, ''))
  set('#p-type', b.type)
}

// ---------------------------------------------------------------------------
// The copy saved in this browser
//
// Crash protection, not archival — and the page says exactly that. What is
// stored is the DERIVED operations and the metadata, never the model and never
// the DOM: restoring runs the same rebase an uploaded file runs, so a draft
// that has been sitting while the constitution moved can no more re-open stale
// text than a file can.
// ---------------------------------------------------------------------------

function save () {
  const m = meta()
  const empty = !ops.length && !m.name.trim() && !m.short_title.trim() && !m.objects_and_reasons.trim()
  try {
    if (empty) { localStorage.removeItem(STORAGE_KEY); stamp(null); return }
    const savedAt = new Date().toISOString()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      savedAt, base_version: DOC.version, meta: m, operations: ops
    }))
    stamp(savedAt)
  } catch { /* private mode, or full: the download is the real copy either way */ }
}

function stamp (iso) {
  const n = $('#saved-at')
  if (!n) return
  n.textContent = iso ? `Last saved in this browser at ${new Date(iso).toLocaleString()}.` : ''
}

function offerRestore () {
  let saved
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') } catch { saved = null }
  if (!saved?.operations?.length && !saved?.meta?.name) return

  const box = $('#restore')
  box.hidden = false
  box.innerHTML = `
    <h2 class="banner__title">You have an unfinished proposal in this browser</h2>
    <p>Saved ${esc(new Date(saved.savedAt).toLocaleString())}${saved.meta?.short_title
      ? ` — “${esc(saved.meta.short_title)}”` : ''}, with
      ${saved.operations?.length ?? 0} change${(saved.operations?.length ?? 0) === 1 ? '' : 's'}
      against version ${esc(String(saved.base_version))}.</p>
    <p><button type="button" class="btn btn--primary" id="restore-yes">Pick up where I left
    off</button> <button type="button" class="btn" id="restore-no">Start again</button></p>`

  $('#restore-yes').addEventListener('click', async () => {
    box.hidden = true
    await adopt({
      bill: { base_version: saved.base_version, ...restoreMeta(saved.meta) },
      objects_and_reasons: saved.meta?.objects_and_reasons ?? '',
      operations: saved.operations ?? []
    }, $('#rebase-report'))
  })
  $('#restore-no').addEventListener('click', () => { box.hidden = true; clearDraft() })
}

const restoreMeta = (m = {}) => ({
  short_title: m.short_title,
  type: m.type,
  moved_by: { name: m.name, role: m.role, membership_id: m.membership_id, contact: m.contact }
})

function clearDraft () {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* nothing to clear */ }
  stamp(null)
  toast('The copy saved in this browser has been cleared.')
}

// ---------------------------------------------------------------------------

async function download () {
  const bill = buildDraft({ baseDoc: DOC, model: MODEL, meta: meta() })
  const slug = (bill.bill.short_title || 'proposal').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'proposal'

  send(billToYaml(bill), `proposal-${slug}.yaml`, 'text/yaml')
  // The readable copy, so the proposer can see what they are sending without
  // opening a file format they were never asked to learn.
  send(instrumentPreview(bill), `proposal-${slug}.txt`, 'text/plain')
  toast('Downloaded. Email both files to the ICC.')
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

async function copyHash () {
  try { await navigator.clipboard.writeText($('#hash-out').textContent) } catch { /* fall through */ }
  toast('Reference number copied.')
}

function toast (message) {
  const t = document.getElementById('toast')
  if (!t) return
  t.textContent = message
  t.classList.add('is-visible')
  setTimeout(() => t.classList.remove('is-visible'), 3200)
}
