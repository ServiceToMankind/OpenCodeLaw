/**
 * Provision rendering.
 *
 * The `id` on each <article> is the schema id, unchanged. These anchors are a
 * public API — Acts cite them and people share them — so they are never
 * derived from position and never regenerated.
 */
import { escapeHtml } from '../lib/paths.mjs'
import { renderMarkdown } from '../lib/markdown.mjs'

function amendedByChips (ids, { url, actIndex }) {
  if (!ids?.length) return ''
  const chips = ids.map(id => {
    const act = actIndex[id]
    if (!act) return ''
    const label = `Act ${act.number} of ${act.year}`
    return `<span class="chip">
      <span class="chip__label">Amended by</span>
      <a class="chip__link" href="${url('amendments/')}#${escapeHtml(act.id)}">${escapeHtml(label)}</a>
      ${act.pdf ? `<a class="chip__pdf" href="${url(act.pdf)}" aria-label="${escapeHtml(label)} (PDF)">PDF</a>` : ''}
    </span>`
  }).join('')
  return chips ? `<p class="chips">${chips}</p>` : ''
}

/**
 * Marks a heading an editor supplied rather than one an instrument enacted.
 * Rendering both at identical weight is how Article 11's lowercase `units`
 * has sat above an enacted clause looking official.
 */
function editorialMark (titleSource) {
  if (titleSource !== 'editorial') return ''
  return ` <span class="title-mark" title="Editorial heading — not enacted by any instrument">` +
    `<span aria-hidden="true">§</span>` +
    `<span class="visually-hidden">(editorial heading, not enacted)</span></span>`
}

function copyButton (id, label) {
  return `<button type="button" class="copy" data-copy="${escapeHtml(id)}"
    aria-label="Copy link to ${escapeHtml(label)}"><span aria-hidden="true">🔗</span></button>`
}

/**
 * A section's heading must sit one level below its article's, or the document
 * outline says the two are siblings. Screen-reader users navigate this tree by
 * heading; a scanner reading "6 STM Roles" then "1 Board Member" at identical
 * weight cannot tell which contains which. Lighthouse does not catch it —
 * its sequential-headings audit only flags skipped levels, and h3 -> h3 is not
 * a skip.
 */
export function renderSection (section, { url, actIndex, headingLevel = 3 }) {
  const H = `h${Math.min(headingLevel, 6)}`
  const status = section.status ?? 'active'
  const body = status === 'active'
    ? renderMarkdown(section.content)
    : `<p class="no-text" role="note">[${escapeHtml(section.note ?? 'No text')}]</p>`
  return `
      <article class="provision provision--section" id="${escapeHtml(section.id)}" aria-labelledby="h-${escapeHtml(section.id)}">
        <${H} class="provision__heading" id="h-${escapeHtml(section.id)}">
          <span class="provision__num" aria-hidden="true">${section.number}</span>
          <span class="provision__title">${escapeHtml(section.title)}${editorialMark(section.title_source)}</span>
          ${copyButton(section.id, section.title)}
        </${H}>
        ${amendedByChips(section.amended_by, { url, actIndex })}
        <div class="provision__body">${body}</div>
      </article>`
}

export function renderArticle (article, opts) {
  const { url, actIndex, headingLevel = 2 } = opts
  const H = `h${headingLevel}`
  const status = article.status ?? 'active'

  if (status !== 'active') {
    return `
    <article class="provision provision--article provision--${escapeHtml(status)}" id="${escapeHtml(article.id)}" aria-labelledby="h-${escapeHtml(article.id)}">
      <${H} class="provision__heading" id="h-${escapeHtml(article.id)}">
        <span class="provision__num" aria-hidden="true">${article.number}</span>
        <span class="provision__title">${escapeHtml(article.title)}</span>
      </${H}>
      <p class="no-text" role="note">[${escapeHtml(status)}: ${escapeHtml(article.note ?? '')}]</p>
    </article>`
  }

  // An article may legitimately consist only of sections: Act 1 substitutes
  // Article 10 as a heading running straight into its clauses.
  const body = article.content != null
    ? `<div class="provision__body">${renderMarkdown(article.content)}</div>`
    : ((article.sections ?? []).length ? '' : `<div class="provision__body">${renderMarkdown(null)}</div>`)

  const sections = (article.sections ?? [])
    .map(s => renderSection(s, { ...opts, headingLevel: headingLevel + 1 }))
    .join('')

  return `
    <article class="provision provision--article" id="${escapeHtml(article.id)}" aria-labelledby="h-${escapeHtml(article.id)}">
      <${H} class="provision__heading" id="h-${escapeHtml(article.id)}">
        <span class="provision__num" aria-hidden="true">${article.number}</span>
        <span class="provision__title">${escapeHtml(article.title)}${editorialMark(article.title_source)}</span>
        ${copyButton(article.id, article.title)}
      </${H}>
      ${amendedByChips(article.amended_by, { url, actIndex })}
      ${body}
      ${sections ? `<div class="provision__sections">${sections}</div>` : ''}
    </article>`
}

export function renderPreamble (preamble, opts) {
  const { url, actIndex } = opts
  return `
    <article class="provision provision--preamble" id="${escapeHtml(preamble.id)}" aria-labelledby="h-preamble">
      <h2 class="provision__heading" id="h-preamble">
        <span class="provision__title">${escapeHtml(preamble.title)}</span>
        ${copyButton(preamble.id, preamble.title)}
      </h2>
      ${amendedByChips(preamble.amended_by, { url, actIndex })}
      <div class="provision__body">${renderMarkdown(preamble.content)}</div>
      ${preamble.adopted ? `<p class="provision__meta">Adopted ${escapeHtml(String(preamble.adopted).slice(0, 10))}</p>` : ''}
    </article>`
}
