/**
 * /propose/ — the document editor.
 *
 * The proposer opens a copy of the constitution, changes the words they want
 * changed, and downloads their proposal. Operations are DERIVED from the
 * difference; the proposer never meets the word "operation", never picks a
 * target, and never sees YAML.
 *
 * What replaced what: Phase 8 built a form here — pick an operation, pick a
 * target, fill a text box — which assumed the author already knew what those
 * three things were. It never went live, so nobody had to unlearn it.
 *
 * The page shell is server-rendered and the document is built in the browser
 * from constitution.json. That is deliberate and it is the invariant, not a
 * convenience: the editable text must be the RAW provision source, which is
 * what a bill's `text` carries and what the applier compares. Hydrating
 * textareas from rendered HTML would put marked-up, sanitised, entity-escaped
 * prose into an operation — hashing what is displayed instead of what will be
 * parsed, which is the one thing bill-serialise.mjs exists to prevent.
 */

export function proposeTocItems () {
  return [
    { id: 'continue', label: 'Continue a proposal' },
    { id: 'document', label: 'The constitution' },
    { id: 'review', label: 'Your changes' },
    { id: 'you', label: 'About you' },
    { id: 'download', label: 'Download and send' }
  ]
}

export function proposeMain ({ url, escapeHtml, info }) {
  const contact = info.contact?.email ?? null
  return `
    <h1 class="page-title">Propose a change to the constitution</h1>
    <p class="page-lead">Below is the constitution as it stands today. Change the words you want
    changed, then press <strong>Generate</strong> and download your proposal. That file goes to the
    Internal Compliance Committee, who put it before the board, the intermediate board and the
    units.</p>

    <aside class="banner" role="note" aria-labelledby="propose-note">
      <h2 class="banner__title" id="propose-note">What this page can and cannot do</h2>
      <ul class="banner__list">
        <li><strong>Nothing you do here changes the constitution.</strong> You are editing a copy in
        your own browser. The text on <a href="${url('')}">the constitution page</a> is unaffected by
        anything typed here.</li>
        <li><strong>It cannot check who you are.</strong> This is a static page with nothing behind
        it. The ICC checks your membership against the register when your proposal reaches them —
        that is what the membership number below is for.</li>
        <li><strong>It cannot submit.</strong> You download a file and email it. There is no send
        button, because there is nothing to send to.</li>
      </ul>
    </aside>

    <noscript>
      <p class="no-text" role="note">This editor needs JavaScript. Without it, read
      <a href="${url('')}">the constitution</a>, then write to the ICC${contact
        ? ` at <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>` : ''} describing
      the change you want. A proposal written in an email is perfectly valid — the ICC will draft it
      into a bill with you.</p>
    </noscript>

    <div id="restore" class="banner banner--restore" role="status" hidden></div>

    <section aria-labelledby="continue">
      <h2 class="section-title" id="continue">Continue a proposal you started</h2>
      <p>If you have a proposal file from a previous session, open it here. Your changes are
      re-made against <strong>today's constitution</strong>, not the one you started from — so what
      you send is always a change to the text that is actually in force.</p>
      <div class="field">
        <label for="upload">Your proposal file</label>
        <input id="upload" type="file" accept=".yaml,.yml,text/yaml,text/plain">
      </div>
      <div id="rebase-report" role="status" aria-live="polite"></div>
    </section>

    <section aria-labelledby="document">
      <h2 class="section-title" id="document">The constitution</h2>
      <p class="editor__hint">Every box below is the current text of a provision. Edit one and you
      have proposed replacing it. Headings are editable too. Nothing is submitted until you download
      a file and email it.</p>
      <p class="editor__hint editor__hint--quiet">Article numbers cannot be changed or reordered
      here, and there is no control for it. A number is how the constitution is cited — in Acts, in
      minutes, in links people have already sent — so an ordinary amendment never moves one.</p>
      <div id="editor" class="editor" aria-busy="true">
        <p class="editor__loading">Loading the constitution…</p>
      </div>
    </section>

    <section aria-labelledby="review">
      <h2 class="section-title" id="review">Your changes</h2>
      <p id="change-count" class="review__count" role="status" aria-live="polite">You have not
      changed anything yet.</p>
      <div id="changes"></div>
    </section>

    <section aria-labelledby="you">
      <h2 class="section-title" id="you">About you</h2>
      <p>The constitution does not say who may propose an amendment, so any member may. Your name is
      recorded in the proposal permanently, from the moment you draft it.</p>
      <div class="field"><label for="p-name">Your name</label>
        <input id="p-name" name="name" autocomplete="name" required></div>
      <div class="field"><label for="p-role">Your role <span class="field__opt">(optional)</span></label>
        <input id="p-role" name="role" placeholder="Member, Unit Head, Coordinator…"></div>
      <div class="field"><label for="p-id">Membership number</label>
        <input id="p-id" name="membership_id" aria-describedby="p-id-help">
        <p class="field__help" id="p-id-help">Recorded in the file and checked against the register
        by the ICC when they receive it. This page cannot verify it.</p></div>
      <div class="field"><label for="p-contact">Email <span class="field__opt">(optional)</span></label>
        <input id="p-contact" name="contact" type="email" autocomplete="email"></div>

      <div class="field"><label for="p-title">A short name for your proposal</label>
        <input id="p-title" name="short_title" required placeholder="An Act to …"
               aria-describedby="p-title-help">
        <p class="field__help" id="p-title-help">How the Act would be titled if it passes.</p></div>

      <div class="field"><label for="p-objects">Explain your changes in plain words</label>
        <textarea id="p-objects" name="objects_and_reasons" rows="6" required
                  aria-describedby="p-objects-help"></textarea>
        <p class="field__help" id="p-objects-help">Write it for someone who has not read the
        constitution today. This is printed at the end of the Act as the Statement of Objects and
        Reasons — it explains, and it can never be cited as authority for anything.</p></div>

      <div class="field"><label for="p-type">What kind of change is this?</label>
        <select id="p-type" name="type" aria-describedby="p-type-help">
          <option value="amendment">An ordinary change to the constitution</option>
          <option value="corrigendum">A correction to a drafting error already on record</option>
        </select>
        <p class="field__help" id="p-type-help">If you are unsure, leave it as an ordinary change.
        Re-adopting the whole constitution is a different instrument and is the board's to
        start.</p></div>
    </section>

    <section aria-labelledby="download">
      <h2 class="section-title" id="download">Download and send</h2>
      <div id="check-report" role="status" aria-live="polite"></div>
      <p class="hash-line"><strong>Reference number for this proposal</strong>
        <code id="hash-out">—</code>
        <button type="button" class="btn" id="hash-copy">Copy</button></p>
      <p class="field__help">This changes whenever your proposal changes. The approving bodies vote
      on this number, not on the title — so a proposal cannot be altered after a vote without the
      alteration being obvious.</p>

      <p><button type="button" class="btn btn--primary" id="generate" disabled>Generate my proposal
      file</button></p>

      <details class="disc"><summary>See how your proposal would read as an Act</summary>
        <pre id="preview" class="bill-text"></pre></details>

      <div class="banner" id="send-panel">
        <h3 class="banner__title">Then email it to the ICC</h3>
        <p>Send the downloaded file to the Internal Compliance Committee${contact
          ? ` at <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>`
          : ''}, along with the readable copy if you like. They check its drafting, give it a bill
        number, and schedule the meetings of all three bodies.</p>
        <p class="banner__note">Article 16(3) needs two thirds of those present and voting in the
        board, the intermediate board and the units. All three.</p>
      </div>

      <div class="banner banner--quiet">
        <h3 class="banner__title">About the copy saved in this browser</h3>
        <p>Your work is saved in this browser as you go, so a closed tab or a crash does not lose
        it. <strong>It is saved only here — the file you download is your real copy.</strong> Clear
        your browsing data, use a different device, and it is gone.</p>
        <p>On a shared or public computer, clear it when you are finished: the saved copy carries
        your name and membership number.</p>
        <p><button type="button" class="btn" id="clear-draft">Clear the copy saved in this
        browser</button> <span id="saved-at" class="field__help"></span></p>
      </div>
    </section>`
}
