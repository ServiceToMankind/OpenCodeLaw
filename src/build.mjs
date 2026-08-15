#!/usr/bin/env node
/**
 * YAML → static HTML.
 *
 * Every provision is rendered at build time. There is no client-side fetching
 * of specs: the previous renderer fetched YAML in the browser, which meant
 * social scrapers saw an empty body, search engines indexed nothing, and one
 * missing key could blank half the document.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { makeUrl, makeAbsolute, slugMap, escapeHtml, summarise, DEFAULT_BASE_PATH, DEFAULT_SITE_ORIGIN } from './lib/paths.mjs'
import { toPlainText, renderMarkdown } from './lib/markdown.mjs'
import { layout } from './templates/layout.mjs'
import { renderArticle, renderPreamble } from './templates/provision.mjs'
import { generateOgImages } from './og.mjs'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = () => path.join(ROOT, process.env.OUT_DIR ?? 'dist')

// Configurable so switching to the apex domain later is a one-line change.
export const BASE_PATH = DEFAULT_BASE_PATH
export const SITE_ORIGIN = DEFAULT_SITE_ORIGIN
// The custom domain is live. An artifact without CNAME can drop the domain
// setting on deploy, so this now defaults ON and must be opted OUT of.
const INCLUDE_CNAME = process.env.INCLUDE_CNAME !== 'false'

// Engine and content are separate. Point these at your own files and the
// engine needs no modification; versions/ and the act register are optional.
const CONSTITUTION_FILE = process.env.CONSTITUTION_FILE ?? 'constitution/current.yaml'
const VERSIONS_DIR = process.env.VERSIONS_DIR ?? 'constitution/versions'
const REGISTER_FILE = process.env.REGISTER_FILE ?? 'acts/register.yaml'
const OUT_DIR = process.env.OUT_DIR ?? 'dist'

const url = makeUrl(BASE_PATH)
const abs = makeAbsolute(SITE_ORIGIN, BASE_PATH)
const load = rel => yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { schema: yaml.CORE_SCHEMA })

const write = (rel, body) => {
  const full = path.join(OUT(), rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, body)
  return rel
}

const copyDir = (from, to) => {
  const src = path.join(ROOT, from)
  if (!fs.existsSync(src)) return 0
  const dst = path.join(OUT(), to)
  fs.mkdirSync(dst, { recursive: true })
  let n = 0
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory()) n += copyDir(path.join(from, entry.name), path.join(to, entry.name))
    else { fs.copyFileSync(path.join(src, entry.name), path.join(dst, entry.name)); n++ }
  }
  return n
}

// ---------------------------------------------------------------------------

function organizationLd (info) {
  return {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: info.organization, alternateName: info.title,
    url: abs(''), ...(info.logo?.url ? { logo: info.logo.url } : {}),
    ...(info.contact?.email ? { email: info.contact.email } : {}),
    ...(info.jurisdiction ? { areaServed: info.jurisdiction } : {})
  }
}

function legislationLd (info, doc) {
  return {
    '@context': 'https://schema.org', '@type': 'Legislation',
    name: `Constitution of ${info.organization}`,
    legislationIdentifier: info.version,
    legislationType: 'Constitution',
    legislationDate: info.effective_from,
    ...(info.jurisdiction ? { legislationJurisdiction: info.jurisdiction } : {}),
    inLanguage: 'en',
    url: abs(''),
    isBasedOn: (doc.articles ?? []).length + ' articles',
    publisher: { '@type': 'Organization', name: info.organization }
  }
}

const breadcrumbLd = trail => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: trail.map((t, i) => ({
    '@type': 'ListItem', position: i + 1, name: t.name, item: t.url
  }))
})

// ---------------------------------------------------------------------------

function buildSearchIndex (doc, slugs) {
  const rows = []
  const push = (id, title, text, articleId, articleTitle) => {
    const body = toPlainText(text)
    if (!body && !title) return
    rows.push({
      id,
      t: title,
      a: articleId ? slugs.get(articleId) : null,
      at: articleTitle ?? null,
      x: body.slice(0, 600)
    })
  }
  push('preamble', doc.preamble.title, doc.preamble.content, null, null)
  for (const a of doc.articles) {
    push(a.id, `${a.number}. ${a.title}`, a.content, a.id, a.title)
    for (const s of a.sections ?? []) {
      push(s.id, `${s.number}. ${s.title}`, s.content, a.id, a.title)
    }
  }
  return rows
}

/**
 * URLs the previous Apache host served that this one does not.
 *
 * Its .htaccess rewrote `/x.html` to the extensionless `/x`, so the canonical
 * old archive URLs had no extension. Static hosting cannot rewrite, so each
 * old shape gets a real page that redirects. Inbound links to a constitution
 * live in minutes, emails and other people's documents; letting them 404 is
 * how a citation dies.
 */
const LEGACY_REDIRECTS = {
  'archives/v1/index.html': 'archive/1.0.0/',
  'archives/v2/index.html': 'archive/2.0.0/',
  'archives/v1.html': 'archive/1.0.0/',
  'archives/v2.html': 'archive/2.0.0/',
  'archives/index.html': 'archive/'
}

function redirectStub (to, absTo) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Moved — this page has a new address</title>
    <link rel="canonical" href="${absTo}">
    <meta http-equiv="refresh" content="0; url=${to}">
    <meta name="robots" content="noindex, follow">
  </head>
  <body>
    <p>This page has moved to <a href="${to}">${absTo}</a>.</p>
    <script>location.replace(${JSON.stringify(to)})</script>
  </body>
</html>
`
}

/** Old `#article5` / `#article5-section2` links must keep resolving. */
function legacyAnchorMap (doc) {
  const map = {}
  doc.articles.forEach((a, i) => {
    map[`article${i + 1}`] = a.id
    ;(a.sections ?? []).forEach((s, j) => { map[`article${i + 1}-section${j + 1}`] = s.id })
  })
  map.articles = doc.articles[0]?.id ?? 'preamble'
  return map
}

// ---------------------------------------------------------------------------

export function build () {
  const doc = load(CONSTITUTION_FILE)
  const info = doc.info
  const state = doc.reconciliation_state
  const register = fs.existsSync(path.join(ROOT, REGISTER_FILE)) ? load(REGISTER_FILE) : { acts: [] }
  const actIndex = Object.fromEntries((register.acts ?? []).map(a => [a.id, a]))
  const slugs = slugMap(doc.articles)
  const written = []

  fs.rmSync(OUT(), { recursive: true, force: true })
  fs.mkdirSync(OUT(), { recursive: true })

  const shell = { info, url, absolute: abs, state, actIndex, articles: doc.articles, slugs }

  // ---- index: the whole constitution, every provision inline ----
  const indexMain = `
    <h1 class="page-title">Constitution of ${escapeHtml(info.organization)}</h1>
    <p class="page-lead">Version ${escapeHtml(info.version)} · effective ${escapeHtml(info.effective_from)}${info.registration ? ` · ${escapeHtml(info.registration)}` : ''}</p>
    ${renderPreamble(doc.preamble, { url, actIndex })}
    <h2 class="section-title" id="articles">Articles</h2>
    ${doc.articles.map(a => renderArticle(a, { url, actIndex, headingLevel: 3 })).join('')}`

  written.push(write('index.html', layout({
    ...shell,
    title: `Constitution of ${info.organization}`,
    description: summarise(toPlainText(doc.preamble.content)),
    canonical: abs(''),
    og: { type: 'article', image: abs('assets/og/home.png'), imageAlt: `Constitution of ${info.organization}` },
    jsonLd: [legislationLd(info, doc), organizationLd(info),
      breadcrumbLd([{ name: 'Constitution', url: abs('') }])],
    main: indexMain
  })))

  // ---- one page per article: the SEO surface ----
  for (const a of doc.articles) {
    const slug = slugs.get(a.id)
    const text = toPlainText(a.content) || toPlainText((a.sections ?? [])[0]?.content) || a.title
    const canonical = abs(`articles/${slug}/`)
    const main = `
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="${url('')}">Constitution</a> <span aria-hidden="true">/</span>
        <span aria-current="page">Article ${a.number}</span>
      </nav>
      <h1 class="page-title"><span class="page-title__num">Article ${a.number}</span> ${escapeHtml(a.title)}</h1>
      ${renderArticle(a, { url, actIndex, headingLevel: 2 })}
      <nav class="pager" aria-label="Article navigation">
        ${prevNext(doc.articles, a, slugs, url)}
      </nav>`

    written.push(write(`articles/${slug}/index.html`, layout({
      ...shell,
      currentId: a.id,
      tocMode: 'multi',
      title: `Article ${a.number}: ${a.title} — ${info.title}`,
      description: summarise(text),
      canonical,
      og: { type: 'article', image: abs(`assets/og/${slug}.png`), imageAlt: `Article ${a.number}: ${a.title}` },
      jsonLd: [
        {
          '@context': 'https://schema.org', '@type': 'Article',
          headline: `Article ${a.number}: ${a.title}`,
          articleSection: 'Constitution',
          description: summarise(text),
          url: canonical,
          datePublished: info.effective_from,
          isPartOf: { '@type': 'Legislation', name: `Constitution of ${info.organization}`, url: abs('') },
          publisher: { '@type': 'Organization', name: info.organization }
        },
        breadcrumbLd([
          { name: 'Constitution', url: abs('') },
          { name: `Article ${a.number}: ${a.title}`, url: canonical }
        ])
      ],
      main
    })))
  }

  // ---- amendment register ----
  written.push(write('amendments/index.html', layout({
    ...shell,
    showToc: false,
    title: `Amendment register — ${info.title}`,
    description: `Every instrument amending the constitution of ${info.organization}, with dates of assent, the provisions each touches, and the signed Act as published.`,
    canonical: abs('amendments/'),
    og: { image: abs('assets/og/amendments.png'), imageAlt: 'Amendment register' },
    jsonLd: [breadcrumbLd([
      { name: 'Constitution', url: abs('') },
      { name: 'Amendments', url: abs('amendments/') }
    ])],
    main: amendmentsMain(register, state, doc, { url, slugs, actIndex })
  })))

  // ---- archive ----
  const versions = fs.existsSync(path.join(ROOT, VERSIONS_DIR))
    ? fs.readdirSync(path.join(ROOT, VERSIONS_DIR)).filter(f => f.endsWith('.yaml')).sort()
    : []

  written.push(write('archive/index.html', layout({
    ...shell,
    showToc: false,
    title: `Archive — ${info.title}`,
    description: `Every superseded version of the constitution of ${info.organization}, frozen as published.`,
    canonical: abs('archive/'),
    og: { image: abs('assets/og/archive.png'), imageAlt: 'Archive' },
    jsonLd: [breadcrumbLd([
      { name: 'Constitution', url: abs('') }, { name: 'Archive', url: abs('archive/') }
    ])],
    main: `
      <h1 class="page-title">Archive</h1>
      <p class="page-lead">Superseded versions, frozen exactly as published. These are not the constitution in force.</p>
      <ul class="versions">
        <li class="versions__item versions__item--current">
          <a href="${url('')}"><strong>Version ${escapeHtml(info.version)}</strong></a>
          <span class="versions__badge">In force</span>
          <span class="versions__date">effective ${escapeHtml(info.effective_from)}</span>
        </li>
        ${versions.map(f => {
          const v = f.replace(/^v|\.yaml$/g, '')
          const d = load(`${VERSIONS_DIR}/${f}`)
          return `<li class="versions__item">
            <a href="${url(`archive/${v}/`)}"><strong>Version ${escapeHtml(v)}</strong></a>
            <span class="versions__badge versions__badge--old">Superseded</span>
            <span class="versions__date">effective ${escapeHtml(d.info.effective_from)}</span>
          </li>`
        }).join('')}
      </ul>`
  })))

  for (const f of versions) {
    const v = f.replace(/^v|\.yaml$/g, '')
    const d = load(`${VERSIONS_DIR}/${f}`)
    const successor = d.info.superseded_by
    written.push(write(`archive/${v}/index.html`, layout({
      ...shell,
      articles: d.articles,
      slugs: slugMap(d.articles),
      showToc: false,
      state: null,
      title: `Version ${v} (superseded) — ${info.title}`,
      description: `Version ${v} of the constitution of ${info.organization}, superseded and retained for reference. Not the text in force.`,
      canonical: abs(''),
      og: { image: abs('assets/og/archive.png'), imageAlt: `Version ${v}` },
      jsonLd: [breadcrumbLd([
        { name: 'Constitution', url: abs('') },
        { name: 'Archive', url: abs('archive/') },
        { name: `Version ${v}`, url: abs(`archive/${v}/`) }
      ])],
      main: `
        <aside class="banner banner--superseded" role="note" aria-labelledby="superseded-heading">
          <h2 class="banner__title" id="superseded-heading">This version is superseded</h2>
          <p class="banner__lead">
            Version ${escapeHtml(v)} is not the constitution in force. It is retained exactly as published,
            defects included, because an archive that changes is not an archive.
            ${successor ? `It was replaced by version ${escapeHtml(successor)}.` : ''}
          </p>
          <p class="banner__more"><a href="${url('')}">Read the version in force →</a></p>
        </aside>
        <h1 class="page-title">Constitution — version ${escapeHtml(v)}</h1>
        <p class="page-lead">Effective ${escapeHtml(d.info.effective_from)} · superseded</p>
        ${renderPreamble(d.preamble, { url, actIndex })}
        <h2 class="section-title" id="articles">Articles</h2>
        ${d.articles.map(a => renderArticle(a, { url, actIndex, headingLevel: 3 })).join('')}`
    })))
  }

  // ---- 404 ----
  written.push(write('404.html', layout({
    ...shell,
    showToc: false,
    title: `Page not found — ${info.title}`,
    description: 'The requested page does not exist.',
    canonical: abs('404.html'),
    main: `
      <h1 class="page-title">Page not found</h1>
      <p class="page-lead">That page does not exist. Citations of the form
      <code>#art-6-s-1</code> resolve on the <a href="${url('')}">constitution</a>.</p>
      <ul class="versions">
        <li class="versions__item"><a href="${url('')}">The constitution in force</a></li>
        <li class="versions__item"><a href="${url('amendments/')}">Amendment register</a></li>
        <li class="versions__item"><a href="${url('archive/')}">Archive</a></li>
      </ul>`
  })))

  // ---- data, assets, static files ----
  write('search-index.json', JSON.stringify(buildSearchIndex(doc, slugs)))
  write('legacy-anchors.json', JSON.stringify(legacyAnchorMap(doc)))
  for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
    written.push(write(from, redirectStub(url(to), abs(to))))
  }

  write('.nojekyll', '')
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('sitemap.xml')}\n`)
  write('sitemap.xml', sitemap(doc, slugs, versions))

  // Open Graph plates. Generated before assets are copied so they land in dist/assets/og/.
  const ogPages = [
    { slug: 'home', kicker: 'CONSTITUTION', title: `Constitution of ${info.organization}`,
      footer: `Version ${info.version} · effective ${info.effective_from}`,
      badge: state && !state.complete ? 'In reconciliation' : null },
    { slug: 'amendments', kicker: 'AMENDMENTS', title: 'Amendment register',
      footer: `${(register.acts ?? []).length} instruments · ${info.organization}` },
    { slug: 'archive', kicker: 'ARCHIVE', title: 'Superseded versions',
      footer: info.organization },
    ...doc.articles.map(a => ({
      slug: slugs.get(a.id),
      kicker: `ARTICLE ${a.number}`,
      title: a.title,
      footer: `${info.organization} · Constitution ${info.version}`,
      badge: (a.amended_by ?? []).length ? 'Amended' : null
    }))
  ]
  const og = generateOgImages(path.join(ROOT, 'assets/og'), ogPages, {
    logoPath: path.join(ROOT, 'assets/img/OpenCodeLaw.png'),
    bannerPath: path.join(ROOT, 'assets/img/openlawcode_banner.png')
  })

  copyDir('assets', 'assets')
  copyDir('favicons', 'favicons')
  copyDir('acts/pdf', 'acts/pdf')
  copyDir('src/styles', 'styles')
  copyDir('src/scripts', 'scripts')

  // The custom domain stays on the old site until it has been reviewed.
  if (INCLUDE_CNAME && fs.existsSync(path.join(ROOT, 'CNAME'))) {
    fs.copyFileSync(path.join(ROOT, 'CNAME'), path.join(OUT(), 'CNAME'))
  }

  return { written, doc, slugs, versions, register, og }
}

function prevNext (articles, current, slugs, url) {
  const i = articles.findIndex(a => a.id === current.id)
  const prev = articles[i - 1]
  const next = articles[i + 1]
  return [
    prev ? `<a class="pager__link pager__link--prev" href="${url(`articles/${slugs.get(prev.id)}/`)}">
      <span class="pager__dir">Previous</span><span class="pager__title">${prev.number}. ${escapeHtml(prev.title)}</span></a>` : '<span></span>',
    next ? `<a class="pager__link pager__link--next" href="${url(`articles/${slugs.get(next.id)}/`)}">
      <span class="pager__dir">Next</span><span class="pager__title">${next.number}. ${escapeHtml(next.title)}</span></a>` : '<span></span>'
  ].join('')
}

function amendmentsMain (register, state, doc, { url, slugs, actIndex }) {
  const byId = Object.fromEntries(doc.articles.map(a => [a.id, a]))
  const acts = (register.acts ?? []).slice().sort((a, b) => a.number - b.number)

  const rows = acts.map(act => {
    const status = act.application_status ?? 'pending'
    const provisions = (act.provisions ?? []).map(p => {
      const target = byId[p.target]
      const label = target ? `Article ${target.number}` : p.target
      const href = target ? `${url(`articles/${slugs.get(target.id)}/`)}` : `${url('')}#${p.target}`
      return `<li><a href="${href}">${escapeHtml(label)}</a> — ${escapeHtml(p.operation)}` +
        `${p.clauses ? ` clauses ${escapeHtml(p.clauses)}` : ''} (${escapeHtml(p.scope)} scope)</li>`
    }).join('')

    const discrepancies = (act.drafting_discrepancy ?? []).map(d => `
      <details class="disc">
        <summary>Drafting discrepancy in ${escapeHtml(d.provision)}</summary>
        <p class="disc__label">Operative text — governs</p>
        <blockquote>${escapeHtml(d.operative)}</blockquote>
        ${d.statement_of_objects ? `<p class="disc__label">Statement of Objects and Reasons — explanatory, does not govern</p>
        <blockquote>${escapeHtml(d.statement_of_objects)}</blockquote>` : ''}
        <p class="disc__note">${escapeHtml(d.note ?? '')}</p>
      </details>`).join('')

    const proc = act.procedure ? `
      <details class="disc">
        <summary>Approval chain</summary>
        <p class="disc__note">Required by ${escapeHtml(act.procedure.required_by ?? '—')}. Attested by ${escapeHtml(act.procedure.attested_by ?? '—')}.</p>
        <ul class="proc">${(act.procedure.approvals ?? []).map(ap =>
          `<li><span class="proc__body">${escapeHtml(ap.body)}</span> — ${ap.evidence ? escapeHtml(ap.evidence) : '<em>no evidence on file</em>'}</li>`).join('')}</ul>
      </details>` : ''

    return `
    <article class="act" id="${escapeHtml(act.id)}">
      <h2 class="act__title">
        <span class="act__num">Act ${act.number} of ${act.year}</span>
        ${escapeHtml(act.title)}
        <span class="act__status act__status--${escapeHtml(status)}">${escapeHtml(status.replace('-', ' '))}</span>
      </h2>
      ${act.short_title ? `<p class="act__short">Also called the ${escapeHtml(act.short_title)}</p>` : ''}
      <dl class="act__meta">
        <dt>Assent</dt><dd>${escapeHtml(act.assent_date)}</dd>
        ${act.passed_date ? `<dt>Passed</dt><dd>${escapeHtml(act.passed_date)} <span class="act__unverified">unverified</span></dd>` : ''}
        ${act.assented_by ? `<dt>Assented by</dt><dd>${escapeHtml(act.assented_by)}</dd>` : ''}
        ${act.signed_by ? `<dt>Signed by</dt><dd>${escapeHtml(act.signed_by)}</dd>` : ''}
        ${act.unverified_attribution ? `<dt>Attributed to</dt><dd>${escapeHtml(act.unverified_attribution)} <span class="act__unverified">unverified — not stated on the instrument</span></dd>` : ''}
        <dt>Instrument</dt><dd><a href="${url(act.pdf)}">Signed Act (PDF)</a></dd>
      </dl>
      ${provisions ? `<h3 class="act__sub">Provisions reconciled into the current text</h3><ul class="act__provisions">${provisions}</ul>`
        : '<p class="act__none">No provisions of this Act have been reconciled into the current text yet.</p>'}
      ${discrepancies}
      ${proc}
    </article>`
  }).join('')

  const held = (state?.held ?? []).map(h =>
    `<li><strong>${h.provisions.map(escapeHtml).join(', ')}</strong> — awaiting ${escapeHtml(Array.isArray(h.blocked_by) ? h.blocked_by.join(', ') : h.blocked_by)}${h.note ? `<span class="banner__note">${escapeHtml(h.note)}</span>` : ''}</li>`).join('')

  const editorial = doc.articles.flatMap(a => [
    ...(a.title_source === 'editorial' ? [{ id: a.id, label: `Article ${a.number}`, title: a.title }] : []),
    ...(a.sections ?? []).filter(s => s.title_source === 'editorial')
      .map(s => ({ id: s.id, label: `Article ${a.number}, clause ${s.number}`, title: s.title }))
  ])

  const editorialSection = `
    <h2 class="act__sub" id="editorial-headings">Headings not enacted by any instrument</h2>
    <p>Some headings in this constitution appear in an instrument and carry legal force. Others were
    supplied by an editor and do not. Act 1 of 2024 titles Article 11's clause (2)
    <strong>Establishment</strong>; it gives clause (1) no title at all, and the heading above it was
    written by an editor. Editorial headings are marked
    <span class="title-mark"><span aria-hidden="true">§</span><span class="visually-hidden">(editorial heading, not enacted)</span></span>
    throughout the text.</p>
    <p>A heading counts as enacted only where an instrument <em>already applied</em> to that provision
    states it as a heading. Nothing is credited to an Act that has not been applied.</p>
    <p><strong>${editorial.length}</strong> of ${doc.articles.reduce((n, a) => n + 1 + (a.sections?.length ?? 0), 0)}
    headings are editorial. They are listed here so the board can ratify or replace them, rather than
    have them quietly rewritten.</p>
    <ul class="act__provisions">
      ${editorial.map(e => `<li><a href="${url('')}#${escapeHtml(e.id)}">${escapeHtml(e.label)}</a> — <code>${escapeHtml(e.title)}</code></li>`).join('')}
    </ul>`

  return `
    <h1 class="page-title">Amendment register</h1>
    <p class="page-lead">Every instrument amending this constitution, with the provisions it touches and the signed Act as published.</p>
    ${held ? `<aside class="banner" role="note" aria-labelledby="held-heading">
      <h2 class="banner__title" id="held-heading">Not yet reconciled</h2>
      <ul class="banner__list">${held}</ul>
    </aside>` : ''}
    ${rows}
    ${editorialSection}`
}

function sitemap (doc, slugs, versions) {
  const urls = [
    { loc: abs(''), lastmod: doc.info.effective_from, priority: '1.0' },
    { loc: abs('amendments/'), lastmod: doc.info.effective_from, priority: '0.8' },
    { loc: abs('archive/'), lastmod: doc.info.effective_from, priority: '0.5' },
    ...doc.articles.map(a => ({
      loc: abs(`articles/${slugs.get(a.id)}/`),
      lastmod: doc.info.effective_from,
      priority: '0.9'
    })),
    ...versions.map(f => ({
      loc: abs(`archive/${f.replace(/^v|\.yaml$/g, '')}/`),
      lastmod: load(`${VERSIONS_DIR}/${f}`).info.effective_from,
      priority: '0.3'
    }))
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${escapeHtml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (direct) {
  const t = Date.now()
  const { written, doc, versions, og } = build()
  console.log(`built ${written.length} pages in ${Date.now() - t}ms`)
  console.log(`  base path   ${BASE_PATH}`)
  console.log(`  origin      ${SITE_ORIGIN}`)
  console.log(`  articles    ${doc.articles.length}`)
  console.log(`  archived    ${versions.length}`)
  console.log(`  og images   ${og.made} rendered${og.fallback ? `, ${og.fallback} fell back to the banner` : ''}${og.rasteriser ? ` (${og.rasteriser})` : ' (no rasteriser found)'}`)
  console.log(`  CNAME       ${INCLUDE_CNAME ? 'included' : 'excluded (custom domain untouched)'}`)
}
