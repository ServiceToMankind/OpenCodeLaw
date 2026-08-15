/**
 * The bill builder.
 *
 * Two things it guarantees by construction rather than by asking:
 *
 *  - a target is PICKED, never typed, so an operation cannot name a provision
 *    that does not exist;
 *  - the text box starts prefilled with the provision's current text, so an
 *    author edits a whole provision into its new form and physically cannot
 *    write "insert after the words…".
 *
 * Validation is the standalone build of the same JSON Schema the CLI uses; the
 * substantive hash is computed the same way. A second implementation of either
 * would be free to drift, which is the class of failure this project began with.
 */

import { blockText, canonicalJson, substantiveSubject, billToYaml } from './bill-serialise.mjs'

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel))

const form = $('#propose-form')
if (form) init().catch(err => report([{ message: `The builder could not start: ${err.message}` }]))

let PROVISIONS = null
let VALIDATE = null
let seq = 0

async function init () {
  const base = new URL('../', import.meta.url)
  const [provRes, validator] = await Promise.all([
    fetch(new URL('provisions.json', base)).then(r => r.json()),
    import(new URL('bill-validator.mjs', import.meta.url).href).then(m => m.default ?? m).catch(() => null)
  ])
  PROVISIONS = provRes
  VALIDATE = typeof validator === 'function' ? validator : null

  $('#op-add').addEventListener('click', () => addOperation())
  $('#download').addEventListener('click', download)
  $('#hash-copy').addEventListener('click', copyHash)
  form.addEventListener('input', debounce(refresh, 200))
  addOperation()
  refresh()
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) } }

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

function addOperation () {
  const node = $('#op-template').content.firstElementChild.cloneNode(true)
  const n = ++seq
  node.dataset.n = String(n)
  $('.op__n', node).textContent = String($$('.op', $('#op-list')).length + 1)

  const kind = $('.op__kind', node)
  const search = $('.op__search', node)
  const results = $('.op__results', node)

  kind.addEventListener('change', () => shapeFor(node))
  search.addEventListener('input', () => showMatches(node, search.value))
  search.addEventListener('keydown', e => pickerKeys(e, node))
  search.addEventListener('blur', () => setTimeout(() => { results.innerHTML = ''; search.setAttribute('aria-expanded', 'false') }, 150))
  $('.op__remove', node).addEventListener('click', () => {
    node.remove()
    $$('.op', $('#op-list')).forEach((el, i) => { $('.op__n', el).textContent = String(i + 1) })
    refresh()
  })
  for (const el of $$('.op__title, .op__text, .op__note, .op__number', node)) {
    el.addEventListener('input', () => { renderDiff(node); refresh() })
  }

  $('#op-list').appendChild(node)
  shapeFor(node)
  return node
}

/** Show only the inputs this kind of change needs. */
function shapeFor (node) {
  const kind = $('.op__kind', node).value
  const isInsert = kind === 'insert'
  const gone = kind === 'omit' || kind === 'reserve'

  $('.op__pick', node).hidden = isInsert
  $('.op__insert', node).hidden = !isInsert
  $('.op__titlebox', node).hidden = gone
  $('.op__textbox', node).hidden = gone || kind === 'retitle'
  $('.op__notebox', node).hidden = !gone

  if (isInsert) {
    const next = PROVISIONS.next_article
    const reserved = PROVISIONS.reserved ?? []
    const num = $('.op__number', node)
    if (!num.value) num.value = String(next)
    $('.op__insert-help', node).textContent = reserved.length
      ? `The next free number is ${next}. Article ${reserved.join(', ')} ${reserved.length > 1 ? 'are' : 'is'} reserved and may be occupied instead — numbering may not otherwise skip.`
      : `The next free number is ${next}. Numbering may not skip: to leave a number empty, reserve it deliberately.`
  }
  renderDiff(node)
  refresh()
}

function showMatches (node, q) {
  const results = $('.op__results', node)
  const search = $('.op__search', node)
  const query = q.trim().toLowerCase()
  if (!query) { results.innerHTML = ''; search.setAttribute('aria-expanded', 'false'); return }

  const kind = $('.op__kind', node).value
  const pool = PROVISIONS.provisions.filter(p => {
    if (kind === 'retitle') return true
    if (kind === 'omit' || kind === 'reserve') return p.kind === 'article'
    return true
  })
  const hits = pool.filter(p =>
    p.id.includes(query) ||
    (p.title ?? '').toLowerCase().includes(query) ||
    (p.number != null && String(p.number) === query)
  ).slice(0, 12)

  results.innerHTML = hits.map(p => {
    const label = p.kind === 'preamble' ? 'Preamble'
      : p.kind === 'section' ? `Article ${p.article_number}, clause ${p.number}`
        : `Article ${p.number}`
    return `<li role="option" tabindex="-1" data-id="${p.id}">
      <strong>${escapeHtml(label)}</strong> — ${escapeHtml(p.title ?? '')}
      <span class="sub">${escapeHtml(p.id)}</span></li>`
  }).join('')
  search.setAttribute('aria-expanded', hits.length ? 'true' : 'false')

  for (const li of $$('li', results)) {
    li.addEventListener('mousedown', e => { e.preventDefault(); choose(node, li.dataset.id) })
  }
}

function pickerKeys (e, node) {
  const items = $$('.op__results li', node)
  if (!items.length) return
  const active = items.findIndex(li => li.classList.contains('is-active'))
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const next = e.key === 'ArrowDown'
      ? Math.min(active + 1, items.length - 1)
      : Math.max(active - 1, 0)
    items.forEach(li => li.classList.remove('is-active'))
    items[next].classList.add('is-active')
    items[next].scrollIntoView({ block: 'nearest' })
  } else if (e.key === 'Enter') {
    e.preventDefault()
    choose(node, items[Math.max(active, 0)].dataset.id)
  } else if (e.key === 'Escape') {
    $('.op__results', node).innerHTML = ''
  }
}

/** Choosing a target prefills its current text. This is what makes full-text operations true. */
function choose (node, id) {
  const p = PROVISIONS.provisions.find(x => x.id === id)
  if (!p) return
  node.dataset.target = id
  node.dataset.kindOf = p.kind

  const label = p.kind === 'preamble' ? 'Preamble'
    : p.kind === 'section' ? `Article ${p.article_number}, clause ${p.number}`
      : `Article ${p.number}`
  $('.op__chosen', node).textContent = `Chosen: ${label} — ${p.title ?? ''} (${p.id})`
  $('.op__search', node).value = ''
  $('.op__results', node).innerHTML = ''

  const kind = $('.op__kind', node).value
  $('.op__title', node).value = p.title ?? ''
  if (kind === 'substitute') {
    // Prefilled with what it says now; the author edits it into what it should say.
    $('.op__text', node).value = fullTextOf(p)
  }
  if (kind === 'omit' || kind === 'reserve') {
    $('.op__confirm', node).hidden = false
    $('.op__confirm', node).innerHTML =
      `<p class="banner__note"><strong>This removes ${escapeHtml(label)} — ${escapeHtml(p.title ?? '')}</strong>
       from the constitution. Its number is not reused and the articles after it do not move.</p>
       <pre class="bill-text">${escapeHtml(fullTextOf(p).slice(0, 800))}</pre>`
  } else {
    $('.op__confirm', node).hidden = true
  }
  renderDiff(node)
  refresh()
}

const fullTextOf = p => [p.text ?? '', ...(p.sections ?? []).flatMap(s => [s.title, s.text])]
  .filter(Boolean).join('\n').trim()

function renderDiff (node) {
  const body = $('.op__diff-body', node)
  const id = node.dataset.target
  const kind = $('.op__kind', node).value
  const p = PROVISIONS.provisions.find(x => x.id === id)

  if (kind === 'insert') {
    body.innerHTML = `<p class="sub">New provision.</p><pre class="bill-text">${escapeHtml($('.op__text', node).value)}</pre>`
    return
  }
  if (!p) { body.innerHTML = '<p class="sub">Pick a provision to see the change.</p>'; return }

  const before = fullTextOf(p)
  const after = kind === 'retitle' ? before
    : (kind === 'omit' || kind === 'reserve') ? null
        : $('.op__text', node).value
  const titleBefore = p.title ?? ''
  const titleAfter = $('.op__title', node).value

  body.innerHTML = `
    ${titleBefore !== titleAfter ? `<p class="sub">Heading: <del>${escapeHtml(titleBefore)}</del> → <ins>${escapeHtml(titleAfter)}</ins></p>` : ''}
    <p class="sub">Before</p><pre class="bill-text">${escapeHtml(before)}</pre>
    <p class="sub">After</p>${after === null
      ? '<p class="sub">(provision removed)</p>'
      : `<pre class="bill-text">${escapeHtml(after)}</pre>`}`
}

// ---------------------------------------------------------------------------
// The bill, its hash, and the check
// ---------------------------------------------------------------------------

function buildBill () {
  const v = name => (form.elements[name]?.value ?? '').trim()
  const operations = $$('.op', $('#op-list')).map((node, i) => {
    const kind = $('.op__kind', node).value
    const target = kind === 'insert' ? `art-${$('.op__number', node).value || PROVISIONS.next_article}` : node.dataset.target
    const p = PROVISIONS.provisions.find(x => x.id === target)
    const op = {
      id: `op-${i + 1}`,
      operation: kind,
      target: target ?? '',
      scope: (node.dataset.kindOf === 'section' || p?.kind === 'section') ? 'clause' : 'article'
    }
    const title = $('.op__title', node).value.trim()
    if (kind === 'omit' || kind === 'reserve') {
      op.note = $('.op__note', node).value.trim() || 'No reason recorded.'
    } else {
      if (title) op.title = title
      if (kind !== 'retitle') op.text = blockText($('.op__text', node).value)
    }
    return op
  })

  const bill = {
    opencodelaw_bill: '1.0',
    bill: {
      short_title: v('short_title') || 'An Act to …',
      ...(v('also_known_as') ? { also_known_as: v('also_known_as') } : {}),
      year: new Date().getFullYear(),
      number: null,
      type: v('type') || 'amendment',
      moved_by: {
        name: v('name') || '',
        ...(v('role') ? { role: v('role') } : {}),
        ...(v('contact') ? { contact: v('contact') } : {})
      },
      drafted: new Date().toISOString().slice(0, 10),
      base_version: PROVISIONS.base_version,
      version_bump: 'minor'
    },
    status: 'draft',
    history: [],
    // Block-scalar form. A YAML `|` block always round-trips with exactly one
    // trailing newline, so the object hashed here must carry it too — otherwise
    // the hash shown on this page and the hash the CLI computes from the
    // downloaded file disagree, and a meeting resolves on a number that does
    // not match the file it is voting on.
    objects_and_reasons: blockText(v('objects_and_reasons') || '(none given)'),
    operations,
    approvals: ['board', 'intermediate-board', 'units'].map(body => ({
      body, meeting: { date: null }, present: null, for: null, against: null, abstain: null, bill_sha256: null
    })),
    enactment: { act_number: null, act_year: null, assent_date: null, assented_by: null, signed_by: null, signed_pdf: null, signed_pdf_sha256: null }
  }
  return bill
}



async function substantiveHash (bill) {
  // Hash what will be parsed, never what is displayed — see bill-serialise.mjs.
  const bytes = new TextEncoder().encode(canonicalJson(substantiveSubject(bill)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function refresh () {
  if (!PROVISIONS) return
  const bill = buildBill()
  const problems = []

  if (!bill.bill.moved_by.name) problems.push({ message: 'Add your name — a bill records who moved it, permanently.' })
  if (!bill.operations.length) problems.push({ message: 'Add at least one change.' })
  for (const [i, op] of bill.operations.entries()) {
    if (!op.target || op.target === 'art-') problems.push({ message: `Change ${i + 1}: pick a provision.` })
    if (op.operation === 'insert') {
      const n = Number(op.target.replace('art-', ''))
      const exists = PROVISIONS.provisions.some(p => p.id === op.target)
      const allowed = n === PROVISIONS.next_article || (PROVISIONS.reserved ?? []).includes(n)
      if (exists && !(PROVISIONS.reserved ?? []).includes(n)) {
        problems.push({ message: `Change ${i + 1}: Article ${n} already exists. Use “replace the text” instead.` })
      } else if (!allowed) {
        problems.push({ message: `Change ${i + 1}: Article ${n} would leave a gap. The next free number is ${PROVISIONS.next_article}${(PROVISIONS.reserved ?? []).length ? `, or occupy reserved Article ${PROVISIONS.reserved.join(', ')}` : ''}.` })
      }
    }
    if ((op.operation === 'substitute' || op.operation === 'insert') && !(op.text ?? '').trim()) {
      problems.push({ message: `Change ${i + 1}: write the complete resulting text.` })
    }
  }

  if (VALIDATE && !problems.length) {
    if (!VALIDATE(bill)) {
      for (const e of VALIDATE.errors ?? []) problems.push({ message: `${e.instancePath || 'the bill'} ${e.message}` })
    }
  }

  report(problems)
  $('#hash-out').textContent = await substantiveHash(bill)
  $('#preview').textContent = previewOf(bill)
  $('#download').disabled = problems.length > 0
}

function report (problems) {
  const el = $('#check-report')
  if (!problems.length) {
    el.className = 'banner'
    el.innerHTML = '<p><strong>This draft is well formed.</strong> Download it and send it to the ICC.</p>'
    return
  }
  el.className = 'banner banner--superseded'
  el.innerHTML = `<h3 class="banner__title">Not ready yet</h3><ul class="banner__list">${
    problems.map(p => `<li>${escapeHtml(p.message)}</li>`).join('')}</ul>`
}

const previewOf = bill => [
  `${bill.bill.short_title}`,
  `Moved by ${bill.bill.moved_by.name || '—'}${bill.bill.moved_by.role ? ', ' + bill.bill.moved_by.role : ''}`,
  `Drafted against constitution ${bill.bill.base_version}`,
  '',
  ...bill.operations.map((op, i) => `${i + 1}. ${verbFor(op)}`),
  '',
  'STATEMENT OF OBJECTS AND REASONS',
  bill.objects_and_reasons || '(none given)'
].join('\n')

const verbFor = op => op.operation === 'insert'
  ? `Insertion of new Article ${op.target.replace('art-', '')}${op.title ? ` - ${op.title}` : ''}:`
  : op.operation === 'omit' ? `Omission of ${op.target}:`
      : op.operation === 'reserve' ? `Reservation of ${op.target}:`
          : op.operation === 'retitle' ? `Amendment to ${op.target} (heading):`
              : `Amendment to ${op.target}:`

// ---------------------------------------------------------------------------


async function download () {
  const bill = buildBill()
  const slug = (bill.bill.short_title || 'draft').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'draft'
  const blob = new Blob([billToYaml(bill)], { type: 'text/yaml' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `draft-${slug}.yaml`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  toast('Draft downloaded. Send it to the ICC.')
}

async function copyHash () {
  const text = $('#hash-out').textContent
  try { await navigator.clipboard.writeText(text) } catch { /* fall through */ }
  toast('Hash copied.')
}

function toast (message) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = message
  el.classList.add('is-visible')
  setTimeout(() => el.classList.remove('is-visible'), 3200)
}

function escapeHtml (s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
