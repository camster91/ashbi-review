# Proxy proof — issue #3

Implementation is on `issue-3-proxy-proof`, based on `issue-2-worker-setup`. This is a proof, not approval to start #4.

## Runtime contract

The source URL is saved in D1. Entry: `/p/{reviewId}/{shareToken}/`. The proxy redirects to an origin-keyed path and preserves the original page path, query and fragment in rewritten links. Every request checks the review, token, expiry, enabled flag and screenshot-mode flag. Source and resource origins must already be saved on that review; guests cannot change them. No public create-review endpoint exists before operator authentication is built in #6. For this proof, create records through local D1 or an operator-controlled migration, never a tokenless setup endpoint.

HTMLRewriter handles href, src, srcset, action, inline styles, style blocks, base URLs and common WordPress lazy image attributes. Stylesheets rewrite url() and quoted @import. Redirects are manual and must stay within saved origins. Cookies are renamed and scoped to the review and upstream origin, with upstream names restored only on matching proxy requests; dashboard cookies and Authorization headers never go upstream. Upstream X-Frame-Options, CSP and security side-effect headers are removed. An app-owned CSP sandboxes untrusted pages **without allow-same-origin**, keeping their scripts out of dashboard storage and cookies. The test overlay logs a selector, element x/y %, viewport and scroll, and drops a temporary dot in comment mode. It does not persist comments.

Saved source and optional `allowed_origins` must be public HTTP(S) origins. Literal/private/local hosts, embedded credentials and unusual ports are rejected. `global_fetch_strictly_public` protects runtime fetches; no redirect is followed without revalidation. Proxy responses are no-store and no-referrer, and invocation logging is disabled because share tokens are in paths.

## Compatibility limits to verify

- Unsaved external resources stay absolute and load directly; they are never fetched by the Worker. Save required CDN origins per review to proxy them. External redirects stop with a fallback message rather than silently broadening the allowlist.
- URLs constructed by JavaScript (fetch/XHR, window.location, dynamic DOM assets), ES module imports, WebSockets, service workers, SRI-dependent scripts and some cross-origin font/API requests need real-site testing. This proof rewrites HTML and CSS, not arbitrary JavaScript.
- Staging form submissions and upstream cookies have automated coverage, but browser sandbox and third-party cookie policies may prevent interactive logins. HTTP Basic Auth is not implemented. Do not put passwords in source URLs. Password storage and screenshot capture remain unimplemented.
- Screenshot mode is a saved flag that blocks proxy access; the actual Browser Rendering fallback belongs to #7.
- CSS escaping and advanced srcset edge cases need real-browser coverage. This is not a general-purpose transparent browser proxy.

## Required real-site gate

| Site type | Candidate | Result | Evidence needed |
| --- | --- | --- | --- |
| WordPress / Elementor | dellarice.com | Not tested | Deployed proxy, desktop/mobile render, links, assets, test dot |
| Shopify | drinkmomwater.com | Not tested | Same checks, JS menus and product navigation |
| WP Engine staging | Confirm an actual client staging URL | Not tested | Staging URL and access, then same checks |
| Astro / static | lalalandnails.ca | Not tested | Same checks at 1440, 768 and 390 px |
| Password-protected staging | Confirm an actual protected review URL | Not tested | Staging URL/access and complete login/cookie round trip |

No pass/partial/fail is assigned until a real site runs through the actual proxy. Direct origin reachability and mocked unit tests are not compatibility passes. More than two failed sites requires Cameron's decision before #4. An incomplete matrix also leaves the gate open.

## Current blocker

The repository has no remote branches or commits. The initial README push to main was rejected by automatic approval review because the requested workflow is branch/PR based. CLI Git also lacks credentials. Approving a single README seed commit through the connected GitHub app will establish main so the prepared branches and PRs can be uploaded. No production deployment, real-site pass or CI pass is claimed. Repository deployment secrets have not been set or verified.
