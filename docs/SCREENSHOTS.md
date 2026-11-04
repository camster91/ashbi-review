# Screenshots and fallback — issue #7

Browser Rendering uses the existing BROWSER binding's Quick Actions API, with no new provider/token/SDK. The configured compatibility date is 2026-08-22: new enough for Quick Actions and the newest date supported by the installed Workers test runtime. The screenshot request is generated from the saved review origin and a validated same-origin page path, using a supported 390/768/1440 viewport. Captures are PNG, full-page, uncached and bounded to 25 MiB before private R2 storage.

Website pins save comments first and capture in request-bound background work. Capture failure is visible and retryable without losing feedback. Snapshot mode reuses the numbered image pin layer and thread/status interface. The operator captures the selected page/width; guests comment on that immutable full-page image. A pin on a snapshot reuses the existing capture object. Refreshing a review retains old objects because old pins can still reference them. All capture reads require operator access or that review's valid guest link.

Captures render the saved original URL in a new managed browser. They preserve page/viewport context, but do not reproduce signed-in cookies, transient animations, consent state or unsaved form inputs from a guest's current browser. Password walls and bot-protected sites may require an uploaded screenshot instead. These limitations are shown in the UI; no exact interactive-state guarantee is claimed.

Quick Actions are unavailable in local emulation. Local API routes report this explicitly; the comment remains saved, and existing snapshot fixtures still work. Unit tests use a fake Browser Rendering response with real local D1/R2. Chromium fallback tests seed a local uploaded image as a saved capture and exercise the real dashboard/pin API. A new approved deployment is required to verify the real BROWSER→R2 binding path.

Official references: https://developers.cloudflare.com/browser-run/quick-actions/ and https://developers.cloudflare.com/browser-run/quick-actions/screenshot-endpoint/ .

No production deploy, live client migration or MarkUp cancellation has been performed. See RELEASE.md for the exact pending acceptance and Cameron actions.
