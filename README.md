# Ashbi Review

One Hono Worker serves the API and a React/Vite dashboard. D1 stores reviews; private R2 stores files. Browser Rendering uses `BROWSER`. No server or Docker is required.

## Setup and deploy

1. Use Node 22+, run `npm ci`, then `npm run build`.
2. The `ashbi-review` D1 database and `ashbi-review-files` R2 bucket are provisioned in account `1b2e351cbb39ab6b80efe36ca3577fe5`; bindings and database ID are in `wrangler.jsonc`.
3. Add GitHub repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit, D1 Edit, R2 Edit, Workers Routes Edit and zone Read for ashbi.ca) and `CLOUDFLARE_ACCOUNT_ID` (the account above). Never commit tokens.
4. `npm run check && npm test && npm run build` verifies the foundation. For local API work: `npx wrangler d1 migrations apply DB --local`, then `npx wrangler dev`; use `npm run dev` in another terminal for Vite.
5. PRs run CI. Every push to `main` runs checks, applies remote D1 migrations, then deploys the Worker and its static assets. The custom-domain route provisions `review.ashbi.ca` automatically; do not add an unrelated A/CNAME record.

`/api/health` verifies that the core D1 migration is readable. A successful build alone does not verify a deployment. Roll back code with a revert PR; migrations are additive and should be forward-repaired, not dropped. Preserve D1/R2 when rolling back.

## V1 decisions and progress

Placeholder name: **Ashbi Review**. Cameron and Bianca will each have a magic-link login. **Resend** is the email choice: Cloudflare Email Sending currently has no configured sending subdomain on ashbi.ca. `RESEND_API_KEY` and a verified sender will be needed in step #6; neither is needed for this foundation. PDFs are V2. Follow issues #2–#7 in order and verify the proxy matrix before #4.
