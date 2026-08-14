# Reconciliation

**Status:** open — blocking questions only. No constitutional text has been changed.
**Branch:** `rebuild/v3` · **Raised:** 2026-08-14 · **Sign-off required from:** Pranay

Phase 3's provision-by-provision table (Act, operation, target id, before, after, source line,
sign-off box) is added **after** `PROVENANCE.md` is signed off. This file currently records only the
questions that must be answered before any text is applied.

Evidence cites `acts/text/*.txt`, the verbatim extraction committed in `ddbffb4`, by line number.
Short names used below: **A1** = first-constitution-amendment-act-2024.txt, **A2** = second…,
**A3** = third….

---

## Blocking — legal

These change what the constitution says. **Do not resolve without sign-off.**

### Q1 — Article 19 does not exist

Verified independently as instructed. A whitespace-normalised search over all three Acts finds every
article from 3 to 18, then 20 and 21. **No occurrence of "19" in any form, in any Act.**

| Cited | 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 · **—** · 20 21 |
|---|---|

Article 18 is inserted by A1:158, Article 20 by A2:97, Article 21 by A3:32. Nothing inserts 19.

Either a fourth instrument exists outside this repo, or Act 2 skipped a number. Article 19 has been
left **unallocated**, not invented and not closed by renumbering.

**Question:** does a fourth instrument exist? If not, confirm Article 19 is recorded as
`status: reserved` with a note stating no instrument ever occupied it.

### Q2 — Article 6, clause 6 (`Donor`)

A1:18 reads *"Amendment to Article 6, clause 1,2,3,4 and 5"* and supplies replacement text for
clauses (1)–(5) only. Clause 6 (`Donor`) is never mentioned. Separately, A1:38-39 amends Article 7
clause 4 to define *"STM DONOR"*.

Substituting 1–5 is not the same as omitting 6. The current spec still carries `Donor` as
`art-6-s-6`.

**Question:** does `Donor` survive in Article 6, or did Act 1 intend it to move wholly into
Article 7? Nothing in the Act settles this.

### Q3 — Act 2 contradicts itself on the amendment threshold

This is the most serious ambiguity found.

| Source | Line | Text |
|---|---|---|
| Operative provision | A2:75-76 | "All proposed amendments must be approved by a **2/3rd** present and voting of the board of the NGO, the intermediate board of the NGO and units of the NGO collectively." |
| Statement of Objects and Reasons | A2:121-123 | "Article 16, Clause (3) has been amended with a **3/4th** majority present and voting for bills to be enforced in time…" |

The Act sets two different thresholds for amending the constitution. Conventional construction
prefers the operative provision over the Statement of Objects and Reasons, which is explanatory and
not enacting — but this governs how every future amendment passes, and I will not decide it.

**Question:** is the enacted threshold 2/3rd or 3/4th?

### Q4 — Act 2 disagrees with itself on whether Article 15 is amended or inserted

A2:105 reads *"Amendment of Article 15 - Exit Process"*. The Statement of Objects at A2:131-132
reads *"Article 15 has been **inserted** to incorporate processes for both voluntary and involuntary
exit."*

Article 15 already exists in the spec as `Resignation`. The operation is therefore a substitution
that also retitles the article — but the Act's own summary calls it an insertion.

**Question:** confirm this is `substitute` on `art-15` with a retitle to `Exit Process`, and that
the existing `Resignation` sections (Eligibility, Application, Duration) are replaced rather than
retained alongside the new (1) Voluntary / (2) Involuntary structure.

### Q5 — Act 1 defines `Unit Board Member` and `Coordinator` with identical words

Not previously flagged. A1:26-31, verbatim:

> (3) **Unit Board Member**: Any person who is willing to serve society and abide by the rules and
> regulations of the NGO to work in STM **in their respective unit within their academic life**.
> (4) **Coordinator**: Any person who is willing to serve society and abide by the rules and
> regulations of the NGO to work in the STM **in their respective unit within their academic life**.

The two roles receive the same operative definition, differing only by "in STM" / "in the STM". The
spec they replace distinguishes them clearly — its Coordinator is defined by recruitment ("after the
successfull interview"), not by tenure.

This reads as a drafting error in the Act itself, not an extraction artefact: the layout-preserving
extraction matches the PDF. Applying it verbatim would leave two roles legally indistinguishable.

**Question:** apply verbatim as enacted, or treat as an error requiring a corrigendum?

### Q6 — Does an "Amendment to Article N" replace the whole article or only its listed clauses?

A1:55 (*"Amendment to Article 9"*) and A1:76 (*"Amendment to Article 10"*) give no clause
restriction, unlike A1:18 and A1:35 which name clauses explicitly. Both then set out a complete
replacement article.

For Article 10 the Act supplies only (1) Eligibility, (2) Selection Process, (3) Roles and
Responsibilities. The current spec additionally carries an article-level introduction ("The IBM are
the members who are selected by the board…"). A full substitution deletes that introduction; a
clause-wise amendment keeps it.

**Question:** confirm that an unqualified "Amendment to Article N" is a **full substitution** of the
article, including deletion of any text the Act does not restate. This convention decides several
provisions at once, so it is worth settling explicitly.

### Q7 — Terminology drift

| Act says | Spec says | Evidence |
|---|---|---|
| `Unit Board Member` | `College Unit Board Member` | A1:26 |
| `Units` (Art. 11) | `Units` — already renamed from v1's `College Units` | A1:123 |
| `Alumni` (Art. 12) | `Alumini` | A1:155 |
| `Annual Report` (Art. 13) | `Anual Reports` | A3:20 |
| `Amendments` (Art. 16) | `Ammendments` | A2:74 |
| `Leaves` (Art. 14) | `Sabbatical Leave` | A2:90 |

Confirmed as the Acts' operative words, not extraction artefacts — the layout-preserving extraction
reproduces the PDF text exactly.

**Question:** the `Alumini`/`Anual Reports`/`Ammendments` corrections are already authorised as
spelling fixes. Confirm `College Unit Board Member` → `Unit Board Member` and `Sabbatical Leave` →
`Leaves` are **substantive retitles enacted by the Acts**, not spelling fixes.

---

## Blocking — record integrity

### Q8 — The amendment table names a different author than the Act

The register dropped from the spec during migration recorded:

```yaml
- title: First Constitution Amendment Act, 2024
  date: 2024-05-02T21:25:00+05:30
  author: M. Revanth Reddy
```

Every one of the three PDFs is signed **"P. Priya, Internal Compliance Coordinator of the STM"**
(A1:205-206, A2:137-138, A3:61-62), and each records assent from the Internal Compliance Committee.

**Question:** who is recorded as `author` for Act 1 — the drafter (M. Revanth Reddy) or the
signatory (P. Priya)? The schema has both `author` and `assented_by`; confirm which name goes where.

### Q9 — The amendment table dates Act 1 a day before its assent

The dropped register dates the First Act `2024-05-02T21:25:00+05:30`. All three PDFs state assent on
**3rd May 2024** (A1:5-6, A2:5-6, A3:5-6).

**Question:** confirm `assent_date: 2024-05-03` for all three Acts, and that 2024-05-02 was a
drafting or commit timestamp rather than a legal date.

### Q10 — "Establishing the Constitution" has no instrument

The dropped register's first entry has `act: null` (the `act: #` YAML bug) and
`author: Pranay Kiran`, dated 2023-10-08.

**Question:** should the register record the original adoption as a non-Act event, or only list
enacting instruments? Recording it preserves the v1 adoption date, which exists nowhere else.

---

## Blocking — editorial (changes what a reader sees)

### Q11 — Article 11 `Units` has no article body

`art-11.content` is an empty string. This is the defect that published a blank provision for two
years, and the new validator now rejects it as a hard error — the build cannot ship until this is
answered.

What each source holds:

| Source | Article-level body | Sections |
|---|---|---|
| v1.0.0 (`College Units`) | Full text: "The college units are the units of the NGO… 1. Head … 8. Graphics Department Head" | Establishment, **Funds**, **Roles and Responsibilities** |
| v2.0.0 / current (`Units`) | **empty** | `units`, Establishment |
| Act 1 (A1:121-151) | `11. Units` then (1)(a)–(d), (2) Establishment | — |

Note that v2 also silently dropped v1's `Funds` and `Roles and Responsibilities` sections. Their
absence is consistent with Act 1, which does not restate them, but no record of the deletion exists.

Options — **choose one, I have not picked:**

- **(a)** Apply Act 1's Article 11 text at article level, keeping `(1)` and `(2)` as the two
  sections. Follows the Act's own structure. Consequence: the current `units` section becomes the
  article body and the section list changes shape.
- **(b)** Promote the existing `units` section text to the article body and drop that section.
  Minimal change, no new text, but not the Act's structure.
- **(c)** Leave the body empty and record it explicitly. Requires a schema addition, since
  `reserved` and `omitted` both carry legal meanings that do not fit "text was never recorded".
  Archived pages would render the "[No text was recorded for this provision]" marker.

Option (c) is the only one that keeps the archived v2.0.0 faithful to what was actually published.
Options (a) and (b) are about what `current.yaml` should say going forward. **These may need
different answers for the archive and for the live document.**

### Q12 — `renumber` has no defined effect on citation identity

Design question, not a legal one, but it must be settled before the schema is used by anyone else.

The validator enforces `id === "art-" + number`, which is what makes reordering the YAML provably
safe. But the Act operation enum includes `renumber`. If an Act ever renumbers Article 20 to 19,
either the id follows the number — breaking every citation ever made to `art-20` — or it stays fixed
and the id/number coupling breaks.

No Act among the three performs a renumber (all are `substitute` or `insert`), so nothing is blocked
today.

**Question:** on renumber, does the id stay permanent (and the coupling rule gain an exception) or
follow the number? A statute book would keep the citation and record the move.

---

## Non-blocking — metadata applied in Phase 2

Applied during the structural migration. Flagged for confirmation; none touches provision text.

| Field | Value | Source | Confirm |
|---|---|---|---|
| `info.organization` | Service to Mankind Welfare Association | All three Acts: *"Further to amend the Constitution of Service to Mankind Welfare Association"* | ☐ |
| `info.jurisdiction` | Telangana, India | Inferred from the preamble's "Telangana Societies Registration Act., 2001" and the registered address | ☐ |
| `info.registration` | **omitted** | Unknown. Registration number under the 2001 Act appears nowhere in the repo | ☐ |
| `info.effective_from` (v1.0.0) | 2023-10-08 | Preamble `adopted` date | ☐ |
| `info.effective_from` (v2.0.0, current) | 2024-05-02 | Latest dated entry in v2's own amendment table. **See Q9** — likely should be 2024-05-03 | ☐ |
| `info.version` (v1.0.0) | 1.0.0 | Corrected from the file's own incorrect `2.0.0` | ☐ |
| `info.termsOfService` | **removed** | Was `https://example.com/terms` | ☐ |
| `info.contact.url` | **removed** | Was `https://example.com/contact` | ☐ |

The two removed placeholder URLs can be restored with real values at any time; the validator rejects
any `example.com` URL in `info`.

---

## Sign-off

No text may be applied until every **blocking** question above is answered.

- [ ] Q1 Article 19 gap
- [ ] Q2 Article 6 clause 6 (Donor)
- [ ] Q3 Amendment threshold — 2/3rd or 3/4th
- [ ] Q4 Article 15 amend vs insert
- [ ] Q5 Unit Board Member / Coordinator identical definitions
- [ ] Q6 Full-substitution convention
- [ ] Q7 Substantive retitles
- [ ] Q8 Act author vs signatory
- [ ] Q9 Assent date
- [ ] Q10 Original adoption record
- [ ] Q11 Article 11 empty body
- [ ] Q12 Renumber and citation identity
