# Reconciliation

**Status:** open. No constitutional text has been changed.
**Answered:** Q3, Q5, Q6, Q8, Q9, Q11 — decided 2026-08-15, recorded below and carried into Phase 3.
**Open:** Q1, Q2, Q4, Q7, Q10, Q12, Q13, Q14.
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

> **ANSWERED — 2/3rd governs. A Statement of Objects and Reasons is not enacted text and aids construction only where the operative provision is ambiguous; here it is not ambiguous, merely inconsistent with the note. The discrepancy is recorded on Act 2 as `drafting_discrepancy` with both figures and both source lines, never normalised away. Q3 stays listed for board ratification: the legal answer is settled, the political one is the board's, and this provision governs how every future amendment passes.**

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

> **ANSWERED — Publish the defect; do not repair it. The engine records the law, it does not correct the law. Act 1 applies verbatim, both definitions stand as enacted, and an `editorial_note` on `art-6-s-3` and `art-6-s-4` points at the defect and at this entry. The note renders visibly. Escalated to the board as a candidate for a corrigendum or a Fourth Amendment Act.**

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

> **ANSWERED — Read what the Act sets out, not what it calls itself. Where the Act restates the article's own heading and then a complete clause run, it substitutes the whole article; where the heading names clauses and only those are set out, it amends only those. This is the drafter's own convention, matching standard Indian amending practice. Encoded as `scope: article | clause` on each register entry, with `clauses` required whenever scope is `clause`. Applied mechanically, it yields: clause scope for arts. 6, 7, 16, 17; article scope for arts. 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15 and the preamble.**

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

> **ANSWERED — The table is unverified; split the field. `signed_by: P. Priya, Internal Compliance Coordinator` and `assented_by: Internal Compliance Committee` are both evidenced on the face of all three Acts. `moved_by` is left unset. `M. Revanth Reddy` is preserved as `unverified_attribution` — not deleted, not promoted. Confirmed independently: the string `Revanth` appears nowhere in any of the three instruments.**

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

> **ANSWERED — Model both; they are not in conflict. `assent_date: 2024-05-03` is evidenced on all three Acts. The table's 2024-05-02 is most likely the date of passage, a distinct event, and is recorded as `passed_date` marked unverified. One field cannot hold two events.**

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

> **ANSWERED — Determined by the Act. Act 1 sets Article 11's text out at article level under the heading `11. Units`; whoever applied it placed that text in a subsection named `units` and left the article body empty. A transcription error, not an editorial choice. `current.yaml` restores the text to article level per Act 1. `versions/v2.0.0.yaml` keeps the empty body and gains a `publication_defect` note — an archive that silently fixes what was published is not an archive.**

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

### Q13 — Procedural validity of all three Acts

Raised by the board, recorded here rather than resolved.

Article 16(3) as it stood on 3 May 2024 required proposed amendments to be approved by the board,
the intermediate board, and all college units. All three Acts record assent from the **Internal
Compliance Committee** and a signature from the Internal Compliance Coordinator. None records on its
face that the Article 16 procedure was followed.

That may simply be because the instrument records only the final attesting step, with the approvals
living in minutes. Note the circularity: **Act 2 amends Article 16(3) itself**, so it had to pass
under the unamended procedure.

Nothing here asserts the Acts are invalid; that is not a question this project can answer. The act
register schema now carries a `procedure` block — `required_by`, an explicit list of approving
bodies, `attested_by`, `assent_date` — which Phase 3 populates with the bodies named and the
approvals left empty. An explicit empty chain of authority is visible and gives the board somewhere
to file the minutes; a missing field is neither.

**Question:** were the Article 16(3) approvals obtained, and do minutes exist?

### Q14 — Article 10 retains a paragraph no instrument enacts (DIVERGENT)

**New, found by the provenance analysis. This is the only DIVERGENT verdict in the corpus.**

Article 10 splits cleanly in two, and the halves disagree:

| Part | Matches Act 1 | Matches pre-Act v1 text |
|---|---|---|
| The three sections (Eligibility, Selection Process, Roles and Responsibilities) | **100.0%** — 318 tokens against 318 | 36.7% |
| The article body (the "The IBM are the members…" paragraph, 64 tokens) | 25.0% | 89.7% |

So Act 1 was applied to Article 10's sections **exactly**, while the pre-Act article-level
introduction was kept. Under Q6 a full substitution deletes it.

The retained paragraph was also hand-edited to match Act 1's naming without any instrument doing so:

```
- 1. HR & Internshipment Controller Coordinator     + 1. Human Resources Coordinator
- 2. Finance Controller Coordinator                 + 2. Finance Coordinator
- 8. Content Coordinator                            + 8. Documentation Coordinator
- 9. Volunteer Coordinator                          (removed)
```

The removal of Volunteer Coordinator *is* authorised — Act 1's Statement of Objects, item 4, records
that "the position of volunteer coordinator has been removed to optimise operational efficiency".
The three renames are not mentioned by any instrument.

Not resolved, per the standing instruction on DIVERGENT verdicts. The obvious remedy under Q6 is to
delete the paragraph as superseded, but that deletes text a reader has seen published for two years,
and the renames show someone was maintaining it deliberately.

**Question:** delete the paragraph as Q6 requires, or retain it and record it with `provenance` as
text applied outside the amendment process?


---

## Sign-off

No text may be applied until every **blocking** question above is answered.

- [x] Q3 Amendment threshold — **2/3rd governs**, discrepancy recorded, board ratification still wanted
- [x] Q5 Unit Board Member / Coordinator identical definitions — **publish the defect**
- [x] Q6 Full-substitution convention — **read the body, not the heading**
- [x] Q8 Act author vs signatory — **split the field**, Revanth preserved as unverified
- [x] Q9 Assent date — **2024-05-03 assent, 2024-05-02 recorded as passed_date**
- [x] Q11 Article 11 empty body — **restore in current, keep the defect in the archive**

Open:

- [ ] Q1 Article 19 gap — does a fourth instrument exist?
- [ ] Q2 Article 6 clause 6 (Donor)
- [ ] Q4 Article 15 amend vs insert
- [ ] Q7 Substantive retitles
- [ ] Q10 Original adoption record
- [ ] Q12 Renumber and citation identity
- [ ] Q13 Procedural validity of all three Acts
- [ ] Q14 Article 10 retains an unenacted paragraph (**DIVERGENT**)
