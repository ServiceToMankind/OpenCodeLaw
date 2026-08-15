# Contributing

Thanks for helping. This project renders a real organization's governing document,
so a few rules are stricter than you might expect.

## Setup

```bash
npm ci
npm run validate && npm test && npm run build && npm run linkcheck
```

Node 20 or 22. There is no SCSS step and no editor extension to install — the
previous instructions asked contributors to hand-compile SCSS in a VS Code plugin,
which is not a build system.

```bash
npm run dev          # build, then serve dist/ locally
npm run validate     # schema + citation integrity + act cross-references
npm run linkcheck    # internal 404s and base-path escapes
npm run spec         # regenerate schema/SPEC.md after changing the schema
npm run provenance   # regenerate PROVENANCE.md
```

## The one rule about content

**Do not edit provision text unless an enacted instrument authorises it.**

`constitution/`, `acts/` and `schema/` hold the law and the contract that describes
it. Changes there are reviewed as legal changes, not code changes:

- Every provision change cites the Act that authorises it, by file and line.
- A Statement of Objects and Reasons is evidence of intent and **never** the
  authority for an operation. The validator enforces this (`sor-as-authority`).
- Anything under `constitution/versions/` is append-never, edit-never. An archive
  that changes is not an archive.
- Article `id` and `number` are permanent public API. Never renumber to close a gap;
  record a `reserved` entry instead.
- If a change to the law is not mechanical, stop and open an issue. Ambiguity in an
  instrument is a question for the board, not a judgement call in a pull request.

Engine changes — `src/`, `tests/`, styles, scripts, docs — are ordinary contributions.

## Where things live

```
src/          engine: build, validate, link check, text comparison
schema/       the JSON Schema and its generated reference
constitution/ current.yaml plus frozen versions/
acts/         signed PDFs, extracted text, and the amendment register
tests/        run against both the source and the built output
```

## Standards

- **Every fix gets a test.** Preferably one that fails first. The suite exists
  because real bugs shipped: a `<br>` that corrupted text comparison, a PDF form
  feed that silently dropped a clause, article pages linking to anchors that were
  not there.
- Server-render everything. The page must be complete and readable with JavaScript
  disabled; scripts only enhance.
- All internal URLs go through the base-path helper. A root-relative link that works
  locally will 404 on project Pages, and `npm run linkcheck` will fail you.
- Markdown output is sanitised against a strict allowlist. Do not widen it to admit
  SVG or animation elements.
- Keep the palette. Tokens live in `src/styles/tokens.css`; no new hues.
- Accessibility is not optional: landmarks, visible focus, full keyboard operation,
  4.5:1 contrast in both themes, `prefers-reduced-motion` honoured.

## Pull requests

- Branch from `main`. Reference the issue number.
- Say what you verified and how. "Tests pass" is not a description of a test.
- CI must be green: validate, test, build and link check all gate the deploy.
- If you disagree with something here and have evidence, say so in the PR — several
  findings in [AUDIT-CONFIRMED.md](AUDIT-CONFIRMED.md) were corrections to a previous
  audit that turned out to be wrong.
