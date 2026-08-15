# Night run — morning report

## 1. It is live

**https://servicetomankind.github.io/OpenCodeLaw/**

**The custom domain was not touched.** `constitution.stmorg.in` still serves the old site.
Verified three ways: Pages API reports `cname: null`; `/OpenCodeLaw/CNAME` returns 404; and CI
fails the build if a CNAME appears in the artifact without `include_cname: true`.

Worth knowing: Pages was **not enabled at all** on this repo before tonight (`has_pages: false`),
so the old site is hosted elsewhere and enabling Pages could not have disturbed it.

Two settings changes, both inside what you authorised: Pages enabled with **Source: GitHub Actions**,
and `rebuild/v3` added to the `github-pages` environment branch policy, which was `main`-only and
was silently failing the deploy job.

## 2. Screenshots — `.night-run/screenshots/`

`home-{375,768,1440}-{light,dark}.png` · `article-1440-{light,dark}.png` ·
`amendments-1440-{light,dark}.png` · `archive-superseded-1440-light.png` · `print-preview.pdf`

## 3. Phases

| Phase | State |
|---|---|
| 4 — Build and deploy | **Complete**, deployed |
| 5 — SEO | **Complete** |
| 6 — UI | **Complete** |
| 7 — Reusability | **Complete** |

48 of 50 queue items done. 10 commits.

## 4. Gates

| Gate | Result |
|---|---|
| 4 — build clean, zero internal 404s, no-JS text, PDFs reachable, live | **PASS** — 24 pages, 1807 links, 150 anchors, 0 dead |
| 5 — title/description/canonical/OG/JSON-LD in raw HTML, sitemap resolves | **PASS** — SEO 100 |
| 6 — Lighthouse a11y ≥95 and perf ≥90, keyboard walkthrough, screenshots, no console errors | **PASS, exceeded** |
| 7 — starter builds from clean checkout, SPEC.md idempotent | **PASS** |

**Lighthouse on the live site — 100 / 100 / 100 / 100 on both mobile and desktop**
(performance, accessibility, best practices, SEO). Accessibility is 100 in all four
combinations of desktop/mobile × light/dark.

**Keyboard walkthrough: 10/10** — skip link, theme toggle as a real `aria-pressed` button,
⌘K search with focus return, the mobile sheet trapping focus through a full 25-tab lap and
returning it on Escape, copy-link's polite live region, one `<main>`/one `<h1>` per page type,
a cold load of `#art-11-s-2` landing clear of the sticky header, `#article5` rewriting itself
to `#art-5`, and zero console errors across six page types.

Issues **#1, #4, #7, #25, #26** are addressed and covered by tests.

## 5. Nothing is blocked — but one thing deviated

**L2 (restore Article 11's body) was not done as written, and should not be.**

The instruction assumed Act 1 supplies article-level text for Article 11 that someone
misfiled into a subsection. It does not. Act 1's Article 11 is exactly two clauses, and:

- clause (1) is a **100.0% match** to the existing `art-11-s-1` (103 tokens against 103)
- clause (2) is a **98.6% match** to `art-11-s-2`
- together **99.4%** of the enacted text is already there

Act 1 runs its heading straight into clause (1) and supplies no article-level body at all.
Writing clause (1) at article level would have duplicated section 1 verbatim; removing that
section would have meant renumbering, which breaks the `art-11-s-2` citation and is forbidden.

So instead I removed the empty `content: ""` key, making Article 11 a section-only article —
the shape Act 1 actually enacts. **No provision text was added, removed or altered.** The
archived v2.0.0 keeps its empty body and renders the explicit marker.

That leaves Q11 partly open: the archive question is settled, the live-document question is now
"is section-only the right shape?" rather than "what text goes at article level?".

## 6. Provision tripwire: green all night

Baseline of 82 provision strings taken at the first commit and re-verified before **every**
commit. The only change all night is `art-11.content`, which was the one permitted entry.
Articles 6 and 7 were asserted untouched before `amended_by` was written.

`npm run validate` **passes**: 0 errors, 3 warnings (Article 11's blank body in the archive,
and v2.0.0 having no `superseded_by` — both in files I was not to edit).

## 7. Decisions waiting on you

**Q2 first — it blocks Articles 6 and 7, and therefore the rest of Act 1.** Article 6 is 100%
its pre-Act text. Act 1 substitutes clauses (1)–(5) and is silent on clause (6), `Donor`. Both
options are stated neutrally in `RECONCILIATION.md`.

Then: **Q14** (Article 10's deleted paragraph — a ratification item, decided and applied),
**Q1** (does a fourth instrument exist, or is Article 19 permanently reserved), **Q4, Q7, Q10,
Q12, Q13**.

The site says all of this out loud. The reconciliation banner on every page names Articles 6
and 7 as held under Q2, and Acts 2 and 3 as unapplied — generated from `reconciliation_state`,
never hardcoded, with a test asserting it names every blocker the YAML lists.

`current.yaml` is versioned **3.0.0-alpha.1**, not 3.0.0. It is one Act partially applied out
of three and the version says so.

## 8. Found, not acted on

- **`node --test tests/` fails on Node 22** and passes on Node 20 — it resolves a bare directory
  as a module. The matrix caught it before the deploy job. Fixed, but worth knowing the two
  runtimes differ in ways that will bite again.
- **Article 10's retained paragraph had been hand-edited** to Act 1's coordinator naming by an
  unrecorded actor. That is now in `provenance` on `art-10`. Someone was maintaining this
  document outside the amendment process as recently as v2.
- **`sanitize-html` is two patches behind on purpose.** 2.17.6+ needs an ESM-only `htmlparser2`
  that cannot load on Node 18. Gated on the Node 22 floor move, recorded in the README.
- **`puppeteer-core` had to be pinned to 25.7.0**, not 23.x — the older line pulls a vulnerable
  `extract-zip` through a browser downloader this project never uses. It is a devDependency and
  `npm audit` reports 0 vulnerabilities.
- **Slugs come from titles**, so retitling an article changes its page URL. The `#art-N` anchor
  is the stable citation and never moves. If you want URL stability across retitles too, that is
  a small change and worth deciding before this is shared widely.
- The generated-asset review flagged, and I fixed, a fourth hue (green) that had crept into the
  status pills, a `--accent-ink` token that meant opposite things in two files, and a print
  stylesheet that neutralised six token names nothing defined while leaving the live ones
  colouring paper.

Detail in `LOG.md`. Queue state in `QUEUE.md`.
