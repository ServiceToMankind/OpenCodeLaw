/**
 * /icc/ — the clerking desk.
 *
 * It exists so the Internal Compliance Coordinator never composes a legal
 * record by hand: the bill number, the status transitions, the resolution
 * sentence, the ballot sheets, the tallies and the evidence checksums all come
 * out of one screen, in the lifecycle's own order.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT GENERATES FILES. IT SUBMITS NOTHING AND ENACTS NOTHING.
 *
 * Assent, the signed instrument's registration and the application to the
 * constitution stay with the technical department's CLI and CI — because that
 * is where every claim this page produces gets independently re-verified:
 * evidence files present on disk and matching their recorded checksums,
 * thresholds recomputed from the tallies, the bill's hash checked against every
 * approval that cites it.
 *
 * A hand-forged ICC file fails at that gate exactly as it would if this page
 * had never been built. Trust lives in the validators, not in this page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function iccTocItems () {
  return [
    { id: 'upload', label: '1. Open the proposal' },
    { id: 'review', label: '2. Read what it does' },
    { id: 'clerk', label: '3. Number and schedule' },
    { id: 'meetings', label: '4. Record the meetings' },
    { id: 'evidence', label: '5. Attach the minutes' },
    { id: 'generate', label: '6. Generate and send on' }
  ]
}

export function iccMain ({ url, escapeHtml, info }) {
  return `
    <h1 class="page-title">ICC desk</h1>
    <p class="page-lead">Clerking a bill from the moment it arrives to the moment it goes to the
    technical department. Everything on this page is written into one file that you send on; nothing
    is submitted, and nothing here enacts anything.</p>

    <aside class="banner" role="note" aria-labelledby="icc-note">
      <h2 class="banner__title" id="icc-note">What this desk does and does not do</h2>
      <ul class="banner__list">
        <li><strong>It writes down. It does not decide.</strong> The three bodies approve; you record
        what they resolved and the evidence for it.</li>
        <li><strong>It does not enact or apply.</strong> Assent, the signed Act and the change to the
        constitution are the technical department's, through
        <code>act enact</code> and <code>act apply</code>. Those re-check every number on this page
        against the files on disk — so this page is convenience, and none of it is authority.</li>
        <li><strong>Nothing is uploaded anywhere.</strong> Files you open here are read in this
        browser. Nothing leaves it except what you download.</li>
      </ul>
    </aside>

    <noscript>
      <p class="no-text" role="note">This desk needs JavaScript. Without it, everything here is
      available from the command line: <code>bill validate</code>, <code>bill ballot</code>,
      <code>bill submit</code>. See <a href="${url('')}">the constitution</a> and the process notes
      in the repository.</p>
    </noscript>

    <div id="restore" class="banner banner--restore" role="status" hidden></div>

    <section aria-labelledby="upload">
      <h2 class="section-title" id="upload">1. Open the proposal</h2>
      <p>Open the file the proposer sent you. It is checked immediately: its shape against the
      schema, every provision it names against the constitution, and the version it was written
      against.</p>
      <div class="field">
        <label for="bill-file">The proposal file</label>
        <input id="bill-file" type="file" accept=".yaml,.yml,text/yaml,text/plain">
      </div>
      <div id="upload-report" role="status" aria-live="polite"></div>
    </section>

    <section aria-labelledby="review" hidden data-stage>
      <h2 class="section-title" id="review">2. Read what it does</h2>
      <p>This is what the approving bodies will read. The before and after of every provision the
      bill touches, then the instrument as it would be printed.</p>
      <div id="manifest"></div>
      <h3 class="act__sub">Statement of Objects and Reasons</h3>
      <p class="field__help">Explanatory. It is never operative and can never be cited as authority
      for anything.</p>
      <pre id="objects" class="bill-text"></pre>
      <details class="disc"><summary>The instrument as it would be printed</summary>
        <pre id="instrument" class="bill-text"></pre></details>
    </section>

    <section aria-labelledby="clerk" hidden data-stage>
      <h2 class="section-title" id="clerk">3. Number and schedule</h2>
      <div class="field"><label for="bill-number">Bill number</label>
        <input id="bill-number" type="number" min="1" aria-describedby="bill-number-help">
        <p class="field__help" id="bill-number-help">Assigned by you at submission. The next free
        number for this year is filled in from the published register.</p></div>
      <div class="field"><label for="submitted-date">Date received</label>
        <input id="submitted-date" type="date"></div>
      <div class="field"><label for="scheduled-date">Date the meetings were called</label>
        <input id="scheduled-date" type="date" aria-describedby="scheduled-help">
        <p class="field__help" id="scheduled-help">Form review finishes <em>before</em> this date.
        Circulation is the freeze point: once the bodies have the bill, editing it voids every
        approval already given.</p></div>
      <div class="field"><label for="actor">Recorded by</label>
        <input id="actor" placeholder="Internal Compliance Coordinator"></div>

      <div class="banner">
        <h3 class="banner__title">The resolution sentence</h3>
        <p class="resolution-line" id="resolution">—</p>
        <p>The presiding officer of each body reads this sentence into the minutes, hash and all. A
        vote binds to that hash. If the bill is edited afterwards the approvals are void and must be
        collected again — including when the bill's own operations were untouched.</p>
        <p><button type="button" class="btn" id="copy-resolution">Copy the sentence</button>
        <button type="button" class="btn" id="download-ballots">Download the three ballot
        sheets</button></p>
        <p class="banner__note">One pre-filled sheet per body, exactly what
        <code>bill ballot</code> produces. Print them, take them to the meetings, and nobody has to
        compose a record of resolution from scratch or retype a hash.</p>
      </div>
    </section>

    <section aria-labelledby="meetings" hidden data-stage>
      <h2 class="section-title" id="meetings">4. Record the meetings</h2>
      <p>Article 16(3) requires the board, the intermediate board and the units — all three. The
      verdict below each body updates as you type, so you know where you stand before you generate
      anything.</p>
      <p class="field__help">Record tallies and attendance counts only. Individual members' votes
      are not published.</p>
      <div id="bodies"></div>
      <div id="verdict" class="banner" role="status" aria-live="polite"></div>
    </section>

    <section aria-labelledby="evidence" hidden data-stage>
      <h2 class="section-title" id="evidence">5. Attach the minutes</h2>
      <p>Open each body's signed minutes. The file is fingerprinted in this browser and the
      fingerprint is written into the record, so the archived document can later be proven to be the
      one that was filed. <strong>The file itself is not uploaded</strong> — you send the PDFs
      alongside the record.</p>
      <p class="field__help">One compiled record may legitimately serve a joint sitting of all three
      bodies: open the same file for each. Evidence can be shared; arithmetic cannot — each body's
      two-thirds is proven by that body's own tally.</p>
      <div id="evidence-list"></div>
    </section>

    <section aria-labelledby="generate" hidden data-stage>
      <h2 class="section-title" id="generate">6. Generate and send on</h2>
      <div id="icc-report" role="status" aria-live="polite"></div>
      <p><button type="button" class="btn btn--primary" id="icc-download" disabled>Generate the
      record</button></p>
      <div class="banner">
        <h3 class="banner__title">Send both together</h3>
        <p>Send the generated file <strong>and the signed minutes PDFs</strong> to the technical
        department in one message. The record names each PDF by path and fingerprint; without the
        files themselves, <code>act enact</code> refuses the bill — which is the point.</p>
        <p class="banner__note">Suggested paths are shown beside each fingerprint above. The
        technical department places the files there, opens a pull request, and the gate re-checks
        every one of them.</p>
      </div>
      <div class="banner banner--quiet">
        <h3 class="banner__title">About the copy saved in this browser</h3>
        <p>Your work is saved in this browser as you go. <strong>It is saved only here — the file
        you download is the record.</strong> On a shared computer, clear it when you are finished:
        it carries names, tallies and meeting details.</p>
        <p><button type="button" class="btn" id="clear-draft">Clear the copy saved in this
        browser</button> <span id="saved-at" class="field__help"></span></p>
      </div>
    </section>

    <template id="body-template">
      <fieldset class="body-card">
        <legend class="body-card__name"></legend>
        <div class="field-row">
          <div class="field"><label>Date<input type="date" data-role="date"></label></div>
          <div class="field"><label>How it met
            <select data-role="mode">
              <option value="">—</option>
              <option value="in-person">In person</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select></label></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Place or platform<input data-role="place"></label></div>
          <div class="field"><label>Presiding<input data-role="presiding"></label></div>
        </div>
        <div class="field-row field-row--tally">
          <div class="field"><label>Present<input type="number" min="0" data-role="present"></label></div>
          <div class="field"><label>For<input type="number" min="0" data-role="for"></label></div>
          <div class="field"><label>Against<input type="number" min="0" data-role="against"></label></div>
          <div class="field"><label>Abstaining<input type="number" min="0" data-role="abstain"></label></div>
        </div>
        <p class="body-card__verdict" data-role="verdict" role="status" aria-live="polite"></p>
      </fieldset>
    </template>

    <template id="evidence-template">
      <fieldset class="body-card">
        <legend class="body-card__name"></legend>
        <div class="field"><label>The signed minutes<input type="file" data-role="file"></label></div>
        <div class="field"><label>What kind of record
          <select data-role="kind">
            <option value="minutes">Signed minutes</option>
            <option value="poll-export">Attested poll export</option>
            <option value="resolution">Record of resolution</option>
          </select></label></div>
        <div class="field"><label>Where it will be filed
          <input data-role="path" spellcheck="false"></label>
          <p class="field__help">Suggested, not fixed — the technical department files the document
          at this path and the record names it there. Change it if it is going somewhere else.</p></div>
        <p class="evidence__out" data-role="out"></p>
      </fieldset>
    </template>`
}
