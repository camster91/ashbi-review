# V1 release handoff

## Prepared code

Stacked PRs: #9 foundation → #10 proxy → #11 images → #12 website pins → #13 guests/login/email → #14 screenshots/polish. Keep the one Worker, D1/R2/BROWSER/static-assets bindings and 15-minute Cron. Additive migrations 0003–0006 are prepared, not applied remotely. The live Worker remains the earlier #10 proxy proof.

## Cameron actions before live acceptance

- Add repository secret CLOUDFLARE_API_TOKEN. CLOUDFLARE_ACCOUNT_ID is already present.
- Configure a Resend-verified sender and Worker secrets RESEND_API_KEY and EMAIL_FROM. Never put values in issues, PRs or commits.
- Explicitly approve the reviewed merges and new production deployment/migrations. No code here authorises itself to merge or deploy.
- Supply the protected Shopify staging password/access if that authentication round trip must be verified. Browser captures may still be blocked by bot protection or show a password wall.
- Approve an inventory/migration of active MarkUp reviews and, after acceptance, cancellation. Neither operation has been performed.

DNS/custom domain are already provisioned on Cameron's Cloudflare account. No new DNS change is needed for the app. Resend domain verification may require its own DNS records, subject to approval.

## Live acceptance after approved release

1. Verify the actual push-to-main Action applied remote D1 migrations before deploying; /api/health reads D1, and dashboard/API/assets share the Worker. Check deployed binding/secret names and Cron trigger.
2. Request separate Cameron and Bianca magic links. Verify each real inbox, single use, sign-out and dashboard protection.
3. Upload a real PNG/JPG/WebP (and reject >25 MB), create/share a review, and use a fresh phone session to enter a name, pin/reply/reload. Reply and resolve as operator; confirm guests cannot resolve or access projects. Turn the share link off and verify access is revoked.
4. Verify one real email digest reaches both operators after the next 15-minute interval, no duplicate in a quiet interval, and new comments remain queued until their next digest.
5. Verify BROWSER Quick Actions save each website pin's capture to private R2, and screenshot mode displays a saved full-page surface with persistent image pins. Retry a failed capture without losing feedback. Captures render the original saved URL at the recorded width; signed-in state, animations or client-side form values can differ from the guest's live document.
6. Repeat the five-site proxy matrix with current code and actual 390/768/1440 iframe widths. Keep sandbox isolation. Use screenshot/image fallback when the site is incompatible; do not call password authentication a pass without the round trip.
7. Inventory then migrate approved active MarkUp reviews. Have Cameron validate them before the separately approved cancellation.

## Recovery

Code rollback uses a revert PR and the normal Action. Preserve D1/R2 and forward-repair additive migrations. Review/comment capture failures show a retry state; saved comments and notification queues survive. Email retries use durable frozen payloads and Resend idempotency (24-hour provider window); reconcile prolonged uncertain sends before manual retry. Retain old capture objects because existing pins may reference them.
