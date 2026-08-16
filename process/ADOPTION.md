# Adoption — turning `/propose/` and `/icc/` on

`/bills/` is live. It is **record**, and an empty register is a true statement: *no bills are before
the board* is information, not absence.

`/propose/` and `/icc/` are built but **dark**, behind one flag, and they open together. They are
**action**, and an action surface opens when the desk behind it is staffed. The proposer's one
actionable instruction is *email this file to the ICC*. Put that in front of the public before the
ICC can receive, and the system's first impression on its first real author is silence. Opening the
proposal surface without the clerking desk is the same failure one step later.

Everything below is checked off before it goes live. Then:

```bash
PROPOSE_ENABLED=true npm run build     # or set it in the deploy workflow
```

---

## 1. The receiving address works without JavaScript

**This is the one that is currently failing.**

Cloudflare's **Email Address Obfuscation** (Scrape Shield) rewrites `mailto:` links at the edge into
`/cdn-cgi/l/email-protection#…`, which only resolves once its script has run. The build ships a
clean `mailto:` — `npm test` asserts that — but the served page does not.

The propose page's single actionable instruction is *email this file*. Shipping it while the edge
breaks that instruction for a reader without JavaScript defeats the page.

One of the following, before the flip:

- **Disable Email Address Obfuscation** — Cloudflare dashboard → the zone → Scrape Shield. A
  narrower option is a Configuration Rule disabling it for `constitution.stmorg.in` only.
- **Point the instruction at a contact page instead** of a raw address. Replace
  `info.contact.email` with `info.contact.url` in `constitution/current.yaml`; the page follows.

Verify:

```bash
curl -sS "https://constitution.stmorg.in/propose/?cb=$(date +%s)" \
  | grep -c "cdn-cgi/l/email-protection"     # must be 0
```

- [ ] Done, and verified by the command above.

Background: `.night-run/CUTOVER.md`, item 0.

## 2. The ICC coordinator is briefed

Not a document — a conversation. It covers:

- **The lifecycle**: draft → submitted → under-review → scheduled → approved → enacted → applied,
  and that the ICC owns numbering, scheduling and attestation but never approval.
- **The freeze point**: form review completes *before* any meeting is scheduled. Circulation is the
  freeze.
- **The resolution sentence and the hash.** `bill validate` prints it; the presiding officer reads
  it into the minutes, hash and all. A vote binds to that hash. Edit the bill afterwards and the
  approvals are void — including when the bill's own operations were untouched.
- **The ballot sheets**: one pre-filled sheet per body, so nobody composes a legal record from
  scratch and the hash cannot be mistyped. `bill ballot` writes them, and so does the download on
  `/icc/` — the same renderer, the same sheets.
- **The desk itself**: walk `/icc/` once, top to bottom. It is the whole job on one page, and it
  writes the record rather than leaving anyone to compose one.
- **Who runs `bill validate`** — the ICC, or the technical department. Decide it; do not leave it
  ambiguous.

- [ ] Briefed. Who: ______________________  Date: __________

## 3. One announcement, to all three bodies

To the **board**, the **intermediate board** and **unit heads**, together.

Article 16(3) convenes all three for any bill. None of them should first hear that this process
exists when they are summoned to vote under it.

It needs to say only: amendments are now proposed as bills, all three bodies vote on every one, and
here is where to read about it — link `process/PROPOSING.md` and `process/AMENDMENT-PROCESS.md`.

- [ ] Sent. Date: __________

## 4. One human dry run

The ICC processes a fixture bill end to end, in a sandbox, before a real one arrives:

```bash
cp examples/starter/bills/fixture-bill.yaml /tmp/dry-run.yaml
npx opencodelaw bill validate /tmp/dry-run.yaml     # read the diff and the hash
npx opencodelaw bill ballot   /tmp/dry-run.yaml     # print the three sheets
# fill the sheets by hand as mock minutes; archive them; record the tallies
npx opencodelaw act enact /tmp/dry-run.yaml --signed-pdf <the scan>
npx opencodelaw act apply /tmp/dry-run.yaml         # against a COPY of the fixture constitution
```

The fixture lifecycle already exists as a test. This is the same lifecycle as **rehearsal** — so the
first real bill is not the first time a human touches the tools.

Do it against `examples/starter/fixture-constitution.yaml`, never `constitution/current.yaml`.

- [ ] Done. Who: ______________________  Date: __________

---

## When all four are checked

1. Set `PROPOSE_ENABLED: 'true'` in `.github/workflows/deploy.yml`. Both pages open together.
2. Merge; wait for the deploy, and allow ten minutes for the edge cache.
3. Run the end-to-end suites against the **live** pages — including hash parity between the live
   page and the CLI, which is the check that caught the trailing-newline defect.
4. Announce that it is open.

---

## A note for whoever reads this later

While the two pages are dark, authoring a bill by hand is fully supported and produces exactly the
same file: copy `bills/TEMPLATE.yaml`, edit it, run `npx opencodelaw bill validate`. See
`process/AUTHORING-BY-HAND.md`. The pages are convenience, not gatekeeping — the editor exists so an
author cannot accidentally propose a half-described change, and the desk so nobody composes a legal
record from scratch. Neither holds any authority: `act enact` re-derives every claim they make.

**The tripwire's zero-permitted era ends the day the first real Act applies.** From then on the
Act's manifest *is* the permission, which is what all of this was built for. A legitimate first diff
under an Act is not a breach.
