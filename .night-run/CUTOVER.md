# Cutover — constitution.stmorg.in

**Status: the domain is already live on this build.** It was pointed here on 15 Aug 2026, ahead of
this document. What follows is therefore part record, part the checklist that remains.

The old site was **not** on GitHub Pages — `has_pages` was `false` until this rebuild, and the
committed `.htaccess` shows it was served by Apache. Cutover was a DNS repoint, not a Pages setting,
which is why the old site kept serving until the moment DNS changed.

---

## What happened, and what broke

| | |
|---|---|
| Pages enabled, Source: GitHub Actions | done |
| `rebuild/v3` added to the `github-pages` branch policy | done — it was `main`-only and was silently failing the deploy job |
| Custom domain set to `constitution.stmorg.in` | done, by Pranay |
| **Base path switched `/OpenCodeLaw/` → `/`** | **done, after the domain went live** |
| CNAME shipped in the artifact | done |
| Legacy `/archives/v1` redirects | done |

**The breakage.** The artifact was compiled for `BASE_PATH=/OpenCodeLaw/` while the apex domain
serves from `/`. Every asset and internal link resolved to a directory that did not exist —
`/styles/tokens.css` returned 200 while the HTML asked for `/OpenCodeLaw/styles/tokens.css`.

Fixed by rebuilding at `BASE_PATH=/`. Three guards now make it unrepeatable:

- the base path and origin are defined once, in `src/lib/paths.mjs`, and read by the build, the link
  checker and the tests — three copies of a default is how they drift;
- a test asserts that if a `CNAME` is present the build must be compiled for `/`;
- CI greps the built output for a stale `/OpenCodeLaw/` prefix and fails on it.

---

## Still outstanding

### 1. HTTPS is not enforced by GitHub

`gh api repos/ServiceToMankind/OpenCodeLaw/pages` reports `https_enforced: false`, and the Pages
`html_url` is `http://`. HTTPS does work for visitors — but it is terminated by **Cloudflare**, not
by GitHub. The served HTML contains `/cdn-cgi/l/email-protection`, which is Cloudflare rewriting the
`mailto:` in the footer, so the domain is proxied (orange cloud).

Consequences worth a decision:

- GitHub cannot provision its own certificate while Cloudflare proxies the domain, so
  **Enforce HTTPS will stay unavailable** until the record is set to DNS-only long enough for
  GitHub to issue a certificate.
- If Cloudflare's SSL mode is **Flexible**, the Cloudflare→GitHub leg is plaintext. It should be
  **Full (strict)**. Worth checking in the Cloudflare dashboard.
- Cloudflare's email obfuscation is rewriting page content. Harmless here, but it means the bytes
  served are not exactly the bytes built.

**Not changed — this is DNS and a third-party dashboard, outside anything authorised.**

### 2. Caching

Pages serves `cache-control: max-age=600`. After a deploy, expect up to ten minutes of stale HTML at
the edge. A cache-busting query (`?cb=…`) confirms the origin immediately. If Cloudflare caching is
enabled for HTML, purge after deploys or the window is longer.

### 3. Verify after any future deploy

```bash
curl -sS "https://constitution.stmorg.in/?cb=$(date +%s)" | grep -c "/OpenCodeLaw/"   # must be 0
curl -sS -o /dev/null -w "%{http_code}\n" https://constitution.stmorg.in/styles/tokens.css
curl -sS "https://constitution.stmorg.in/?cb=$(date +%s)" | grep -oE '<link rel="canonical"[^>]*>'
gh api repos/ServiceToMankind/OpenCodeLaw/pages --jq '{cname, https_enforced}'
```

---

## Rollback

If the new site has to come down quickly, in increasing order of severity:

1. **Revert the content, keep the domain.** `git revert` the offending commit and push; CI
   redeploys in about two minutes. Preferred — the domain and DNS stay untouched.
2. **Roll back to a known-good commit.** `git revert` back to it and push. Do not force-push; the
   deploy is driven by the branch head, and history rewriting is what makes the archive
   untrustworthy.
3. **Take the new site off the domain.** Remove the custom domain in Pages settings and point DNS
   back at the old Apache host. The old content still exists on that host; nothing in this
   repository deleted it.
4. **Deploy without the domain.** Run the workflow manually with `skip_cname: true`. Only for a
   deliberate return to `servicetomankind.github.io/OpenCodeLaw/`, and note that the build would
   then also need `BASE_PATH=/OpenCodeLaw/` to be coherent.

**Do not** delete the `rebuild/v3` branch or the Pages deployment while the domain points here —
that leaves the constitution domain serving a 404.

---

## The thing worth pausing on

The site is now the public face of a governing document that is **mid-reconciliation**. It says so
on every page, which is the right behaviour and the point of the whole exercise. But it also means
`constitution.stmorg.in` currently publishes a constitution that:

- reflects **one of three** enacted Amendment Acts, and only partly;
- holds Articles 6 and 7 pending Q2;
- carries 32 headings that no instrument enacted, now visibly marked.

None of that is hidden, and all of it is more honest than what the domain served before. It is still
worth the board knowing the domain went live in that state rather than after sign-off.
