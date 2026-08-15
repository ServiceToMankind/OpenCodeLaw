# Record of Resolution — template

The structure of the record each approving body files under Article 16(3). If you are recording by
hand, follow this. If you would rather not compose it from scratch:

```bash
npx opencodelaw bill ballot bills/2026/<the-bill>.yaml
```

That renders one pre-filled sheet per body — board, intermediate board, units — with the bill
details and the substantive hash already printed, so the hash cannot be mistyped. Print it, take it
to the meetings, sign it, scan it, and archive the scan beside the bill.

---

## Why a signed record, and not a link

A poll URL is not evidence. It is mutable, it is unattributable, it proves nothing about who
resolved what on which text, and it dies with the platform. The record a society keeps is the record
societies have always kept: **a signed record of resolution, archived immutably beside the instrument
it approves.**

Where the by-laws permit an online vote — the units are spread across colleges, so they may — the
poll is the **voting mechanism**. The **record** is a static export of the result, attested by the
ICC coordinator, archived and hashed exactly like minutes. Record it as `kind: poll-export`.

## The one line that must be read aloud

Every record must carry the resolution sentence, verbatim, including the hash:

> This meeting resolves on Bill 1 of 2026, substantive hash `ab12…`.

`npx opencodelaw bill validate <file>` prints that sentence. **A vote binds to the hash, not to the
title.** A bill's title reads exactly the same before and after somebody edits an operation; the hash
does not. If the bill is edited after this meeting, this resolution is void and the body resolves
again — including where the bill's own operations were untouched, because a provision can become
contradictory purely because other articles moved.

Get the text right before you circulate.

## What the record must contain

| | |
|---|---|
| Body | board / intermediate board / units |
| Date | |
| Mode | in person, online, or hybrid |
| Place or platform | |
| Presiding officer | signs by name |
| Members present | a count |
| Voting **for** | a count |
| Voting **against** | a count |
| **Abstaining** | a count — outside the threshold denominator |
| Resolution sentence | verbatim, with the hash |
| Attested by | the ICC coordinator, by name |

Article 16(3) needs **two thirds of those present and voting**. Abstentions are not in the
denominator: nine for, one against, and one abstaining is 9/10 — not 9/11.

## Privacy — tallies, not roll-calls

This repository and the site built from it are **public**.

Published records carry **tallies and attendance counts only**. Do not publish how individual
ordinary members voted. Presiding officers and the ICC coordinator sign by name, as they already do
on the Acts — that is a signature of office, not disclosure of a vote.

If the by-laws ever require a roll-call vote, the roster is an **internal annexure held by the ICC**.
Reference it in the record; do not publish it.

## A joint sitting

The three bodies may sit together, and often should — it turns a re-vote after an edit into one
meeting instead of three. One signed record may then serve all three bodies and the same file may be
referenced by each.

**The tallies must still be recorded separately per body.** Article 16(3) says "collectively", which
bears two readings, and until the board resolves which one it means, the stricter governs: two thirds
within each body, counted on its own. A joint sitting that records only a pooled count cannot satisfy
that reading, and its approvals will not enact.

## Filing it

Archive the signed scan under `bills/<year>/evidence/`, then record it in the bill:

```yaml
evidence:
  kind: minutes                 # minutes | ballot-tally | poll-export
  path: bills/2026/evidence/bill-1-2026-board-minutes.pdf
  sha256: <64 hex characters>
```

`bill validate` checks that the file exists and that its checksum matches. A `url:` may sit
alongside as a convenience pointer — never instead of the archived file.
