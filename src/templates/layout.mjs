/**
 * The page shell: head, landmarks, navigation, reconciliation banner, footer.
 *
 * Everything is server-rendered. The page is complete and readable with
 * JavaScript disabled; scripts only enhance.
 */
import { escapeHtml } from '../lib/paths.mjs'

/**
 * Runs before first paint so the theme never flashes. Inline by necessity —
 * an external file cannot beat the first paint.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');
if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`

/**
 * The reconciliation banner, built entirely from `reconciliation_state` in the
 * YAML. Never hardcoded: a banner that can fall out of step with the document
 * it describes is worse than no banner.
 */
export function reconciliationBanner (state, { url, actIndex = {} }) {
  if (!state || state.complete) return ''

  const naming = ids => ids.map(id => {
    const act = actIndex[String(id).replace(/\s*\(partial\)\s*$/, '')]
    if (act) return escapeHtml(act.title)
    if (/^art-\d+$/.test(id)) return `Article ${id.replace('art-', '')}`
    return escapeHtml(id)
  })

  const held = (state.held ?? []).map(h => {
    const what = naming(h.provisions)
    const why = Array.isArray(h.blocked_by) ? h.blocked_by.join(', ') : h.blocked_by
    return `<li><strong>${what.join(' and ')}</strong> — awaiting ${escapeHtml(why)}` +
      (h.note ? `<span class="banner__note">${escapeHtml(h.note)}</span>` : '') + '</li>'
  }).join('')

  return `
<aside class="banner" role="note" aria-labelledby="reconciliation-heading">
  <h2 class="banner__title" id="reconciliation-heading">This constitution is mid-reconciliation</h2>
  <p class="banner__lead">
    This text does not yet reflect every amendment enacted against it. It is published at
    <strong>${escapeHtml(state.target_version ? `version ${escapeHtml(String(state.target_version))} (in progress)` : 'an interim version')}</strong>
    so the gap is visible rather than hidden.
  </p>
  <ul class="banner__list">${held}</ul>
  <p class="banner__more">
    Every instrument, applied or pending, is listed in the
    <a href="${url('amendments/')}">amendment register</a>.
  </p>
</aside>`
}

/**
 * `mode: 'single'` — every provision is on this page (the full constitution),
 * so every entry is an in-page anchor.
 * `mode: 'multi'` — one article per page, so entries point at the article's own
 * page. Only the article being viewed gets in-page anchors; linking a section
 * of another article to `#id` would point at an element that is not there.
 */
export function tocNav (articles, { url, slugs, currentId = null, mode = 'single', homeUrl }) {
  const home = homeUrl ?? url('')
  const target = (a, frag) => {
    if (mode === 'single') return `#${frag}`
    if (a && a.id === currentId) return `#${frag}`
    if (!a) return `${home}#${frag}`
    return `${url(`articles/${slugs.get(a.id)}/`)}#${frag}`
  }

  const items = articles.map(a => {
    const active = a.id === currentId
    const href = mode === 'single' ? `#${a.id}` : url(`articles/${slugs.get(a.id)}/`)
    const sub = (a.sections ?? []).length
      ? `<ul class="toc__sub" id="toc-sub-${a.id}">` +
        a.sections.map(s =>
          `<li><a class="toc__link toc__link--sub" href="${target(a, s.id)}" data-anchor="${s.id}">` +
          `<span class="toc__num">${s.number}</span> ${escapeHtml(s.title)}</a></li>`).join('') +
        '</ul>'
      : ''
    return `<li class="toc__item${sub ? ' toc__item--parent' : ''}${active ? ' is-current' : ''}">
      <a class="toc__link" href="${href}" data-anchor="${a.id}">
        <span class="toc__num">${a.number}</span> ${escapeHtml(a.title)}
      </a>${sub}</li>`
  }).join('')

  return `<nav class="toc" id="toc" aria-labelledby="toc-heading">
  <h2 class="toc__heading" id="toc-heading">Contents</h2>
  <ul class="toc__list">
    <li class="toc__item"><a class="toc__link" href="${target(null, 'preamble')}" data-anchor="preamble">Preamble</a></li>
    ${items}
  </ul>
</nav>`
}

export function layout ({
  title, description, canonical, head = '', bodyClass = '',
  main, info, url, absolute, state, actIndex, articles, slugs,
  currentId = null, tocMode = 'single', showToc = true, jsonLd = [], og = {}
}) {
  const ogTags = Object.entries({
    'og:type': og.type ?? 'website',
    'og:site_name': info.title,
    'og:title': og.title ?? title,
    'og:description': og.description ?? description,
    'og:url': canonical,
    'og:image': og.image,
    'og:image:alt': og.imageAlt,
    'og:locale': 'en_IN'
  }).filter(([, v]) => v).map(([p, v]) =>
    `<meta property="${p}" content="${escapeHtml(v)}">`).join('\n    ')

  const twitter = [
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(og.title ?? title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(og.description ?? description)}">`,
    og.image ? `<meta name="twitter:image" content="${escapeHtml(og.image)}">` : ''
  ].filter(Boolean).join('\n    ')

  const ld = jsonLd.filter(Boolean).map(o =>
    `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n    ')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    ${ogTags}
    ${twitter}
    <link rel="icon" href="${url('favicons/favicon-32x32.png')}" sizes="32x32">
    <link rel="apple-touch-icon" href="${url('favicons/apple-icon-180x180.png')}">
    <link rel="stylesheet" href="${url('styles/tokens.css')}">
    <link rel="stylesheet" href="${url('styles/layout.css')}">
    <link rel="stylesheet" href="${url('styles/print.css')}" media="print">
    <script>${THEME_SCRIPT}</script>
    ${ld}
    ${head}
  </head>
  <body class="${bodyClass}">
    <a class="skip-link" href="#main">Skip to content</a>
    <div class="progress" id="progress" aria-hidden="true"><div class="progress__bar" id="progress-bar"></div></div>

    <header class="site-header" id="site-header">
      <a class="site-header__brand" href="${url('')}">
        ${info.logo ? `<img class="site-header__logo" src="${url('assets/img/OpenCodeLaw.png')}" alt="" width="36" height="36" decoding="async">` : ''}
        <span class="site-header__title">${escapeHtml(info.title)}</span>
      </a>
      <div class="site-header__actions">
        <button type="button" class="btn btn--icon" id="search-open" aria-label="Search the constitution" aria-keyshortcuts="Control+K Meta+K">
          <span aria-hidden="true">⌕</span><span class="btn__label">Search</span>
        </button>
        <button type="button" class="btn btn--icon" id="focus-toggle" aria-pressed="false" aria-label="Focus mode">
          <span aria-hidden="true">◐</span><span class="btn__label">Focus</span>
        </button>
        <button type="button" class="btn btn--icon" id="theme-toggle" aria-pressed="false" aria-label="Dark theme">
          <span aria-hidden="true" class="theme-toggle__icon"></span><span class="btn__label">Theme</span>
        </button>
      </div>
    </header>

    <div class="shell">
      ${showToc ? `<div class="shell__aside">${tocNav(articles, { url, slugs, currentId, mode: tocMode })}</div>` : ''}
      <main class="shell__main" id="main" tabindex="-1">
        ${reconciliationBanner(state, { url, actIndex })}
        ${main}
      </main>
    </div>

    <footer class="site-footer">
      <p>${escapeHtml(info.organization)}${info.jurisdiction ? ` · ${escapeHtml(info.jurisdiction)}` : ''}</p>
      <p>
        <a href="${url('')}">Constitution</a> ·
        <a href="${url('amendments/')}">Amendments</a> ·
        <a href="${url('archive/')}">Archive</a>
        ${info.contact?.email ? ` · <a href="mailto:${escapeHtml(info.contact.email)}">Contact</a>` : ''}
      </p>
      <p class="site-footer__meta">
        ${info.legal_status === 'not_adopted'
          ? `Last adopted version ${escapeHtml(info.adopted_version)} · text as at ${escapeHtml(info.text_as_of)} · not yet adopted`
          : `Version ${escapeHtml(info.version)} · effective ${escapeHtml(info.effective_from)}`}
        ${info.license ? ` · ${escapeHtml(info.license)}` : ''}
      </p>
    </footer>

    ${showToc ? `<button type="button" class="toc-fab" id="toc-fab" aria-expanded="false" aria-controls="toc-sheet">
      <span aria-hidden="true">☰</span> Contents
    </button>
    <div class="sheet" id="toc-sheet" role="dialog" aria-modal="true" aria-label="Contents" hidden>
      <div class="sheet__panel">
        <div class="sheet__head">
          <h2 class="sheet__title">Contents</h2>
          <button type="button" class="btn" id="toc-close" aria-label="Close contents">Close</button>
        </div>
        <div class="sheet__body">${tocNav(articles, { url, slugs, currentId, mode: tocMode })}</div>
      </div>
    </div>` : ''}

    <div class="dialog" id="search-dialog" role="dialog" aria-modal="true" aria-label="Search the constitution" hidden>
      <div class="dialog__panel">
        <label class="visually-hidden" for="search-input">Search the constitution</label>
        <input class="dialog__input" id="search-input" type="search" autocomplete="off"
               placeholder="Search provisions…" aria-describedby="search-hint">
        <p class="dialog__hint" id="search-hint">Type to search. Enter opens the first result, Escape closes.</p>
        <ul class="dialog__results" id="search-results" role="listbox" aria-label="Search results"></ul>
      </div>
    </div>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <button type="button" class="to-top" id="to-top" aria-label="Back to top" hidden>↑</button>

    <script type="module" src="${url('scripts/app.js')}"></script>
  </body>
</html>
`
}
