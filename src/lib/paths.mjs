/**
 * URL construction.
 *
 * Every internal href and asset src in the built site goes through `url()`.
 * Root-relative paths that work on localhost and 404 on project Pages are the
 * classic failure for this deployment target, so the base path is applied in
 * exactly one place and asserted by tests.
 */

/**
 * Deployment defaults, defined once. build.mjs, linkcheck.mjs and the tests all
 * read these, so the base path they assume cannot drift apart — a mismatch
 * ships a site whose every link points at a directory that is not there.
 */
export const DEFAULT_BASE_PATH = process.env.BASE_PATH ?? '/'
export const DEFAULT_SITE_ORIGIN = (process.env.SITE_ORIGIN ?? 'https://constitution.stmorg.in').replace(/\/+$/, '')

/** Trailing slash, leading slash, no doubles. `/OpenCodeLaw/` or `/`. */
export function normaliseBase (base) {
  if (!base || base === '/') return '/'
  return ('/' + base.replace(/^\/+|\/+$/g, '') + '/')
}

export function makeUrl (base) {
  const b = normaliseBase(base)
  /** Site-absolute URL for a path relative to the site root. */
  return function url (p = '') {
    const clean = String(p).replace(/^\/+/, '')
    return b + clean
  }
}

/** Absolute URL for canonical/OG tags. */
export function makeAbsolute (origin, base) {
  const url = makeUrl(base)
  const o = String(origin).replace(/\/+$/, '')
  return p => o + url(p)
}

/**
 * URL slug for an article. Derived from the title, but identity always remains
 * the `id` — the slug is a convenience for readers and search engines, and the
 * anchor inside the page is what a citation points at.
 */
export function slugify (s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled'
}

/**
 * Slugs for every article, guaranteed unique and stable within a build.
 * A collision falls back to the article number, which cannot collide.
 */
export function slugMap (articles) {
  const used = new Map()
  const out = new Map()
  for (const a of articles) {
    let slug = slugify(a.title)
    if (used.has(slug)) slug = `${slug}-${a.number}`
    used.set(slug, true)
    out.set(a.id, slug)
  }
  return out
}

export const escapeHtml = s => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

/** Text for a meta description: first ~155 chars of real prose, never boilerplate. */
export function summarise (text, limit = 155) {
  const flat = String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`>|]/g, '')
    .replace(/^\s*[-–]\s*\(?[a-z0-9]+\)?[.)]?\s*/gim, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length <= limit) return flat
  const cut = flat.slice(0, limit)
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '))
  return (stop > 60 ? cut.slice(0, stop) : cut).replace(/[,;:.\s]+$/, '') + '…'
}
