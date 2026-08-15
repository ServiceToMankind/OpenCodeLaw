# Night run queue

**Protocol:** resume at the first unchecked item. Do not re-plan or re-audit.
One task → verify → commit → tick → next. Never batch. Max 3 attempts per gate, then `BLOCKED`.
Run `node .night-run/tripwire.mjs` before **every** commit. Red = stop everything.

**Branch:** `rebuild/v3` · never push to `main`, never force-push.
**Deploy target:** `https://servicetomankind.github.io/OpenCodeLaw/` · base path `/OpenCodeLaw/` · **no CNAME in artifact**.

---

## S — Scaffolding

- [x] S1 Tripwire script + baseline (82 provision strings)
- [x] S2 QUEUE.md, LOG.md
- [x] S3 Commit scaffolding

## L — Authorised legal metadata (no provision text changes except L2)

- [x] L1 `acts/register.yaml` — all three Acts; Act 1 provisions for arts. 9,10,11,12,18 only
- [x] L2 **DEVIATED** — Act 1 supplies no article-level body for art-11; empty `content` key removed instead. See REPORT.
- [ ] L3 `amended_by: [act-1-2024]` on arts. 9,10,11,12,18 only
- [x] L4 `version: 3.0.0-alpha.1` + `reconciliation_state` block
- [x] L5 Validation green on the two remaining known items only

## 4 — Build and deploy

- [x] 4a `src/build.mjs` skeleton + base-path helper + YAML load
- [x] 4b Templates: layout, provision rendering, sanitised Markdown
- [x] 4c `index.html` — full constitution, all provisions inline
- [x] 4d `articles/<slug>/index.html` per article
- [x] 4e `amendments/index.html` from register
- [x] 4f `archive/` index + `archive/v1.0.0/` + `archive/v2.0.0/` w/ banner + canonical
- [x] 4g `404.html`, `.nojekyll`, static asset copy, Act PDFs
- [x] 4h Reconciliation banner from `reconciliation_state` (never hardcoded)
- [x] 4i Hash resolution after DOM ready + sticky offset + legacy `#articleN` map
- [x] 4j Link checker — zero internal 404s
- [x] 4k Workflow: ci → validate → test → build → linkcheck → deploy (CNAME gated off)
- [x] 4l **Gate 4** + enable Pages + deploy + log URL

## 5 — SEO

- [x] 5a Per-page title, description from provision text, canonical
- [x] 5b OG + Twitter tags, real `<h1>` in source
- [x] 5c Build-time OG images (SVG→PNG, banner base plate)
- [x] 5d JSON-LD: Legislation, Article, BreadcrumbList, Organization
- [x] 5e `sitemap.xml` w/ per-provision lastmod + `robots.txt`
- [x] 5f **Gate 5** — raw curl checks, JSON-LD validates, sitemap URLs 200

## 6 — UI

- [x] 6a `tokens.css` — palette + `data-theme` + no-flash head script
- [x] 6b Font fixes (truetype, Cuprum format, font-display, Open Sans decision)
- [x] 6c `layout.css` — 18px/1.65/68ch, ragged-right, margin article numbers
- [x] 6d Desktop sticky ToC w/ overflow; **mobile bottom-sheet ToC (#1)**
- [x] 6e IntersectionObserver scroll-spy + auto-expand (#4)
- [x] 6f ⌘K search over build-time index
- [x] 6g Progress bar, focus mode, amended-by chips
- [x] 6h Copy-link toast `aria-live` (#7)
- [x] 6i A11y pass: skip link, landmarks, focus-visible, keyboard, reduced-motion, `<button aria-pressed>` (#25, #26)
- [x] 6j `print.css`
- [x] 6k **Gate 6** — Lighthouse a11y ≥95 / perf ≥90, keyboard walkthrough, screenshots, zero console errors

## 7 — Reusability

- [x] 7a `examples/starter/` minimal valid constitution
- [x] 7b `opencodelaw validate|build` bin entries
- [x] 7c `schema/SPEC.md` generated from JSON Schema (idempotent)
- [x] 7d `README.md` rewrite (no CDN install), `CONTRIBUTING.md`
- [x] 7e **Gate 7** — starter builds from clean checkout; SPEC.md regenerates identically twice

## V — Verification suite (add as built)

- [x] V1 No-JS render assertion
- [x] V2 Every anchor resolves
- [x] V3 Legacy `#articleN` maps for all 18
- [x] V4 Base-path correctness — nothing escapes `/OpenCodeLaw/`
- [x] V5 OG + JSON-LD per page type
- [x] V6 Citation stability stays green
- [x] V7 Tripwire green before every commit

## R — Report

- [ ] R1 `.night-run/REPORT.md`
