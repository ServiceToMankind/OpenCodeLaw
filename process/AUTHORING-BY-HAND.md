# Authoring a bill by hand

For the ICC, the technical department, and anyone who would rather write the file than
use the page. This path is fully supported and produces exactly the same bill as
[the propose page](https://constitution.stmorg.in/propose/) — the page is convenience,
not gatekeeping.

**If you are a member who wants to change the constitution, you want
[PROPOSING.md](PROPOSING.md) instead.** It needs no terminal, no YAML and no GitHub
account, and it will take you ten minutes. Nothing on this page is required of you.

Governance — who votes, when, and what happens after the bill is handed in — is in
[AMENDMENT-PROCESS.md](AMENDMENT-PROCESS.md). This page is only about writing the thing.

---

## 1. What a bill is

A **bill** is one file that says exactly what the constitution should say after your
change — not a description of the change, the change itself. If all three bodies named
in Article 16(3) approve it, that same file is signed as an **Act** and applied to the
constitution by a tool, not by a person with a keyboard. So the file you write is the
law you are proposing, and everything else — the printed Act, the diff the meetings
read, the amended constitution — is generated from it.

That inversion is the whole point. The 2024 Acts were written as prose and typed into
the constitution by hand, which left provisions half-applied, an application nobody
recorded, and fourteen open questions in [RECONCILIATION.md](../RECONCILIATION.md).
Your bill cannot do that, because it is machine-applicable from the moment you save it.

---

## 2. Copy the template

If you have the repository already, skip to the two `cp` lines. If not, and you have a
terminal:

```bash
git clone https://github.com/ServiceToMankind/OpenCodeLaw.git
cd OpenCodeLaw
npm ci
```

Then copy the template into a folder named for the year you are drafting in:

```bash
mkdir -p bills/2026
cp bills/TEMPLATE.yaml bills/2026/refreshments.yaml
```

- Put the file in `bills/<year>/`. Nothing else goes there.
- Name it after the subject, in lowercase with hyphens — `refreshments.yaml`,
  `unit-finance.yaml`. Not after yourself, and not `final-v2-FINAL.yaml`.
- **Your bill file is the only file you touch.** Never edit anything under
  `constitution/` or `acts/`. Editing the constitution directly is exactly what this
  process exists to make impossible.

**Never used a terminal?** Two honest options. Ask the ICC or any repo contributor to
run the validator for you and send you the output — that is normal and nobody minds.
Or install [Node.js](https://nodejs.org) 20 or newer and run the three commands above
once; after that, the only command you ever need is the one in section 5.

Open the copied file in any plain text editor. It is a `.yaml` file, which means three
rules and no more:

- **Indentation is structure.** Keep the leading spaces exactly as you found them.
- **`~` means "empty"**, and several fields are deliberately empty. Leave them.
- **`|` starts a block of text.** Everything indented under it is your text, and you
  can write as many lines and paragraphs as you like.

The template is commented line by line. It is worth reading before you type anything.

---

## 3. Say who you are and what you are changing

At the top of the file:

| Field | What to put |
|---|---|
| `short_title` | How the Act will be titled: "An Act to ..." |
| `also_known_as` | Optional familiar name, the way Act 1 of 2024 called itself the "Membership Act, 2024" |
| `year` | The year you are drafting in |
| `number` | Leave it `~`. The ICC assigns a bill number at submission — "Bill 1 of 2026" — and a draft that carries a number is a draft pretending to be before someone |
| `type` | `amendment` unless you know otherwise. `corrigendum` only fixes a drafting error already recorded against an Act; `revision` re-adopts the whole constitution and is not something you will draft casually |
| `moved_by` | Your name, your role, your contact |
| `drafted` | Today's date, as `2026-01-15` |
| `base_version` | The version printed on the constitution's front page. **Today that is `3.0.0`** |
| `version_bump` | `minor` for an amendment. `major` is reserved for a `revision` |
| `status` | Leave it `draft`. The pipeline moves it; you do not |

`moved_by` is recorded now, at drafting, and never reconstructed later. All three 2024
Acts reached us with no reliable record of who moved them, and one register named an
author that appears nowhere in any of the instruments. That question is still open. It
will not be asked about your bill.

**`objects_and_reasons`** is where you explain yourself, in numbered sentences. It is
printed at the end of the Act and it is **explanatory only** — it can never be cited as
the authority for anything, and the validator refuses any operation that tries. This is
not a technicality: Act 2 of 2024 set the amendment threshold at 2/3 in its operative
text and 3/4 in its statement of reasons, and the disagreement is still on the books as
Q3. Put your reasoning here; put your law in `operations`.

**Finding the id of the thing you are changing.** Every provision has a permanent id.
Articles are `art-3`, `art-16`, `art-21`. A numbered subdivision inside an article is
`art-14-s-1`, `art-15-s-2`. The id is in the address bar when you open that provision on
the site, and in `constitution/current.yaml`. Use the id, not the heading — headings
change, ids are permanent citation handles and never move.

---

## 4. The one rule that matters

**Every operation carries the complete resulting text of the provision.**

Not a diff. Not "insert after the words". Not "delete the third sentence". Write the
provision out in full, exactly as it should read once your Act has been applied —
including the parts you are not changing.

Why: because application is then a comparison rather than a transcription, so applying
an Act twice changes nothing the second time, and an Act written against text that has
since moved refuses to apply instead of quietly corrupting it.

Wrong — this is a description of a change, and nothing can safely apply it:

```yaml
    text: |
      In clause (2), after "one week", insert "excluding public holidays".
```

Right — this is the provision:

```yaml
    text: |
      1. Notice of a general meeting shall be given not less than one week
         before the meeting.
      2. The period of notice shall be one week, excluding public holidays.
```

Three smaller rules follow from the big one:

- **`title:`** — set it only if your Act actually states a heading for the provision. If
  you set it, that heading is recorded as enacted. If you leave it out, the existing
  heading stays as it is and stays editorial.
- **`sections:`** — if the provision has titled subdivisions and you are restructuring
  them, list them all, each with its `number`, `title` and `text` in full. Leaving
  `sections` out leaves the existing subdivisions untouched.
- **`omit` and `reserve`** carry no text at all — they remove or park a provision — and
  both require a `note` saying why.

There is no `renumber`. Article numbers are permanent: every Act, every set of minutes
and every link anyone has ever shared points at them. Renumbering is lawful only inside
a `revision`, and the validator will say so if you try.

---

## 5. Validate, and read your own diff

```bash
npx opencodelaw bill validate bills/2026/refreshments.yaml
```

Run it as often as you like — after every edit, if you want. It checks your drafting and
then prints, for each operation, what the provision says now and what it would say
afterwards.

**Read that diff. It is what the approval meetings will read.** Not your explanation, not
what you meant, not what you told the meeting last week — that output. If it does not say
what you intended, the meeting will vote on what it says, so fix it now while fixing it
costs nothing.

The terminal shows the first hundred characters of each side, so for anything longer,
open your `text:` block next to the live provision on the site and read both through.
An hour with your own diff at draft stage is worth more than every review afterwards.

`ERROR` lines must be fixed before you submit. `warn` lines will not stop you, but read
them — `no-op`, for instance, means the text you proposed is identical to the text that
is already there, which usually means you edited the wrong copy.

---

## 6. What the validator will tell you off for

| It says | It means | Do this |
|---|---|---|
| `rebase-required` | Your `base_version` is older than the constitution. Something else was applied while you were drafting | Re-read each of your operations against the **current** text, fold in anything that changed, update `base_version`, re-validate. Nobody may vote on text that no longer exists |
| `target-unresolved` | The provision id you named does not exist | Check the id on the site. If the provision genuinely is new, the operation is `insert` |
| `insert-exists` | You said `insert`, but that provision already exists | Use `substitute` to replace its text, or `retitle` for the heading alone |
| `renumber-forbidden` | You tried to move a provision's number | You cannot, in an amendment. Numbers are permanent citation handles; only a `revision` may move them, with a major bump and a map of where everything went |
| `numbered-draft` | Your draft carries a bill number | Set `number: ~`. Only the ICC assigns numbers, and only at submission |
| `unnumbered-bill` | The status has moved past `draft` but no number was assigned | The ICC's to fix, not yours |
| `sor-as-authority` | An operation leans on the statement of objects and reasons | Write the rule into the operation's own text. The statement explains; it never enacts |
| `corrigendum-scope` | A `corrigendum` aimed at something that is not a recorded drafting error | If the change is substantive — and it almost always is — it needs an `amendment` bill |
| `duplicate-op` | Two operations share an `id` | Number them `op-1`, `op-2`, `op-3` |

The approval and enactment errors — missing bodies, missing minutes, below threshold —
are the ICC's problem, not yours. You will not see them on a draft.

---

### Before you circulate — the text freezes

Once your bill goes to the approving bodies, its text is frozen. A vote binds to the bill's
**substantive hash** — printed by `bill validate` and read into the minutes — not to its title. Edit
the bill afterwards and every recorded approval is void; those bodies must meet again.

That is true even for a typo, and even when a rebase leaves your own operations untouched. **Get the
text right before you circulate.**

Also worth knowing: any command that writes your bill strips comments. Notes for the record go in
`objects_and_reasons` or an operation's `note`.

## 7. Submitting

Send the file to the **Internal Compliance Coordinator**, who clerks it at
[/icc/](https://constitution.stmorg.in/icc/). If you do not know who holds
that office this year, ask at `pranay@stmorg.in`, the contact of record in the
constitution. Send the validator output with it; a bill that has never been validated
will come straight back.

What happens next, briefly:

1. The ICC numbers it — "Bill 1 of 2026" — and the status becomes `submitted`, then
   `under-review`. A bill can be **returned** to you for redrafting and come back, as
   many times as it takes.
2. Once it is `scheduled`, it goes to all three bodies Article 16(3) names: the board,
   the intermediate board, and the units. **All three. Every time.** The 2024 Acts
   recorded only the ICC's assent, and closing that gap permanently is why this pipeline
   exists.
3. Each body's vote is recorded — present, for, against, abstain, and a reference to the
   minutes. Abstentions do not count towards the threshold, because Article 16(3) says
   "present and voting".
4. The threshold is two thirds. Article 16(3) says the three bodies approve
   "collectively", and that word genuinely bears two readings: one pooled vote of
   everyone sitting together, or two thirds inside each body separately. **Until the
   board settles it by resolution, the stricter reading governs — two thirds in each
   body.** Both tallies are recorded either way, so the Act stands under whichever
   reading the board eventually adopts.
5. Approved, it is enacted: an Act number for the year, assent, a signed PDF rendered
   from your file and checksummed against it. Then it is applied, and the constitution's
   minor version goes up.

You do not fill in `approvals` or `enactment`. Leave them exactly as the template has
them. The full procedure is in [AMENDMENT-PROCESS.md](AMENDMENT-PROCESS.md).

You may withdraw your own bill at any time before it is approved.

---

## 8. A fully worked example

> ### This example is fiction.
>
> It amends the constitution of the **Worked Example Society for the Study of Nothing in
> Particular**, an organisation that does not exist, whose Article 99 concerns tea and
> biscuits. **It is not STM law, no part of it is, and none of its text belongs anywhere
> near a real bill.** Copy its *shape*. Never its words.
>
> It is written against the Example Society's own constitution version `7.2.0`, so
> running the validator on it inside this repository will correctly complain that
> `art-99` does not exist and that the base version is stale. That is the validator
> working, not a mistake in the example.

`bills/2026/refreshments.yaml`:

```yaml
opencodelaw_bill: "1.0"

bill:
  short_title: An Act to provide for refreshments at general meetings
  also_known_as: Refreshments Act, 2026
  year: 2026
  number: ~
  type: amendment

  moved_by:
    name: A. Coordinator
    role: Unit Head, Example Unit
    contact: a.coordinator@example.invalid

  drafted: 2026-01-15
  base_version: "7.2.0"
  version_bump: minor

status: draft

history: []

objects_and_reasons: |
  1. Article 99 presently provides for tea only, and is silent on whether anything
     may be eaten with it. The article is substituted to settle the question and to
     name who is responsible.
  2. Article 100 is inserted to establish a rota, so that responsibility for
     refreshments does not fall on whoever arrives first.

operations:
  - id: op-1
    operation: substitute
    target: art-99
    scope: article
    title: Refreshments and Catering
    text: |
      1. Tea shall be provided at every general meeting of the Society.
      2. Coffee shall be provided at every general meeting of the Society, and no
         member may be required to state a preference in advance.
      3. Each member present shall be entitled to not fewer than two biscuits.
      4. The Refreshments Secretary is responsible for the provision of refreshments
         under this Article and shall report on it at the annual general meeting.

  - id: op-2
    operation: insert
    target: art-100
    scope: article
    title: Tea Rota
    text: |
      1. The Refreshments Secretary shall maintain a rota of members responsible for
         refreshments at each general meeting.
      2. The rota shall be published not less than one week before the meeting to
         which it relates.
      3. A member named on the rota who is unable to attend shall arrange a
         substitute and inform the Refreshments Secretary in writing.

approvals:
  - body: board
    date: ~
    present: ~
    for: ~
    against: ~
    abstain: ~
    evidence: ~
  - body: intermediate-board
    date: ~
    present: ~
    for: ~
    against: ~
    abstain: ~
    evidence: ~
  - body: units
    date: ~
    present: ~
    for: ~
    against: ~
    abstain: ~
    evidence: ~

enactment:
  act_number: ~
  act_year: ~
  assent_date: ~
  assented_by: ~
  signed_by: ~
  signed_pdf: ~
  signed_pdf_sha256: ~
```

Validated against the Example Society's own constitution, that bill prints roughly this
— and *this* is the thing three meetings will read:

```
Bill: An Act to provide for refreshments at general meetings
  unnumbered draft · amendment · status draft
  moved by A. Coordinator · against constitution 7.2.0

Operations (2):
  op-1  substitute art-99 (article)
      title: "Refreshments" → "Refreshments and Catering"
      before: 1. Tea shall be provided at every general meeting of the Society.
      after : 1. Tea shall be provided at every general meeting of the Society. 2. Coffee shall be prov…
  op-2  insert art-100 (article)
      title: null → "Tea Rota"
      after : 1. The Refreshments Secretary shall maintain a rota of members responsible for refreshme…

Approvals — Article 16(3) requires all three bodies:
  board               not recorded
  intermediate-board  not recorded
  units               not recorded

OK — 0 warning(s)
```

Notice what op-1 does and does not say. It does not say "add coffee and biscuits to
Article 99". It sets out Article 99 entire — tea included, unchanged — because the
operation's text *is* the article afterwards. That is the rule in section 4, and it is
the only one you have to get right.

---

**See also:** [AMENDMENT-PROCESS.md](AMENDMENT-PROCESS.md) (governance and lifecycle) ·
[`bills/TEMPLATE.yaml`](../bills/TEMPLATE.yaml) (the commented template) ·
[`schema/opencodelaw-bill-1.0.schema.json`](../schema/opencodelaw-bill-1.0.schema.json)
(every field, authoritatively) · [RECONCILIATION.md](../RECONCILIATION.md) (why this
process is shaped the way it is).
