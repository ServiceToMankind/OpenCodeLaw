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

### 0. Cloudflare rewrites the contact link, breaking the no-JS guarantee

**Confirmed live.** The build ships `href="mailto:pranay@stmorg.in"`; the served page carries
`/cdn-cgi/l/email-protection#<hex>`, which only resolves once Cloudflare's script has run. On a site
whose premise is that it works with JavaScript disabled, the one outbound link a reader is most
likely to need is the only thing that requires it.

This is Cloudflare's **Email Address Obfuscation** (Scrape Shield). It is applied at the edge and
**cannot be fixed in the build** — `npm test` asserts the build output is clean, which it is.

Two routes, both Pranay's to choose:

1. **Turn it off.** Cloudflare dashboard → the zone → **Scrape Shield** → disable *Email Address
   Obfuscation*. Narrower option: leave it on globally and add a Configuration Rule disabling it for
   `constitution.stmorg.in`.
2. **Stop publishing a raw address.** Replace `info.contact.email` with `info.contact.url` pointing
   at a contact page. Nothing to obfuscate, and the address stops being scraped — which is what the
   feature is for.

Verify after either:

```bash
curl -sS "https://constitution.stmorg.in/?cb=$(date +%s)" | grep -c "cdn-cgi/l/email-protection"   # 0
```

### 1. HTTPS is not enforced by GitHub

`gh api repos/ServiceToMankind/OpenCodeLaw/pages` reports `https_enforced: false`, and the Pages
`html_url` is `http://`. HTTPS does work for visitors — but it is terminated by **Cloudflare**, not
by GitHub. The served HTML contains `/cdn-cgi/l/email-protection`, which is Cloudflare rewriting the
`mailto:` in the footer, so the domain is proxied (orange cloud).

**Direct evidence that no GitHub certificate exists for this hostname.** Fetching GitHub's Pages
origin with the right Host header fails TLS verification:

```
$ curl --resolve constitution.stmorg.in:443:185.199.108.153 https://constitution.stmorg.in/
curl: (60) SSL: no alternative certificate subject name matches target host name
      'constitution.stmorg.in'
```

Visitors are unaffected — Cloudflare terminates TLS with its own certificate — but it confirms the
GitHub-side certificate has never been issued, which is what `https_enforced: false` reflects. It
also means **Cloudflare's SSL mode cannot currently be Full (strict)** against this origin without
returning [error 526][cf-526]: strict mode validates the origin certificate, and there is not a
valid one for this hostname. Whatever the mode is today, it is not that. Check it.

**What the documentation actually says** — checked rather than recalled, because the usual advice
here is folklore:

- GitHub's own pages on [securing a Pages site with HTTPS][gh-https] and
  [troubleshooting custom domains][gh-tsh] **do not mention CDNs, proxies or Cloudflare at all.**
  They say certificate provisioning depends on the DNS records resolving to GitHub's infrastructure,
  that stray `A`/`AAAA`/`ALIAS`/`ANAME`/`CNAME` records "may prevent the HTTPS certificate from
  generating", and that the fix for a stuck certificate is to remove and re-add the custom domain.
  So the DNS-only step is **inference from those requirements, not documented GitHub guidance.**
- Cloudflare's side is clearer. Its community guidance is that using GitHub Pages with Cloudflare
  requires disabling the HTTP proxy, and that under **Full (strict)** Cloudflare blocks the HTTP
  validation GitHub uses to issue a certificate — see [the Cloudflare community thread][cf-gh] and
  [Full (strict) mode][cf-strict].

**Therefore the sequence, stated as a proposal to verify and not as fact:** set the record to
DNS-only (grey cloud), wait for GitHub to issue the certificate and for *Enforce HTTPS* to become
available, then re-enable the proxy if it is wanted. **Confirm before running it** — if GitHub's
certificate does not cover the hostname once the proxy is back on, Full (strict) returns
[error 526][cf-526].

- **SSL mode.** If Cloudflare is set to **Flexible**, the Cloudflare→GitHub leg is plaintext while
  the padlock still shows for visitors. It should be **Full (strict)**, which
  [requires a valid publicly-trusted certificate on the origin][cf-strict] — which GitHub provides
  once provisioning has succeeded. Check this first: it is the item with a real security consequence,
  and it is independent of whether *Enforce HTTPS* is ever turned on.
- **Bytes served are not bytes built.** See item 0.

**Nothing changed. This is DNS and a third-party dashboard, outside anything authorised here.**

[gh-https]: https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https
[gh-tsh]: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages
[cf-gh]: https://community.cloudflare.com/t/github-pages-require-disabling-cfs-http-proxy/147401
[cf-strict]: https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/
[cf-526]: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-526/

### 2. Caching

Pages serves `cache-control: max-age=600`. After a deploy, expect up to ten minutes of stale HTML at
the edge. A cache-busting query (`?cb=…`) confirms the origin immediately. If Cloudflare caching is
enabled for HTML, purge after deploys or the window is longer.

### 3. Verify after any future deploy

```bash
curl -sS "https://constitution.stmorg.in/?cb=$(date +%s)" | grep -c "/OpenCodeLaw/"   # must be 0
curl -sS -o /dev/null -w "%{http_code}\n" https://constitution.stmorg.in/styles/tokens.css
curl -sS "https://constitution.stmorg.in/?cb=$(date +%s)" | grep -oE '<link rel="canonical"[^>]*>'
curl -sS "https://constitution.stmorg.in/?cb=$(date +%s)" | grep -c "cdn-cgi/l/email-protection"  # must be 0
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
