# Alejo Motors public catalog â€” Static Site migration

Date: 2026-08-13
Branch: `codex/public-catalog-completion`
Production status: **not deployed, changed, renamed or removed**

## Audit result

GitHub `main` already contains the modern static build, while the current Render Web Service still serves the older dealer-enabled deployment. Visitors to production therefore still see the legacy navigation and may depend on the free Node service starting. This branch completes the modern catalog without changing that service.

The public visitor experience can be a Static Site. Authentication, inventory mutation, Deal Desk, private sales, document generation and lead persistence require a backend and now belong to Vehicle Manager. The static output does not publish `server.mjs`, `deal-desk.js`, dealer HTML/CSS or private data.

After confirming the replacement build and Vehicle Manager endpoints, the preview branch removes the obsolete public runtime and visitor/admin bundle: `server.mjs`, `deal-desk.js`, old `index.html`, `script.js`, `styles.css`, `detail.html`, `detail.js` and the old backend deployment note. These files remain recoverable in Git history and remain untouched on the production branch. Sales-document/template modules and their tests are retained byte-for-byte but are not included in `dist`.

## Prepared architecture

`Vehicle Manager (private D1/R2/Drive) â†’ versioned public-inventory snapshot â†’ Render CDN static catalog`

The build produces a complete last-known-valid `dist/data/public-inventory.json` and pre-renders current available cards into `index.html`. Browser JavaScript displays that copy immediately, keeps a last valid local copy and optionally revalidates against Vehicle Manager in the background. Empty/corrupt/live failures never replace a valid catalog.

The v1 contract publishes only public ID, stock, year/make/model/trim, price, mileage, public mechanical/color/title fields, public description, responsive photos, status and publication/update timestamps. It does not publish VIN. Tests reject known private fields and literal secrets.

## Static build contents

- `static-src/index.html`: complete `All Inventory | Cars | SUVs | Trucks | Sold | Contact` navigation, available vehicles first, exact available count, search/filters, exactly three recently sold and contact form.
- `static-src/sold.html`: every sold vehicle, ordered by valid `soldAt` descending with deterministic update/ID fallback, historical details only and no purchase actions.
- `static-src/detail.html` and `detail.js`: direct `detail.html?id=â€¦` support, touch gallery, one initial detail image, thumbnails, share, structured Vehicle data and fixed mobile Call/Text/WhatsApp actions.
- `scripts/build-static.mjs`: sanitized contract, pre-rendered cards, fingerprinted CSS/JS, WebP variants and cache files.
- `scripts/preview-static.mjs`: local-only preview server.
- `tests/static-site.test.mjs`: public-data, no-admin/no-secret, pre-render, responsive-image and cache/route tests.
- `render-static-site.yaml`: separate static service blueprint with auto-deploy disabled. Existing `render.yaml` remains the current Web Service blueprint.

Original images remain in the private/legacy source. Static output generates approximately 400 px thumbnail, 800 px card and 1400 px detail WebP variants without enlarging small originals. Cards use `srcset`, dimensions, eager loading only for the first visible available cards and lazy loading for the rest. A detail page loads one detail image and thumbnail variants until the visitor navigates.

## Render Static Site settings

Create a **new** Static Site only after approval:

- Repository: `sergioard1/alejo-motors`
- Branch: `codex/public-catalog-completion` for acceptance; later use the approved release branch
- Root directory: repository root / blank
- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm run build`
- Publish directory: `./dist`
- Auto deploy: disabled until cutover approval
- Node: 20 or newer

Non-secret build variables:

- `CONTACT_PHONE=+16789271739`
- `PUBLIC_INVENTORY_ENDPOINT=https://<vehicle-manager-host>/api/public-inventory`
- `PUBLIC_LEAD_ENDPOINT=https://<vehicle-manager-host>/api/public-leads`

Vehicle Manager must allow the preview/static origin in `PUBLIC_SITE_ORIGINS`. No admin password, GitHub token, Drive secret or OpenAI key belongs on the public site.

Blueprint rewrites:

- `/detail` â†’ `/detail.html`
- `/vehicle` â†’ `/detail.html`
- Existing `detail.html?id=â€¦` links continue unchanged.

Fingerprint assets/media use one-year immutable cache; public data revalidates after 60 seconds with a one-day stale fallback; HTML is revalidated. Render will also serve static assets from its CDN with Brotli and HTTP/2.

## Local verification

- Static build: passed, 9 vehicles (3 available, 6 sold).
- Static tests: 6/6 passed.
- Preserved document/math regression tests: 10/10 passed (16 total public-repository tests).
- Browser: three available cards and three sold cards render; no Dealer Login text; `deal-desk.js` is not requested; detail link opens directly; 11-photo gallery, structured data and all contact links work; no horizontal overflow at the available desktop viewport.
- Public output scan: no admin variables, GitHub token, password or API key.
- Output: 36.76 MB total for all variants versus 54.09 MB originals; critical CSS 9.4 KB and minified JavaScript 11.5 KB before transfer compression. Only visible card images are requested on initial load.
- A visual test caught and fixed the stale loading overlay on vehicle details.

Observed audit comparison on 2026-08-01:

| Measurement | Current Web Service | Prepared static output |
| --- | ---: | ---: |
| First HTML TTFB after sleep | 12.383 s | CDN preview pending |
| Warm HTML TTFB | 0.193â€“0.250 s | CDN preview pending |
| Live inventory API | 0.691 s | Not required for first catalog render |
| Original image repository | 54.09 MB | 36.76 MB for all 273 responsive variants |
| Initial local critical files | Server/API dependent | about 428 KB before Brotli, including the first three vehicle photos |
| Public JS | Includes administration/Deal Desk | 11.5 KB minified; no administration |

The static architecture removes the measured 12.383-second cold-start path because HTML and the last valid catalog are build artifacts served from Render's CDN. Final sub-1/2/2.5-second goals must be confirmed with Lighthouse against the actual CDN preview; they are not claimed from localhost measurements.

No hosted preview URL exists because this branch was not pushed and no Render service was created, per the production restriction. Local preview: `pnpm run preview` after `pnpm run build`.

## Two-stage publication and acceptance

1. Present these branch results and obtain explicit approval before any push or deployment.
2. Deploy Vehicle Manager first and configure the two public endpoints plus exact CORS origins.
3. Update the current Web Service from the approved modern build so `alejo-motors.onrender.com` keeps its URL; retain its previous Render deployment for rollback.
4. Create the independent Static Site only after the Web Service is verified, then run clean-cache, warm-cache, slow-network and backend-unavailable tests on its new URL.
5. Publish/update/reorder/unpublish/sell in staging and verify versions, checksums and last-valid fallback.
6. Test direct detail URLs, search/filter, gallery/share, contact form/idempotency and Call/Text/WhatsApp on iPhone, Android, iPad/tablet, laptop and desktop.
7. Run Lighthouse against the real CDN preview and inspect its files/network requests for private data or admin code.
8. Move custom-domain traffic only after a second explicit approval.

## URL and cutover strategy

A new Render Static Site receives a different `onrender.com` hostname. Do not assume the existing `alejo-motors.onrender.com` hostname can be reassigned. The safest durable option is a custom Alejo Motors domain: attach it to the verified static preview, lower DNS TTL in advance, switch DNS only after acceptance, keep the old Web Service running, and monitor leads/inventory.

If the existing Render subdomain must be retained, contact Render support and obtain confirmation before touching the old service. Do not delete the Web Service to â€œfreeâ€ the name without written confirmation and a rollback path.

## Rollback

Keep the current Web Service, branch and data unchanged. If the static cutover fails, point the custom domain back to the Web Service, remove/disable the static custom-domain mapping, restore the last valid public snapshot and verify contact actions. Because the manager database and existing service are not deleted or migrated during cutover, rollback does not require reconstructing private data.

## Remaining risks/manual items

- The six old public records have limited/blank stock metadata in the legacy JSON; Vehicle Manager becomes authoritative after staging sync.
- CDN preview performance and real mobile screenshots require the not-yet-created preview service.
- Lead delivery requires the Vehicle Manager endpoint and exact-origin CORS configuration.
- Stable public image hosting must be verified in the preview; original protected files remain in Vehicle Manager/Drive.
- No production deployment, DNS change, Render service action or public data mutation has been performed.
