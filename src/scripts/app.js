/**
 * Progressive enhancement for the constitution site. The document is complete
 * without this file, so every feature is guarded: the amendment register, the
 * archive and the 404 page carry no table of contents and no copy buttons, and
 * this module must stay silent there. No imports, no build step. Loaded as
 * type="module", so it is deferred and the DOM is parsed by the time it runs.
 */

const byId = id => document.getElementById(id)
const all = (sel, root = document) => Array.from(root.querySelectorAll(sel))
const make = (tag, text) => { const n = document.createElement(tag); n.textContent = text ?? ''; return n }
// Read live: the OS setting can change without a reload.
const behavior = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

/**
 * How much of the page the sticky header covers. Anchors are citation handles;
 * landing with the heading hidden under the header makes a cited provision look
 * like the one above it, so every programmatic scroll pays this offset.
 */
function headerOffset () {
  const root = document.documentElement
  const raw = getComputedStyle(root).getPropertyValue('--header-h').trim()
  let px = parseFloat(raw)
  if (!Number.isFinite(px)) px = byId('site-header')?.getBoundingClientRect().height ?? 0
  else if (raw.endsWith('rem')) px *= parseFloat(getComputedStyle(root).fontSize) || 16
  return px + 12
}

/** Scroll to an element id on this page. Returns false if it is not here. */
function goToId (id, { push = false } = {}) {
  const el = byId(id)
  if (!el) return false
  if (push) history.pushState(null, '', '#' + id)
  window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - headerOffset()), behavior: behavior() })
  // Match native fragment navigation: the target takes focus, not just the eye.
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
  return true
}

// --- 1. Hash resolution, including the retired #article5 / #article5-section2 ids ---

let legacyPromise = null
const legacyMap = () => (legacyPromise ??= fetch(new URL('../legacy-anchors.json', import.meta.url))
  .then(r => (r.ok ? r.json() : {})).catch(() => ({})))

async function resolveHash () {
  const raw = decodeURIComponent(location.hash.slice(1))
  if (!raw) return
  // A live anchor still needs re-scrolling: the browser's own jump ignores the
  // sticky header, and on a cold load it happens before this module runs.
  if (goToId(raw)) return
  const mapped = (await legacyMap())[raw]
  if (!mapped || !byId(mapped)) return
  history.replaceState(null, '', '#' + mapped)
  goToId(mapped)
}

function initHashRouting () {
  let scrolled = false
  window.addEventListener('scroll', () => { scrolled = true }, { passive: true, once: true })
  resolveHash()
  // Late images and webfonts can move the target after the first pass.
  window.addEventListener('load', () => { if (!scrolled) resolveHash() }, { once: true })
  window.addEventListener('hashchange', resolveHash)

  // Take over same-page anchors so the offset applies without the visible
  // double jump of letting the browser land first and correcting afterwards.
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = e.target.closest?.('a[href]')
    if (!a || a.target === '_blank') return
    let url
    try { url = new URL(a.href, location.href) } catch { return }
    if (url.pathname !== location.pathname || url.search !== location.search) return
    const id = decodeURIComponent(url.hash.slice(1))
    if (!id || !byId(id)) return
    e.preventDefault()
    closeModal()
    goToId(id, { push: true })
  })
}

// --- 2. Theme toggle --------------------------------------------------------

const stored = key => { try { return localStorage.getItem(key) } catch { return null } }

function initTheme () {
  const btn = byId('theme-toggle')
  if (!btn) return
  const root = document.documentElement
  const system = window.matchMedia('(prefers-color-scheme: dark)')

  const paint = theme => {
    root.setAttribute('data-theme', theme)
    const dark = theme === 'dark'
    btn.setAttribute('aria-pressed', String(dark))
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme')
    btn.title = dark ? 'Dark theme' : 'Light theme'
  }

  // The inline head script has already set data-theme; only the label is new.
  paint(stored('theme') || root.getAttribute('data-theme') || (system.matches ? 'dark' : 'light'))

  btn.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    paint(next)
    try { localStorage.setItem('theme', next) } catch { /* private mode: holds for this session */ }
  })
  // Follow the OS only while the reader has never expressed a preference.
  system.addEventListener('change', e => { if (!stored('theme')) paint(e.matches ? 'dark' : 'light') })
}

// --- 3 + 4. Focus mode, the provision in view, and the contents scroll spy ---

function initReading () {
  const focusBtn = byId('focus-toggle')
  focusBtn?.addEventListener('click', () => {
    const on = document.body.classList.toggle('is-focus-mode')
    focusBtn.setAttribute('aria-pressed', String(on))
    focusBtn.setAttribute('aria-label', on ? 'Leave focus mode' : 'Focus mode')
  })

  const provisions = all('.provision[id]')
  if (!provisions.length || !('IntersectionObserver' in window)) return
  let current = null

  const mark = el => {
    if (el === current) return
    current?.classList.remove('is-in-view')
    current = el
    if (!el) return
    el.classList.add('is-in-view') // set always; the stylesheet uses it in focus mode

    // Never build a selector from an href: anchors are the public citation API
    // and may hold characters that are not valid CSS. data-anchor is the key.
    let matched = null
    for (const link of all('.toc__link[data-anchor]')) {
      const hit = link.dataset.anchor === el.id
      link.classList.toggle('is-active', hit)
      if (hit) matched = link
    }
    if (!matched) return
    // is-current on the enclosing item is what opens that article's toc__sub.
    const item = matched.closest('.toc__item')
    for (const other of all('.toc__item')) other.classList.toggle('is-current', other === item)
  }

  // Sections sit inside their article, so both match .provision[id]. Keeping the
  // last one to cross the reading line prefers the section over its parent
  // article, which is what a reader means by "where am I".
  const pick = () => {
    const line = headerOffset() + 4
    let best = null
    for (const el of provisions) {
      if (el.getBoundingClientRect().top <= line) best = el
      else if (!best) return el
    }
    return best
  }

  const io = new IntersectionObserver(() => mark(pick()), {
    rootMargin: `-${Math.round(headerOffset())}px 0px -55% 0px`
  })
  for (const el of provisions) io.observe(el)
}

// --- Modal plumbing shared by the contents sheet and the search dialog ------

let active = null // { el, opener }

const focusable = root => all(
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', root
).filter(el => el.getClientRects().length > 0)

// Only touch aria-expanded where the HTML declares it; the Ctrl+K opener can be
// any focused element and must not be given ARIA it never asked for.
const expanded = (el, state) => { if (el?.hasAttribute('aria-expanded')) el.setAttribute('aria-expanded', state) }

function openModal (el, opener, first) {
  if (!el) return
  closeModal()
  active = { el, opener }
  el.hidden = false
  document.body.classList.add('is-modal-open')
  expanded(opener, 'true')
  ;(first || focusable(el)[0])?.focus()
}

function closeModal () {
  if (!active) return
  const { el, opener } = active
  active = null
  el.hidden = true
  document.body.classList.remove('is-modal-open')
  expanded(opener, 'false')
  if (opener?.isConnected) opener.focus()
}

// Escape closes; Tab is trapped inside whichever surface is open.
document.addEventListener('keydown', e => {
  if (!active) return
  if (e.key === 'Escape') { e.preventDefault(); closeModal(); return }
  if (e.key !== 'Tab') return
  const items = focusable(active.el)
  if (!items.length) { e.preventDefault(); return }
  const first = items[0]
  const last = items[items.length - 1]
  const here = document.activeElement
  const outside = !active.el.contains(here)
  if (e.shiftKey && (here === first || outside)) { e.preventDefault(); last.focus() } else if (!e.shiftKey && (here === last || outside)) { e.preventDefault(); first.focus() }
})

// --- 5. Mobile contents sheet -----------------------------------------------

function initSheet () {
  const fab = byId('toc-fab')
  const sheet = byId('toc-sheet')
  if (!fab || !sheet) return
  const close = byId('toc-close')
  fab.addEventListener('click', () => openModal(sheet, fab, close))
  close?.addEventListener('click', closeModal)
  sheet.addEventListener('click', e => { if (e.target === sheet) closeModal() }) // scrim
}

// --- 6. Search --------------------------------------------------------------

function initSearch () {
  const dialog = byId('search-dialog')
  const input = byId('search-input')
  const results = byId('search-results')
  if (!dialog || !input || !results) return
  const opener = byId('search-open')
  const hint = byId('search-hint')
  const hintText = hint?.textContent ?? ''

  let index = null
  let rows = []
  let cursor = -1

  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-autocomplete', 'list')
  input.setAttribute('aria-controls', 'search-results')
  input.setAttribute('aria-expanded', 'false')

  // Fetched on first open, never on page load: most readers never search.
  const load = () => (index
    ? Promise.resolve(index)
    : fetch(new URL('../search-index.json', import.meta.url))
      .then(r => (r.ok ? r.json() : [])).catch(() => [])
      .then(data => (index = Array.isArray(data) ? data : [])))

  const match = q => {
    const needle = q.trim().toLowerCase()
    if (!needle || !index) return []
    const scored = []
    for (const row of index) {
      const at = (row.t || '').toLowerCase().indexOf(needle)
      if (at === 0) scored.push([0, row])
      else if (at > 0) scored.push([1, row])
      else if ((row.x || '').toLowerCase().includes(needle)) scored.push([2, row])
    }
    // Sort is stable, so document order survives inside each band.
    return scored.sort((a, b) => a[0] - b[0]).slice(0, 25).map(s => s[1])
  }

  const highlight = i => {
    cursor = i
    const items = Array.from(results.children)
    items.forEach((li, n) => li.setAttribute('aria-selected', String(n === i)))
    if (items[i]) {
      input.setAttribute('aria-activedescendant', items[i].id)
      items[i].scrollIntoView({ block: 'nearest' })
    } else input.removeAttribute('aria-activedescendant')
  }

  const render = () => {
    results.textContent = ''
    rows.forEach((row, i) => {
      const li = make('li')
      li.id = 'search-result-' + i
      li.setAttribute('role', 'option')
      li.setAttribute('aria-selected', 'false')
      li.dataset.index = String(i)
      // Provision title first, then the article it belongs to: the pair is what
      // makes "3. Membership" unambiguous in a list of eighteen articles.
      li.append(make('strong', row.t || row.id), make('span', row.at || 'Preamble'))
      results.append(li)
    })
    input.setAttribute('aria-expanded', String(rows.length > 0))
    const q = input.value.trim()
    if (hint) hint.textContent = q && !rows.length ? `No provision matches “${q}”.` : hintText
    highlight(rows.length ? 0 : -1)
  }

  /** Same-page anchor if the provision is here, else the article page that owns it. */
  const go = row => {
    if (!row) return
    closeModal()
    if (goToId(row.id, { push: true })) return
    const base = row.a ? new URL('../articles/' + row.a + '/', import.meta.url) : new URL('../', import.meta.url)
    location.href = base.href + '#' + row.id
  }

  const open = from => {
    openModal(dialog, from, input)
    input.select()
    load().then(() => { rows = match(input.value); render() })
  }

  opener?.addEventListener('click', () => open(opener))
  input.addEventListener('input', () => { rows = match(input.value); render() })

  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || (e.key !== 'k' && e.key !== 'K')) return
    e.preventDefault()
    if (active?.el === dialog) return closeModal()
    // Focus returns wherever it came from, which may not be the search button.
    const from = document.activeElement
    open(from && from !== document.body ? from : opener)
  })

  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length) return
      e.preventDefault()
      highlight((cursor + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(rows[cursor >= 0 ? cursor : 0])
    }
  })

  results.addEventListener('click', e => {
    const li = e.target.closest?.('li[data-index]')
    if (li) go(rows[Number(li.dataset.index)])
  })
  dialog.addEventListener('click', e => { if (e.target === dialog) closeModal() })
}

// --- 7. Copy link -----------------------------------------------------------

function initCopy () {
  const buttons = all('button.copy[data-copy]')
  if (!buttons.length) return
  const toast = byId('toast')
  let timer = 0

  const say = message => {
    if (!toast) return
    // Both signals: the stylesheet may reveal on content (:not(:empty)) or state.
    toast.textContent = message
    toast.classList.add('is-visible')
    clearTimeout(timer)
    timer = setTimeout(() => { toast.classList.remove('is-visible'); toast.textContent = '' }, 2400)
  }

  const legacyCopy = text => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
    document.body.append(ta)
    ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { /* no fallback left */ }
    ta.remove()
    return ok
  }

  for (const btn of buttons) {
    btn.addEventListener('click', async () => {
      const href = location.origin + location.pathname + location.search + '#' + btn.dataset.copy
      let ok = false
      // navigator.clipboard exists only in a secure context; file:// has none.
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(href); ok = true } catch { /* fall through */ }
      }
      if (!ok) ok = legacyCopy(href)
      say(ok ? 'Link copied' : 'Press Ctrl+C to copy the link')
    })
  }
}

// --- 8 + 9. Reading progress and back to top --------------------------------

function initScrollUi () {
  const bar = byId('progress-bar')
  const toTop = byId('to-top')
  if (!bar && !toTop) return
  let ticking = false

  const update = () => {
    ticking = false
    if (bar) {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const ratio = max > 8 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      // transform only: animating width would relayout the page every frame.
      bar.style.transform = 'scaleX(' + ratio.toFixed(4) + ')'
    }
    if (toTop) toTop.hidden = window.scrollY <= 400
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update) } }

  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  toTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: behavior() })
    // Move focus off the button before it hides itself out from under the user.
    byId('site-header')?.querySelector('a, button')?.focus()
  })
  update() // a reload can restore a deep scroll position
}

initHashRouting()
initTheme()
initReading()
initSheet()
initSearch()
initCopy()
initScrollUi()
