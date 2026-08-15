/**
 * The propose page: author a bill without editing YAML.
 *
 * It produces a DRAFT and nothing else. There is no backend, and pretending
 * otherwise would be theatre: the page cannot authenticate a member, cannot
 * assign a number, and cannot record an approval. All authority stays with the
 * ICC and the three bodies. What it can do is make the one rule that matters
 * — operations carry the complete resulting text — true by construction, by
 * prefilling the current text and letting the author edit it. Nobody can write
 * a splice through this form.
 */

export function proposeTocItems () {
  return [
    { id: 'you', label: 'Who you are' },
    { id: 'bill', label: 'The bill' },
    { id: 'operations', label: 'What it changes' },
    { id: 'check', label: 'Check and download' }
  ]
}

export function proposeMain ({ url, escapeHtml, info }) {
  const contact = info.contact?.email ?? null
  return `
    <h1 class="page-title">Propose an amendment</h1>
    <p class="page-lead">This page builds a <strong>draft bill</strong> and hands it back to you as a
    file. It does not submit anything, number anything, or approve anything — that is the Internal
    Compliance Committee's, and the three approving bodies'.</p>

    <aside class="banner" role="note" aria-labelledby="propose-note">
      <h2 class="banner__title" id="propose-note">What this page can and cannot do</h2>
      <ul class="banner__list">
        <li><strong>It cannot check who you are.</strong> This is a static page with nothing behind
        it. Your membership is verified by the ICC when your draft reaches them, not here. The
        membership ID below is recorded so the ICC can check its register — that is its whole
        function.</li>
        <li><strong>It cannot submit.</strong> You download the file and send it to the ICC.</li>
        <li><strong>Editing YAML by hand is still perfectly valid.</strong> See
        <a href="${url('')}#art-16">Article 16</a> and the author's guide if you would rather.</li>
      </ul>
    </aside>

    <noscript>
      <p class="no-text" role="note">This builder needs JavaScript. Without it, copy
      <code>bills/TEMPLATE.yaml</code> from the repository and edit it by hand — that path is fully
      supported and produces exactly the same file.</p>
    </noscript>

    <form id="propose-form" novalidate>
      <section aria-labelledby="you">
        <h2 class="section-title" id="you">Who you are</h2>
        <p>The constitution does not say who may propose an amendment, so any member may. Your name
        is recorded in the bill permanently, from the moment you draft it.</p>
        <div class="field"><label for="p-name">Your name</label>
          <input id="p-name" name="name" required autocomplete="name"></div>
        <div class="field"><label for="p-role">Your role</label>
          <input id="p-role" name="role" placeholder="Member, Unit Head, IBM-Technical Coordinator…"></div>
        <div class="field"><label for="p-id">Membership ID</label>
          <input id="p-id" name="membership_id" aria-describedby="p-id-help">
          <p class="field__help" id="p-id-help">Checked against the register by the ICC. This page
          cannot verify it.</p></div>
        <div class="field"><label for="p-contact">Contact</label>
          <input id="p-contact" name="contact" type="email" autocomplete="email"></div>
      </section>

      <section aria-labelledby="bill">
        <h2 class="section-title" id="bill">The bill</h2>
        <div class="field"><label for="p-type">Type</label>
          <select id="p-type" name="type" aria-describedby="p-type-help">
            <option value="amendment">Amendment — an ordinary change</option>
            <option value="corrigendum">Corrigendum — correct a drafting error already on record</option>
          </select>
          <p class="field__help" id="p-type-help">A <em>revision</em> re-adopts the whole
          constitution. It is board-initiated and not available here.</p></div>
        <div class="field"><label for="p-title">Short title</label>
          <input id="p-title" name="short_title" required placeholder="An Act to …"></div>
        <div class="field"><label for="p-aka">Also known as <span class="field__opt">(optional)</span></label>
          <input id="p-aka" name="also_known_as" placeholder="Membership Act, 2026"></div>
        <div class="field"><label for="p-objects">Objects and reasons</label>
          <textarea id="p-objects" name="objects_and_reasons" rows="5" aria-describedby="p-objects-help"></textarea>
          <p class="field__help" id="p-objects-help">Why you are proposing this. Explanatory only —
          it is printed at the end of the Act and can never be cited as authority for anything.</p></div>
      </section>

      <section aria-labelledby="operations">
        <h2 class="section-title" id="operations">What it changes</h2>
        <p>One entry per provision. Pick the provision, then edit its text into exactly how it should
        read once your bill is applied. <strong>You are editing the whole provision, not describing a
        change to it</strong> — that is what lets an Act be applied safely and applied twice without
        harm.</p>
        <div id="op-list" aria-live="polite"></div>
        <button type="button" class="btn" id="op-add">Add a change</button>
      </section>

      <section aria-labelledby="check">
        <h2 class="section-title" id="check">Check and download</h2>
        <div id="check-report" role="status" aria-live="polite"></div>
        <div class="field">
          <p><strong>Substantive hash</strong> <span class="field__help">— what the approving bodies
          resolve on. It changes whenever the bill's text changes.</span></p>
          <p class="hash-line"><code id="hash-out">—</code>
          <button type="button" class="btn" id="hash-copy">Copy</button></p>
        </div>
        <button type="button" class="btn btn--primary" id="download">Download the draft</button>
        <details class="disc"><summary>Preview the instrument</summary>
          <pre id="preview" class="bill-text"></pre></details>
        <div class="banner" id="send-panel">
          <h3 class="banner__title">Then send it to the ICC</h3>
          <p>Email the downloaded file to the Internal Compliance Committee${contact
            ? ` at <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>`
            : ''}. They check its drafting, assign it a bill number, and schedule the approval
          meetings of all three bodies.</p>
          <p class="banner__note">Article 16(3) needs two thirds of those present and voting in the
          board, the intermediate board and the units. All three.</p>
        </div>
      </section>
    </form>

    <template id="op-template">
      <fieldset class="op">
        <legend>Change <span class="op__n"></span></legend>
        <div class="field"><label>What kind of change
          <select class="op__kind">
            <option value="substitute">Replace the text of an existing provision</option>
            <option value="retitle">Change only the heading</option>
            <option value="insert">Add a new article</option>
            <option value="omit">Remove a provision</option>
            <option value="reserve">Reserve a number, leaving it empty</option>
          </select></label></div>
        <div class="field op__pick"><label>Which provision
          <input class="op__search" type="search" role="combobox" aria-expanded="false"
                 aria-autocomplete="list" placeholder="Type to search articles…"></label>
          <ul class="op__results" role="listbox"></ul>
          <p class="op__chosen field__help"></p></div>
        <div class="field op__insert" hidden><label>New article number
          <input class="op__number" type="number" min="1"></label>
          <p class="field__help op__insert-help"></p></div>
        <div class="field op__titlebox"><label>Heading
          <input class="op__title"></label>
          <p class="field__help">Set this only if your Act states a heading. Leaving it as it is
          keeps the existing heading, which stays an editorial aid rather than enacted text.</p></div>
        <div class="field op__textbox"><label>The complete resulting text
          <textarea class="op__text" rows="10"></textarea></label>
          <p class="field__help">The whole provision, as it should read afterwards.</p></div>
        <div class="field op__notebox" hidden><label>Why
          <input class="op__note" placeholder="Reason this provision is removed or reserved"></label></div>
        <div class="op__confirm" hidden></div>
        <details class="disc op__diff"><summary>Before and after</summary>
          <div class="op__diff-body"></div></details>
        <button type="button" class="btn op__remove">Remove this change</button>
      </fieldset>
    </template>`
}
