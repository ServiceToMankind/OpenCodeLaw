/**
 * Markdown → sanitised HTML.
 *
 * The previous renderer piped YAML straight into innerHTML. Any organisation
 * pointing this engine at a third-party spec inherited an XSS vector, so
 * everything is sanitised at build time against a strict allowlist.
 *
 * The allowlist deliberately contains no SVG and no SMIL animation elements.
 * That closes the `<animate attributeName="href">` scheme-smuggling class
 * outright, rather than relying on the sanitiser's URL parsing to catch it.
 */
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'strong', 'em', 'b', 'i', 'u', 's', 'sup', 'sub', 'small',
  'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  // h1 and h2 are reserved for document structure; provision prose starts at h3.
  'h3', 'h4', 'h5', 'h6',
  'a',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption'
]

const SANITIZE_OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
    ol: ['start']
  },
  // `id` is never taken from content: provision anchors are a public API and
  // authored Markdown must not be able to mint or shadow one.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (tagName, attribs) => {
      const out = { ...attribs }
      if (out.href && /^https?:\/\//i.test(out.href)) {
        out.rel = 'noopener noreferrer'
        out.target = '_blank'
      }
      return { tagName, attribs: out }
    }
  }
}

marked.setOptions({ gfm: true, breaks: false })

/** Marker shown where a provision was published with no text recorded. */
export const NO_TEXT_MARKER =
  '<p class="no-text" role="note">[No text was recorded for this provision]</p>'

export function renderMarkdown (src) {
  if (src == null || String(src).trim() === '') return NO_TEXT_MARKER
  return sanitizeHtml(marked.parse(String(src)), SANITIZE_OPTIONS)
}

/** Plain text of a provision, for descriptions and the search index. */
export function toPlainText (src) {
  if (src == null) return ''
  return sanitizeHtml(marked.parse(String(src)), { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export { SANITIZE_OPTIONS, ALLOWED_TAGS }
