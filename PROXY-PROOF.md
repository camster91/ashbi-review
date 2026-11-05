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

| Site | Result | What was verified / limitation |
| --- | --- | --- |
| WordPress / Elementor — dellarice.com | Partial | Page, rewritten links, CSS and test pins load. Several image slots were blank in the browser despite a sampled proxy image returning valid PNG; upstream scripts report syntax/wp errors. Needs visual/resource follow-up. |
| Shopify — drinkmomwater.com | Partial | Page and test pins load. Cart fetches, age-check and analytics scripts hit sandbox cookie/localStorage restrictions; dynamically generated URLs can leave proxy paths. |
| WP Engine — goldfishproper.wpenginepowered.com | Partial | Page, embedded hero video and test pins load. Scripts hit sandbox localStorage/cookie restrictions. |
| Astro/static — lalalandnails.ca | Partial | Homepage and Services & Pricing navigation work; test pins work on both pages. Visible images load. Responsive verification is pending: the viewport override did not change measured innerWidth. |
| Password-protected Shopify staging — della-rice-1hj0pj1j.myshopify.com | Partial | Redirect to /password stays in proxy; password form and overlay load. Authentication round trip was not tested without the store password. |
The table records limited live proof results; partial does not establish full compatibility. Direct origin reachability and mocked unit tests are not compatibility passes. More than two failed sites requires Cameron's decision before #4. An incomplete matrix also leaves the gate open.

## Current gate

The approved README-only seed is on main. Foundation PR #9 and stacked proxy PR #10 are open and CI is green. The PR #10 code is deployed through Cloudflare MCP on review.ashbi.ca; DB/FILES/BROWSER and actual Workers static assets are attached. Both migrations are applied and recorded; /api/health returns ok with D1.

The initial five-site live matrix is recorded on issue #3. All five are partial: four accessible pages support the test overlay; the protected Shopify staging site reaches its password form. WordPress/Shopify scripts show sandbox cookie/storage restrictions; Della has blank image slots needing follow-up. La La Land's home and Services & Pricing navigation and test dots work. A password round trip and mobile/tablet viewport checks are still unverified. The attempted viewport override did not change measured innerWidth, so no responsive pass is claimed.

The proxy remains experimental; screenshot fallback is needed for script-heavy or authenticated sites. #4 remains unstarted. GitHub automatic deployment still requires CLOUDFLARE_API_TOKEN; CLOUDFLARE_ACCOUNT_ID has been added. The MCP deployment does not satisfy the automatic deployment acceptance criterion. PRs are unmerged.
