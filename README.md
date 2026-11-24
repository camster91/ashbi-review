# Ashbi Review

A small client-feedback tool for Ashbi. Paste a website link or upload an image, share a private link, and the client clicks to leave a pinned comment. Clients need only a name; nothing is installed on their site. **Ashbi Review** is a placeholder name.

## Status

Version 0.1.0, an internal tool. The V1 code (issues #2–#7) is merged to `main`. Issues #3–#7 stay open, and [docs/RELEASE.md](docs/RELEASE.md) lists the live checks still to do: real sign-in email, the real comment digest, production screenshots and the website matrix. The website proxy is experimental: the recorded [five-site check](PROXY-PROOF.md) was partial on every site. PDF reviews are planned for V2 (issue #8).

Some files in `docs/` are dated checkpoints and still say "not deployed" or "unmerged".

## Features

- Projects grouped by client, with rename, archive and restore
- Image reviews: private PNG, JPEG or WebP uploads up to 25 MiB
- Website reviews through a sandboxed proxy, at 1440, 768 and 390 px widths
- Numbered pins that re-attach to the page element, threaded comments, resolve and reopen
- Page screenshots for pins, and a screenshot mode for sites the proxy cannot show
- Share links with optional expiry and an off switch. Guests comment and reply, but cannot resolve pins or open the dashboard
- Operator sign-in by emailed link (15 minutes, one use; sessions last 30 days). No public signup
- New guest comments are grouped into one email every 15 minutes

Script-heavy, bot-protected or password-protected sites may need screenshot mode or an uploaded image. Keep the proxy sandbox on.

## Stack

One Cloudflare Worker (Hono, TypeScript) serves the API, the website proxy and the React/Vite dashboard. `wrangler.jsonc` defines its bindings; keep them on the same Worker.

| Binding | Use |
| --- | --- |
| `DB` (D1) | Projects, reviews, pins, comments, sessions |
| `FILES` (R2) | Private images and screenshots |
| `BROWSER` (Browser Rendering) | Page screenshots |
| `EMAIL` (Cloudflare email) | Sign-in links and comment emails, to approved operator addresses only |
| `ASSETS` | Built dashboard |
| Cron, every 15 minutes | Comment email digest and expired-session cleanup |

## Local setup

Use Node 22 or newer.

```bash
npm ci
npm run build
npx wrangler d1 migrations apply DB --local
npx wrangler dev --infer-origin-from-routes false   # http://localhost:8787
```

For local operator access, put a random `DEV_OPERATOR_TOKEN` of 32 or more characters in the ignored `.dev.vars` file. Put the same value in the ignored `.env.local`, run `npm run dev` in a second terminal and open the Vite address: it adds the token to API requests. The token works only on `localhost` and `127.0.0.1`. Never give it a `VITE_` name.

| Name | Where | Purpose |
| --- | --- | --- |
| `APP_ORIGIN` | `wrangler.jsonc` | Public app URL used in emails |
| `EMAIL_FROM` | `wrangler.jsonc` | Sender address |
| `DEV_OPERATOR_TOKEN` | `.dev.vars`, `.env.local` | Local operator access only |
| `DEV_API_TARGET` | `.env.local` | Optional API address for Vite (default `http://localhost:8787`) |

## Tests

```bash
npm run check                      # TypeScript
npm run build
npm test                           # Workers tests with local D1 and R2
npx playwright install chromium
npm run test:e2e                   # browser tests; build first
```

Email and screenshot services are faked in tests, so they do not prove real delivery or capture. One browser test reads a real public website.

## Deploy

GitHub Actions only runs checks. Deployment is through Cloudflare Workers Builds on `main`. [docs/RELEASE.md](docs/RELEASE.md) specifies the build command `npm run check && npm test && npm run build` and the deploy command `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`. These settings live in Cloudflare, not in this repo.

Operator accounts are added by migration, and their addresses must also be allowed by the `EMAIL` binding. The sender domain and operator addresses must be verified in Cloudflare.

`/api/health` checks D1. Roll back code with a revert PR. Migrations are additive: repair them forward, and keep D1 and R2 data.

## Repo map

| Path | What |
| --- | --- |
| `worker/` | API, proxy, sign-in, email, screenshots |
| `src/` | React dashboard and guest review page |
| `shared/` | Pin position helpers |
| `migrations/` | D1 schema |
| `test/`, `e2e/` | Workers and Playwright tests |
| `docs/` | [Sign-in and email](docs/ACCESS-EMAIL.md), [image reviews](docs/IMAGE-REVIEWS.md), [site pins](docs/SITE-PINS.md), [screenshots](docs/SCREENSHOTS.md), [release](docs/RELEASE.md) |

Related: [markup-clone](https://github.com/camster91/markup-clone) is a separate, larger feedback tool that uses a script tag on the client site instead of a proxy.

## Licence

This repo has no licence file.
