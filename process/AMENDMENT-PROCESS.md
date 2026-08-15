# The Amendment Process

How a change to the constitution of Service to Mankind Welfare Association is proposed,
approved, enacted, and applied to the published text.

**Authority:** Article 16, as in force at constitution version 3.0.0.
**The machine contract:** [`schema/opencodelaw-bill-1.0.schema.json`](../schema/opencodelaw-bill-1.0.schema.json).
**If you are writing one:** [`bills/TEMPLATE.yaml`](../bills/TEMPLATE.yaml) and the author's guide,
[`PROPOSING.md`](PROPOSING.md).

A few words used throughout: the **ICC** is the Internal Compliance Committee, and the **ICC
Coordinator** is its officer; the **IBM** is the intermediate board; a **bill** is a proposed
amendment before it is enacted, an **Act** is the same instrument after enactment; an **operation**
is one change to one provision; **evidence** is a pointer to the underlying record, normally a
minutes reference.

---

## 1. What this is, and why it works this way

A proposed amendment is written as a **bill**: a single YAML file in this repository, which states
in full what each affected provision will say once the amendment is made. **That file is the source
of truth, and the signed PDF is a rendering of it** — not the other way round. Because each
operation carries the complete resulting text of its target rather than an instruction like *"insert
after the words…"*, applying an Act is a comparison rather than a transcription: applying the same
Act twice changes nothing the second time, and an Act whose target no longer reads as expected
refuses to apply instead of corrupting it.

This exists because the alternative was tried. The three Acts of 2024 were authored as prose PDFs
and applied to the document by hand, which left Act 1 applied to Articles 9 to 12 and 18 but never
to Articles 6 and 7; left no record of who applied any of it, or when; produced a splice into
Article 7 that made re-running the Act unsafe; and raised fourteen reconciliation questions, several
of which could only be settled by the board two years after the fact. An amendment written as a bill
is machine-applicable from the moment it is drafted, so none of those failures has anywhere to
occur.

---

## 2. Roles

**Author (mover).** The constitution says who approves an amendment and who enacts it. It says
nothing about who may propose one. In that silence the default is the wide one: **any member may
author a bill.** The author's name goes in `moved_by` when the file is created — before the bill has
a number, before it goes to anyone. That single field permanently closes a whole class of problem:
the movers of the 2024 Acts had to be reconstructed after the fact, and never were. All three
instruments are signed by the ICC Coordinator and record no proposer at all, and the one name a
dropped register offered could not be found anywhere in the three Acts.

**The ICC — registry and clerk.** The ICC receives bills, assigns their numbers, verifies drafting
with the validator, schedules the approval meetings of **all three** bodies, records each body's
tally and its evidence, and attests the enacted Act.

> **The ICC checks form, not substance, and its attestation never substitutes for a body's
> approval.**

That sentence is the precise gap in the 2024 Acts. Each of them records assent from the ICC and a
signature from the ICC Coordinator — and nothing else. No approval by the board, the intermediate
board or the units appears on the face of any of them, which is what Q13 of
[`RECONCILIATION.md`](../RECONCILIATION.md) records. In this workflow the ICC's attestation is
recorded under `enactment` and is never written into `approvals`; the two are separate fields
because they are separate acts by separate bodies.

**The board, the intermediate board, and the units.** The three approval bodies named by Article
16(3). Each votes separately, and each vote is recorded separately.

**The board, again — enactment.** Under Article 16(1), changes to the constitution are made by the
board. Once 16(3) is satisfied, it is the board that enacts.

**The ICC Coordinator.** Signs the rendered Act, continuing the precedent of P. Priya's signature on
all three 2024 Acts. The signature is recorded in `enactment.signed_by`, and the signed scan is
archived with its SHA-256 checksum so the filed instrument can be proved to be the one that was
enacted.

---

## 3. Lifecycle

```
draft → submitted → under-review → (returned ⇄ under-review) → scheduled → approved → enacted → applied
                                                                         ↘ rejected
```

Plus **withdrawn** (the author's, any time before approval) and **lapsed** (the board's, set by
hand).

- **draft** — the author's file. No number yet. Validate it as often as you like; validation prints
  the before-and-after of every operation, which is what the approval meetings will read.
- **submitted** — the author has put it before the ICC, which numbers it.
- **under-review** — the ICC checks drafting: every target resolves, `base_version` matches the
  constitution as it stands, every operation carries complete text, nothing draws authority from the
  Statement of Objects and Reasons.
- **returned** — sent back with reasons. The author revises and it returns to review. This loop may
  run as many times as it needs to.
- **scheduled** — meetings of all three bodies are set.
- **approved** / **rejected** — the outcome of those three votes, recorded body by body.
- **enacted** — the board enacts; the Act is numbered, assent is recorded, and the PDF is rendered
  from the bill, signed, and archived with its checksum.
- **applied** — the Act is applied mechanically to `constitution/current.yaml`, and the version
  bumps.
- **withdrawn** — the author's, at any point before approval.
- **lapsed** — the board's, and set by hand. **No timeout is invented**, because the constitution
  states none.

**Every transition writes a dated entry to the bill's `history`:** date, from, to, actor, and
evidence. That is the record of who moved this bill, when, and on what basis. A transition with no
history entry did not happen.

---

## 4. Numbering

- **Bills are numbered by the ICC at submission, per year** — "Bill 1 of 2026". Numbering restarts
  each year.
- **Acts are numbered at enactment, per year** — "Act 1 of 2026".
- **A draft carries no number.** An unnumbered draft is not yet before anyone, and the validator
  rejects a numbered draft for that reason.
- A bill's number and its Act number are different numbers for different events. They need not
  match, and usually will not.

---

## 5. Thresholds — Article 16(3)

Article 16, as in force, reads:

> 1. Any changes to the constitution of the NGO should be done by the board of the NGO.
> 2. The ammenments should be done according to the by-laws of the NGO.
> 3. All proposed amendments must be approved by a 2/3rd present and voting of the board of the NGO,
>    the intermediate board of the NGO and units of the NGO collectively.

*(Clause 2's spelling is as enacted. It is not corrected here.)*

**This is settled constitutional policy, not a configurable default.** No bill may be enacted on
fewer than three bodies' recorded approvals, under any circumstances. The approval path cannot be
simplified at the process level: any checklist, tool, or shortcut that would let a bill through on
less than Article 16(3) is invalid on its face, whatever convenience it offers. An approval recorded
without a minutes reference is an assertion rather than an approval, and does not count.

**The two readings of "collectively."** The word genuinely bears two meanings, and the Act does not
choose between them:

- **Pooled** — all three bodies sit together and two thirds of the combined vote carries it.
- **Per body** — two thirds within each of the three bodies separately.

**Until the board adopts a reading by resolution, the stricter reading governs:** at least two thirds
of those present and voting in **each** body, separately. **Both tallies are recorded** — per body
and pooled — so that the record satisfies whichever reading is eventually adopted, and an Act
enacted today cannot be challenged tomorrow on the ground that the other reading was the right one.

**This choice is pending a board resolution.** When the board resolves it, the resolution is
recorded and this section is amended to match. Nobody should decide it in passing while clerking a
bill.

**Abstentions are excluded from the denominator.** The text says present *and voting*. If 12 members
are present, 8 vote for, 2 against and 2 abstain, the denominator is 10, not 12 — so 8/10 is 80% and
the body passes.

**A worked case where the readings differ.** Board 8 for / 4 against (66.7%, passes); intermediate
board 5 / 3 (62.5%, below); units 20 / 6 (76.9%, passes). Pooled: 33 of 46 = 71.7%, which passes.
Under the stricter reading the bill **cannot be enacted**, because the intermediate board did not
reach two thirds on its own. The tooling records both figures and refuses the enactment, naming the
body that fell short.

---

## 5a. The freeze point, and what an edit costs

**The ICC completes form review before any meeting is scheduled.** Circulation is the freeze: from
the moment a bill goes to the bodies, its text is what they are resolving on.

`bill ballot` renders resolution sheets only for a bill at `scheduled` or later, and says why if you
ask earlier — a sheet for a bill still under form review would carry a hash the ICC is about to
change.

> **Get the text right before you circulate.**

That sentence is the whole discipline, and it is a discipline because an edit is expensive. **A vote
binds to the bill's substantive hash, not its title.** Edit the bill after a body has resolved and
that resolution is void: the body must resolve again. This holds even where the bill's own
operations are untouched — a rebase onto a newer constitution moves the hash too, because approval
attaches to an amendment *in context*, not to isolated strings. A provision can become contradictory
purely because other articles moved, and whether a rebase is "semantically clean" is not something a
tool can adjudicate honestly.

There is no such thing as a typo fix to operative text that is beneath a body's notice. The
operative text of a bill *is* the constitutional text, enacted verbatim. This constitution already
carries a published defect that turns on one word — Article 6 defines `Unit Board Member` and
`Coordinator` identically, differing only by "in STM" and "in the STM".

Voided approvals are **not deleted**. They move to the bill's `history` as `approval-voided`
entries, carrying the body, the tallies, the evidence and the hash they were recorded against. A
body's vote is a legislative fact even after the text has moved on.

### If a defect surfaces mid-cycle

Two paths. Name which one you are taking, in writing.

**(a) Fix, void, re-collect.** The safe path, and the default whenever there is any doubt. A
**joint sitting** makes this one meeting rather than three — the bodies may sit together, and the
same signed record may serve all three. The tallies are still recorded per body: evidence can be
shared, arithmetic cannot.

**(b) Pass as approved, correct by corrigendum.** Only for a defect that does not touch meaning.
That judgment belongs to the ICC and the board and is never made by the tool. See §8.

### Sequencing

**The ICC does not schedule votes on a bill while another bill is ahead of it** — approved but
unapplied, or enacted and pending. Rebases should land before approvals begin, never between
meetings.

This is the cheap prevention for everything above. CI enforces the hard edge of it: two open bills
amending the same provision fail the gate, naming both, because whichever applies second would
overwrite or contradict the first.

## 6. What belongs to the by-laws — Article 16(2)

Article 16(2) sends the conduct of amendments to the by-laws. So the by-laws own **notice periods,
quorum, how a meeting is convened and chaired, how votes are taken, whether proxies or written
resolutions count, and whether units vote as units or as members.** None of that is in the
constitution.

This workflow therefore **records what happened and does not invent rules the constitution omits**:
for each body, the date, the number present, the votes for, against and abstaining, and the minutes
reference. It computes the Article 16(3) threshold from those numbers, and it does nothing else with
them. It will not fail a bill for want of a quorum it has no authority to define, and it will not
excuse one either — if a meeting fell short of a by-law requirement, that is a by-laws question, and
it belongs in the minutes the `evidence` field points to.

The same restraint is why **lapsed** is set by hand. A bill that has sat untouched for a year does
not expire on its own, because no provision says it does.

---

## 7. Versioning

- **Every applied Act bumps the MINOR version.** 3.0.0 → 3.1.0 → 3.2.0. One instrument, one version.
- **MAJOR is reserved for `type: revision`** — a full re-adoption, and the only kind of bill that may
  renumber provisions.
- **There are no PATCH releases of provision text.** A patch would mean the wording of a provision
  changed with no instrument behind it, and that is exactly what this system exists to prevent.
  Editorial edits to provision text remain forbidden; if the text is wrong, it takes a corrigendum
  (§8) or an amendment.

Fixes to the site, the engine, or the tooling are not versions of the constitution and never move
this number.

**Staleness and rebasing.** A bill records the `base_version` it was drafted against. If the
constitution moves on before the bill is approved, validation fails with a rebase instruction — so
an approval meeting always sees what it is actually voting on. A rebase after approval means the
bodies approved text against a base that no longer exists, so **a rebased bill goes back through
approval.** The applier refuses to apply an Act to text it was not approved against.

---

## 8. Corrigenda

A **corrigendum** (`type: corrigendum`) corrects a drafting error in an instrument already on the
record — a mistake in the drafting, not a change of mind about the policy.

- **It follows the same approval path as any other bill.** Three bodies, two thirds, minutes.
  Nothing about it is lighter. It is called a corrigendum to describe what it does, not to travel
  faster.
- **The validator constrains it to errors already on record** — the `drafting_discrepancy` entries in
  [`acts/register.yaml`](../acts/register.yaml) and the standing notes carried with the reconciliation
  record. A corrigendum aimed at a provision with no recorded defect is rejected, with the message
  that a substantive change needs an amendment bill.
- **Recording a defect comes first, and is not itself an amendment.** Writing down that an instrument
  is defective changes no provision text; it puts the defect where a corrigendum can reach it.

**The first expected use** is Article 6. Act 1 of 2024 defines *Unit Board Member* (clause 3) and
*Coordinator* (clause 4) in identical words, differing only by "in STM" and "in the STM", so as
enacted the two roles are legally indistinguishable. The defect was published rather than repaired,
which was the right call: the engine records the law, it does not correct the law. See Q5 in
[`RECONCILIATION.md`](../RECONCILIATION.md).

**This document does not draft that fix, and no one should read it as a task to do so.** Deciding
what those two definitions ought to say is an act of authorship, and it belongs to the board.

---

## 8a. A note on files

**Any command that writes a bill strips comments.** The tools read a bill into an object and write
the object back; comments are not in the object.

Comments belong in `bills/TEMPLATE.yaml`, as guidance to whoever is drafting. They do not belong in
a bill as record — anything that needs to be on the record goes in `objects_and_reasons`, an
operation's `note`, or the bill's `history`.

## 9. Reference

### Statuses

| Status | What it means | Whose file it is |
|---|---|---|
| `draft` | Being written. No number. | Author |
| `submitted` | Before the ICC; numbered on arrival. | ICC |
| `under-review` | Drafting being checked against the validator. | ICC |
| `returned` | Sent back to the author with reasons. | Author |
| `scheduled` | Meetings of all three bodies are set. | ICC |
| `approved` | All three bodies approved; ready to enact. | Board |
| `rejected` | Did not carry. Terminal — the lifecycle gives it no exit; a fresh bill starts at `draft`. | — |
| `enacted` | Numbered as an Act, assented, signed, archived. | ICC |
| `applied` | Written into `constitution/current.yaml`; version bumped. | ICC |
| `withdrawn` | Pulled by the author before approval. | Author |
| `lapsed` | Closed by the board, by hand. | Board |

### Who may move each transition

| Transition | Who moves it | What must be on record |
|---|---|---|
| `draft` → `submitted` | Author | Validates with no errors; ICC assigns the bill number |
| `submitted` → `under-review` | ICC | — |
| `under-review` → `returned` | ICC | The reasons, in the history note |
| `returned` → `under-review` | Author | The revised bill, validating |
| `under-review` → `scheduled` | ICC | Meeting dates for all three bodies |
| `scheduled` → `approved` | ICC records the result | Three tallies and three minutes references, each at or above two thirds |
| `scheduled` → `rejected` | ICC records the result | The tallies that fell short, with minutes |
| `approved` → `enacted` | **Board** enacts under 16(1); ICC attests, the ICC Coordinator signs | Act number, assent date, signed PDF and its SHA-256 |
| `enacted` → `applied` | ICC | The applier's outcome per operation, the new version, and confirmation that nothing outside the bill's operations moved |
| any status before `approved` → `withdrawn` | Author | A note giving the reason |
| any status before `enacted` → `lapsed` | Board | The board's decision. Set by hand; no timeout exists |

### The rules that cannot be traded away

1. Three bodies approve, or the bill is not enacted. There is no exception and no shortcut.
2. Two thirds of those present and voting in **each** body, until the board resolves what
   "collectively" means.
3. An approval without a minutes reference does not count.
4. The ICC's attestation is not a body's approval.
5. Provision text changes only by an enacted instrument. Never by hand, never as a patch release.
6. `moved_by` is filled in at drafting, not reconstructed later.
