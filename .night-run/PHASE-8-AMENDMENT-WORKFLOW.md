# Phase 8 — improved amendment workflow (deferred, nothing built)

Requirements noted while applying Acts 1, 2 and 3. **Nothing here is implemented.** Recorded now
because this is when the gaps were visible; they will not be as obvious later.

## What applying three Acts actually cost

The engine records amendments well. It does not help you *make* one. Every step below was manual,
and each is a place a future amendment can go wrong quietly.

### 1. Structure cannot be inferred from a PDF

The single largest cost. Deriving article/section shape from the Act's layout failed in both
directions on the same heuristic: it read Article 9's sentences as section titles, collapsed Article
10's three clauses into one, and found none of Article 8's five. PDF indentation is not a structural
signal.

Resolved by declaring structure explicitly in `src/act-application.mjs` as line ranges, with
`verifyCoverage` asserting the slices reconstruct the span exactly. That works, but it is a
hand-authored file per Act.

**Requirement:** Acts should be authored in a machine-readable form — the same YAML schema, as a
patch — with the PDF as the signed rendering of it rather than the source of truth. An Act would
then declare `target`, `operation`, `scope` and its text directly, and applying it would need no
transcription at all.

### 2. Clause-scope edits are surgery

Act 1's Article 7 replaces sub-clause (a) *point 6* and sub-clause (b), inside a nested list whose
points (a)1–5 stay. That was declared by line range into the current text — which means the
declaration goes stale the moment the provision changes.

**Requirement:** clauses need addressable ids of their own (`art-7-c-6-a-6`), so an Act can target a
clause rather than a line. Today only articles and sections are addressable.

### 3. Nothing proposes, everything asserts

`apply-act.mjs` writes the change and verifies it after. There is no state where an amendment is
drafted, reviewed and approved before it lands.

**Requirement:** a proposed amendment should be a branch plus a rendered diff of the *provisions*,
not of the YAML — a reviewer should see "Article 13 becomes …", not a unified diff.

### 4. The approval chain is recorded, never enforced

`procedure` holds the bodies Article 16(3) requires, and it is prose. Nothing checks that an Act
with `complete: false` has not been applied — Acts 1–3 were applied with intermediate-board and unit
approval still unconfirmed, which was authorised, but the engine could not have stopped it.

**Requirement:** the validator should refuse to apply an Act whose `procedure.complete` is false
unless an explicit override is recorded, with who authorised it and when.

### 5. Section ids move when an Act restructures

Act 2 changed what six section anchors mean. That is correct — a section id names a position — but
nothing warned before it happened; it was noticed by reading the diff.

**Requirement:** the applier should detect and report anchor meaning changes as part of its
verification, the way it reports provisions changing outside the manifest.

### 6. Numbering gaps are discovered late

Inserting Article 20 created an unaccounted gap at 19, caught only when validation failed after the
write.

**Requirement:** the manifest should predict the post-application numbering and require a `reserved`
entry up front, before anything is written.

## What already works and should not be rebuilt

- `verifyCoverage` — proving declared slices reconstruct the Act span exactly.
- The expected-change manifest, and aborting on any provision changing outside it.
- The tripwire, re-baselined per Act rather than disabled.
- `sor-as-authority` — a Statement of Objects can never be cited as authority.
- Text comparison that folds enumerators and typography but strips tags first.
