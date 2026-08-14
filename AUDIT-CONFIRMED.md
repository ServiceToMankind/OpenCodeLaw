# Audit Verification

**Verified:** 2026-08-14 · branch `rebuild/v3` · against `main` @ `1d327b0`
**Method:** every claim reproduced empirically — no finding accepted on inspection alone.

Test harness: Node 18.19.1, `js-yaml@4.1.0`, `marked@15.0.6` (npm) and `marked@15.0.12` (the file the
production CDN URL actually serves today), `jsdom@24.1.3`. The live page was reconstructed in a real
DOM — same markup as [index.html](index.html), same two CDN libraries, same
[js/opencodelaw.js](js/opencodelaw.js), with `fetch` stubbed to read the repo from disk — and the
resulting document inspected.

---

## Verdict summary

| # | Claim | Verdict |
|---|---|---|
| 1 | Art. 11 `Units` has no `content:` key → `marked.parse(undefined)` throws → kills arts. 11–18, amendments table, back-to-top, theme restore, nav | ❌ **Refuted** |
| 2 | `cdn.jsdelivr.net/npm/marked/marked.min.js` is unversioned and the file no longer exists | ⚠️ **Half true** |
| 3 | `navArticleId = navLink.href = '#article1'` returns an absolute URL → `querySelector` SyntaxError → scroll-spy never works | ❌ **Refuted** |
| 4 | `scroll` listener registered before `#backToTop` exists | ✅ **Confirmed** |
| 5 | `<script async>` races its own CDN dependencies | ❌ **Refuted** |
| 6 | `.gitignore` contains `css/style.css` | ✅ **Confirmed** |
| 7 | `act: #` parses to `null` | ✅ **Confirmed** |
| 8 | `archive: /archives/v1` is absolute-rooted and extensionless | ✅ **Confirmed** |
| 9 | `archives/v2.html` points at the mutable current spec, titled "STM Constitution V1" | ✅ **Confirmed** |
| 10 | `specs/v1.yaml` declares `info.version: 2.0.0` | ✅ **Confirmed** |
| 11 | `specs/opencon.yaml` is a near-duplicate of `v1.yaml` | ✅ **Confirmed** |
| 12 | Montserrat `format("ttf")` invalid; Cuprum `.woff` declared `format("woff2")` | ✅ **Confirmed** |
| 13 | `.vertical-nav { display: none }` below 768px | ✅ **Confirmed** |
| 14 | Three-way naming disagreement: doc / YAML / JS | ✅ **Confirmed** |

**10 confirmed · 3 refuted · 1 partially confirmed.**

The three refuted claims are all in the audit's Part 1, "Why it is broken right now". **The site is not
crashing.** It renders all 18 articles today. The governance findings (Part 3) — which are the
serious ones — are confirmed in full and are unaffected.

---

## ❌ 1 — The renderer does not throw, and nothing is killed

**Claim:** article 11 has no `content:` key; `marked.parse(undefined)` throws; articles 11–18, the
amendments table, the back-to-top button, theme restore and all nav interactivity never render.

**Refuted on every element.**

The key exists. [specs/v2.yaml:203-206](specs/v2.yaml#L203-L206) is `content: |` followed by a blank
line, which YAML resolves to an **empty string**, not `undefined`:

```
title        : "Units"
has key      : true
typeof       : string
value        : ""
```

`marked` throws only on `undefined`/`null`. On `""` it returns `""`:

```
undefined                -> THREW: marked(): input parameter is undefined or null
empty string             -> OK, returned ""
actual v2 art-11 value   -> OK, returned ""
```

Rendering the real page in jsdom, the whole chain completes with **zero errors**:

```
articles rendered (h2.heading-secondary): 18 / 18 expected
sections rendered (h3)                 : 22
amendments table present               : true
amendment rows                         : 2
back-to-top button present             : true
nav links built                        : 42
theme toggle present                   : true
first: 1. Name of the Organization   last: 18. Suspension/Termination
ERRORS CAPTURED DURING RUN: (none)
```

**The real defect at this location is different, and still serious.** Article 11 renders as a
heading with an empty body:

```
heading       : 11. Units
paragraph HTML: ""
-> renders as : SILENTLY EMPTY (no text, no error)
```

A published constitution article with no text, displayed with no warning, for two years. That is a
content-integrity failure rather than a crash — and it is exactly what Phase 2 validation must catch.

**The latent hazard the audit describes is real, just not triggered here.** An absent `content:` key,
or `content:` with no value (which YAML resolves to `null`), *would* throw and *would* abort the
chain, because the throw happens inside `.then()`. The v2 spec sits one keystroke away from the
failure described. Validation must reject empty, null and missing alike.

## ⚠️ 2 — Unversioned: yes. Gone: no.

`https://cdn.jsdelivr.net/npm/marked/marked.min.js` returns **HTTP 200, 39,903 bytes**. It is not a
404 and it is not breaking the site.

What it serves is the interesting part:

```
/**
 * marked v15.0.12 - a markdown parser
 */
```

`marked@latest` is **18.0.9**. `marked.min.js` was dropped in the 16.x line, so jsDelivr resolves the
unversioned path back to the newest release that still contains that file — 15.0.12. The site works
today by way of undocumented CDN fallback behaviour, silently pinned to an end-of-life major three
versions behind, with no pin in the repo. The dependency risk stands; the outage does not.

Same for `js-yaml` — `cdnjs.../js-yaml/4.0.0/js-yaml.min.js` returns HTTP 200, and it is at least
version-pinned.

## ❌ 3 — The href round-trip bug does not exist

Two independent reasons, either sufficient.

**a. A chained assignment evaluates to the right-hand side**, not to a re-read of the property. The
getter is never consulted:

```
navArticleId = navLink.href = '#article1'
  value of navArticleId       : "#article1"
  value of reading .href back : "https://constitution.stmorg.in/#article1"
```

**b. `updateActiveMenu` uses `getAttribute('href')`**, which returns the literal content attribute
(`#article1`), never the resolved URL — so even a bad round-trip could not reach `querySelector`.

Live DOM, every nav link checked:

```
total nav links: 42 | unresolved: 0 | SyntaxErrors: 0
sample article href : "#article1"
sample section href : "#article6-section1"
```

Scroll-spy resolves all 42 targets. The audit's stated cause is wrong.

Note the sub-menu link at [js/opencodelaw.js:106](js/opencodelaw.js#L106) does rely on `navArticleId`
being an undeclared implicit global. It works only because the loop is synchronous — fragile, but
not the reported bug.

## ✅ 4 — Scroll handler throws before render

Confirmed and reproduced. [js/opencodelaw.js:461](js/opencodelaw.js#L461) registers the listener at
module scope; `#backToTop` is not created until the fetch resolves at
[line 379](js/opencodelaw.js#L379). Scrolling in that window:

```
scroll before render threw: Cannot read properties of null (reading 'style')
```

On a slow connection or a failed fetch this throws on every scroll event for the life of the page.
[Lines 477-482](js/opencodelaw.js#L477-L482) (`topFunction`, `topButton`) are unreachable dead code.

## ❌ 5 — `async` does not race here

The two CDN tags are parser-blocking classic scripts *preceding* the async tag. The parser cannot
prepare the `async` script until it has executed them, so `marked` and `jsyaml` are always defined
first. The preload scanner may fetch all three in parallel, but fetch order is not execution order.

Bad practice, and it should still go — but it is not a live defect and not non-deterministic.

## ✅ 6 — `.gitignore` ignores the only stylesheet

```
.gitignore:2:css/style.css	css/style.css
```

Confirmed via `git check-ignore --no-index`. The file survives only because it was committed before
the rule landed (`git ls-files` still lists it). Any clean regeneration drops the site's entire
stylesheet. The file also has no trailing newline.

## ✅ 7 — `act: #` is `null`

```
ammendments[0].act = null
```

`#` opens a YAML comment; the value is empty. The renderer assigns it straight to `href`
([line 348](js/opencodelaw.js#L348)), producing a link to a page named `null`.

## ✅ 8 — Archive links cannot resolve

```
ammendments[0].archive = "/archives/v1"
ammendments[1].archive = "/"
```

Absolute-rooted and extensionless — it depends on the Apache rewrite in [.htaccess](.htaccess), which
GitHub Pages does not read. The second amendment's archive is the bare site root, which is not an
archive at all.

## ✅ 9 — The archive is not an archive

[archives/v2.html](archives/v2.html) loads `../specs/v2.yaml` — the live, mutable current spec — and
is titled `STM Constitution V1`. Both confirmed. Editing the current constitution retroactively
rewrites the "archived" copy.

## ✅ 10 — v1 misdeclares its own version

[specs/v1.yaml:13](specs/v1.yaml#L13) is `version: 2.0.0`. Both v1 and v2 report `2.0.0`.

## ✅ 11 — `opencon.yaml` is a duplicate

Full diff against `v1.yaml` is 14 lines: `version` (`1.0.0` vs `2.0.0` — the dead file has the
*correct* value) and the absence of the `ammendments:` block. 17 articles vs v1's 17; v2 has 18.

## ✅ 12 — Neither webfont has ever loaded

[css/style.scss:5](css/style.scss#L5) — `format("ttf")` is not a valid format token; it must be
`truetype`. [Lines 12-14](css/style.scss#L12-L14) declare the same `.woff` file twice, first as
`format("woff2")`. Both faces fail to load; all typography is browser-default fallback.

## ✅ 13 — No navigation on mobile

[css/style.scss:295-298](css/style.scss#L295-L298) — `.vertical-nav { display: none }` under 768px.
An 18-article legal document with no table of contents on phones. Open issue #1.

## ✅ 14 — Three-way naming disagreement

| Source | Root key | Amendments key |
|---|---|---|
| [schema/opencodelaw.md:5,54](schema/opencodelaw.md#L5) | `OpenCodeLaw` | `amendments` |
| [specs/v2.yaml:1,286](specs/v2.yaml#L1) | `openconstitution` | `ammendments` |
| [js/opencodelaw.js:303](js/opencodelaw.js#L303) | — | `ammendments` |

Confirmed: `v2 root keys: [ 'openconstitution', 'info', 'preamble', 'articles', 'ammendments' ]`.
Anyone following the documented schema produces a file the renderer cannot read.

---

## Additional findings, not in the original audit

| # | Finding | Evidence |
|---|---|---|
| A | **Malformed colour, declaration silently dropped** | [css/style.scss:499](css/style.scss#L499) — `rgba(0,0,0.87)` has three arguments, not four. Invalid; the browser discards it. Wide-viewport row headers get no colour. |
| B | **Deep links confirmed dead on cold load** | No `hashchange` or load-time hash handling anywhere in the JS — `scrollIntoView` appears only in click handlers ([line 438](js/opencodelaw.js#L438)) and dead code ([line 478](js/opencodelaw.js#L478)). Content is injected after the browser has already resolved the hash. |
| C | **`#320063` verified as the logo colour** | Decoded [assets/img/OpenCodeLaw.png](assets/img/OpenCodeLaw.png) (500×500, RGBA): `#ffffff` 237,099 px, then **`#320063` 4,627 px** — the dominant brand hue by an order of magnitude. The promotion to primary accent is justified. |
| D | **`#533566` is not in the stylesheet** | It exists only at [js/opencodelaw.js:178](js/opencodelaw.js#L178) as an inline slider colour. Full SCSS palette is: `#007bff` ×12, `#333` ×7, `#fff` ×2, `#000` ×2, `#f5f5f5`, `#ccc`, `#c07534`, `#555`, plus `rgba(0,0,0,0.18 / .12 / .54)`. |
| E | **Local toolchain is below the target** | Node **18.19.1** installed, no `nvm`/`fnm`/`volta`. `marked@18` declares `engines: node >= 20`. See decision note below. |
| F | **The three Acts are text-extractable** | `pdftotext` cleanly extracts all three. Each header confirms assent **3rd May 2024** from the Internal Compliance Committee. Phase 3 will not need OCR. |

---

## What this changes about the rebuild

Nothing is removed from the plan; one thing is re-prioritised and one justification is corrected.

1. **The urgency is legal, not operational.** The site is not down. Phase 3 — publishing a
   constitution that reflects its own three enacted Amendment Acts — is the real emergency, and
   Article 11 has been publishing a blank provision for two years.
2. **Phase 2 validation is vindicated by a near miss, not a hit.** `content: ""` passes silently
   today and renders nothing. The validator must reject empty, `null` and missing content alike —
   the requirement stands, but as a defence against *silent blanks*, not just crashes.
3. **Phase 4's static build stops depending on CDN fallback luck**, which is the accurate reason to
   vendor and pin — not a 404 that never happened.
4. **Add to Phase 6:** fix the malformed `rgba(0,0,0.87)` when extracting tokens.
5. **Phases 1 and 6 are unchanged.** Every UI, accessibility, SEO and governance finding stands.

### Decision needed — Node version

The plan specifies Node 20+; this machine has 18.19.1 with no version manager. To keep
`npm run validate && npm test && npm run build` runnable locally **and** on CI, Phase 1 pins
dependencies that run on both (`marked@15.0.12`, `js-yaml@4.1.0`, `ajv@8.17.1`,
`sanitize-html@2.17.7`), declares `engines: >=18.18.0`, and sets the GitHub Actions runner to Node 20.
Say the word and I will target Node 20 exclusively instead — local verification would then need a
Node upgrade first.
