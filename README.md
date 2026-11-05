# Ashbi Review

One Hono/TypeScript Worker serves the API, isolated website proxy and React/Vite dashboard. D1 stores reviews, R2 stores private images, `BROWSER` provides screenshot capture and a 15-minute Cron batches comment emails. PDFs are V2.

## Setup and deploy

1. Use Node 22+, then `npm ci && npm run build`.
2. `wrangler.jsonc` contains the provisioned D1 `DB`, R2 `FILES`, Browser Rendering `BROWSER`, static assets and `review.ashbi.ca` custom-domain route. Keep these bindings on the same Worker.
3. Add GitHub repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` with Workers deployment, D1, R2 and ashbi.ca route permissions. Every push to `main` runs required checks, applies remote D1 migrations, then runs `wrangler deploy`. The domain is already provisioned; no new DNS record is needed.
4. For email, set Worker secrets `RESEND_API_KEY` and `EMAIL_FROM` (a Resend-verified sender). `APP_ORIGIN` is the canonical app URL. The access migration seeds separate `cameron@ashbi.ca` and `bianca@ashbi.ca` accounts; no public signup. Magic links last 15 minutes and work once; sessions last 30 days. Never commit secrets.
5. Local development: apply migrations with `npx wrangler d1 migrations apply DB --local`, build, then `npx wrangler dev --infer-origin-from-routes false`. The optional local-only `DEV_OPERATOR_TOKEN` requires 32+ characters in ignored `.dev.vars`; send it as a bearer header from a local development client. Production hostnames reject that gate. Vite can read the same server-only key from ignored `.env.local` for image/API development; never use a `VITE_` secret.
6. Verify with `npm run check && npm test && npm run build`. For Chromium acceptance: `npx playwright install chromium && npm run test:e2e`. Tests use local D1/R2 and synthetic credentials; email tests mock Resend. Real inbox delivery and push-to-main deployment need separate live verification.

Share links are private bearer links with optional expiry and an off switch. Guests enter a name once; they can comment/reply, but cannot resolve or access the dashboard. Script-heavy/password-protected sites may need screenshot mode. Keep proxy sandbox isolation enabled.

`/api/health` checks D1. Roll back code with a revert PR; migrations are additive and should be forward-repaired. Preserve D1/R2. Placeholder name: **Ashbi Review**. Current implementation and acceptance evidence are tracked in issues #2–#7 and their stacked PRs; unmerged code is not live.
