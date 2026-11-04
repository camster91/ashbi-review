# Image reviews — issue #4 development checkpoint

The internal dashboard API supports client-grouped projects, rename/archive/restore, private R2 image uploads, numbered image pins, threaded comments, and resolve/reopen. The React dashboard now includes client-grouped projects, upload controls, an image pin layer, threaded sidebar, status filters and sidebar-to-pin navigation. It is **not deployed**; complete local Worker/browser acceptance remains pending.

## Access boundary until #6

The temporary development gate requires both a request URL on `localhost` or `127.0.0.1` and a bearer token matching a local `DEV_OPERATOR_TOKEN` of at least 32 characters. No production hostname can use it, even if that variable is accidentally configured. Tokens are compared using SHA-256 digests and Workers' timing-safe comparison. Requests with unrelated Origin headers are rejected. There is no public setup or token-creation endpoint. Tests supply a synthetic test-only key.

For local API development only, put a fresh random `DEV_OPERATOR_TOKEN` in ignored `.dev.vars`, apply migrations with `npx wrangler d1 migrations apply DB --local`, then run `npx wrangler dev`. Send the local key in the Authorization bearer header from a development client. Never commit the file, expose the key through a Vite client variable, or set this gate up as a production login. Replace the gate with operator sessions in #6.

## Internal routes

| Method and path (under `/api`) | Behaviour |
| --- | --- |
| GET/POST `/projects` | List or create projects |
| PATCH `/projects/:id` | Rename, change client grouping, archive or restore |
| GET `/projects/:id/reviews` | List reviews without share tokens or R2 keys |
| POST `/projects/:id/reviews` | Raw image body, matching image Content-Type, optional percent-encoded X-File-Name |
| GET `/reviews/:id` | Review, ordered pins and ordered comments |
| GET `/reviews/:id/image` | Private image stream with fixed MIME type and no-store |
| POST `/reviews/:id/pins` | x_pct/y_pct (0–100), author_name and first comment body; insert atomically |
| POST `/pins/:id/comments` | Reply body, author_name, optional parent_id belonging to the same pin |
| PATCH `/pins/:id` | Status `open` or `resolved` |

Uploads read at most 25 MiB and sniff PNG/JPEG/WebP signatures instead of trusting the header or extension. HTML/SVG and mismatched MIME types are rejected. Input streams are bounded even without Content-Length. R2 objects are removed if the subsequent database insert fails. Pin number allocation is a single SQL statement; the first comment is inserted in the same atomic D1 batch. Reply targets cannot cross pins/reviews.

Migration `0003_image_reviews.sql` adds review names and comment parent IDs; it has been tested locally and is not applied remotely.

## Evidence and remaining work

40 combined Workers tests pass. The API workflow test uploads a real PNG, inserts five sequential pins, replies, resolves two and retrieves the persisted state. Concurrent creation produces unique pin numbers. Access isolation, private image reads, unsupported/spoofed formats, bounded streams, oversized requests, archive handling, field validation and cross-review reply rejection are covered. This is server-side evidence, not dashboard or mobile acceptance.

The dashboard implements these controls, loading/empty/error states, and keyboard pin placement with arrow keys and Enter. Vite development proxying reads a server-only DEV_OPERATOR_TOKEN from ignored .env.local; use the same local key in .dev.vars. The key is not exposed as a Vite client variable or included in the production bundle.

Browser Rendering rendered a synthetic fixture with one visible open pin and two threaded comments at measured widths 390, 768 and 1440, with document scrollWidth equal to innerWidth at all three. A mobile screenshot was visually inspected. These checks use mocked API data and an inline sample image; they do not establish an actual upload/save/reload flow or assistive-technology conformance.

Next: verify the five-pin/two-resolve flow through the actual dashboard at 390/768/1440 px; confirm measured viewport dimensions. Keep issue #4 acceptance checkboxes unchecked until that flow is verified. Do not start #5 before #4's reusable layer exists. No production deployment or merge is authorised by this checkpoint.
