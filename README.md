# Stormscope

Next.js + TypeScript hurricane tracker using NHC forecasts and NWS local alerts. The ShipAny vinext template was evaluated; its auth, payments, database and Workers compatibility layer are unnecessary for this public tool, so this project uses a small standard Next.js application instead.

## Run

Use Node 22+ and pnpm 11+.

```sh
pnpm install
cp .env.example .env.local
pnpm refresh
pnpm dev
```

`pnpm refresh` downloads official data. When IndexNow is disabled (the default), it does not submit anything to search engines. All page, metadata, sitemap and alert API reads are read-only; run the refresh explicitly before local browsing. No fabricated weather data is bundled. If the source fails before any data is saved, the site shows an unavailable state and an official-source link.

```sh
pnpm test
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
pnpm start
```

## What is implemented

- Fixed featured storm on the homepage, including its saved archive; a fixed URL per storm and year.
- Leaflet forecast track, official cone, forecast points and time slider.
- Five Gulf Coast city views with local NWS alerts, browser-local timestamps, source links and an explicit representative-coordinate limitation.
- Server-rendered status, forecast table and alert content. Map interaction is client-side.
- Last-good weather snapshots, archived storms, previous-advisory wind/pressure comparison and source/freshness warnings. Different product publication times remain visible.
- GA4 analytics, Plausible, sitemap, robots, canonical URLs, Open Graph image, breadcrumbs, Google/Bing site-verification tags.
- Protected refresh endpoint and change-triggered IndexNow submissions, with key-file verification and retry on the next refresh when submission fails.

Individual spaghetti-model tracks and precise city wind-arrival calculations are not implemented. The site links to official wind-arrival graphics and to model guidance. The displayed map is explicitly the official NHC forecast.

## Deployment model

The production domain is `https://isaiastracker.site` (without `www`). `.env.example` contains this canonical origin, GA measurement ID and the site's Plausible script URL. Copying these settings enables indexable production metadata. For a non-indexable preview build, override `NEXT_PUBLIC_SITE_URL=http://localhost:3000` before building. IndexNow is enabled in the production Wrangler configuration after public key verification; it remains disabled for local Node runs. The `workers.dev` alias and preview URLs are disabled to avoid an extra public copy.

Production runs on **Cloudflare Workers through OpenNext**, with weather snapshots in the private R2 bucket `isaias-tracker-weather`. `wrangler.jsonc` binds the domain and schedules a refresh every five minutes. `worker.ts` invokes the protected Next.js refresh handler from the scheduled event. No external cron service is needed.

```sh
pnpm build:cf
pnpm preview:cf --port 8787
TEST_BASE_URL=http://localhost:8787 pnpm test:smoke
pnpm deploy
```

For local Workers preview, set `INDEXNOW_ENABLED=false` in `.dev.vars` so manual refreshes do not submit production URLs.

Set `CRON_SECRET` and `INDEXNOW_KEY` with `pnpm exec wrangler secret put <NAME>` (enter values at the prompt). Use ignored `.dev.vars` for local Workers secrets. Keep secret values out of `.env.local` for Cloudflare builds because OpenNext bundles Next.js environment files into the server artifact. Cloudflare runtime secrets override build-time defaults. Statistics IDs and the canonical origin are public build settings in `.env.local`.

`pnpm dev` and `pnpm start` still use atomic local files in `DATA_DIR`; Workers uses the `WEATHER_DATA` R2 binding whenever `WEATHER_STORAGE=r2`. Never enable that mode on a plain Node server. In-process request deduplication only coordinates one isolate; R2 provides shared persistent snapshots. Cron is the only automatic weather writer. Keep the protected manual endpoint for operations; do not schedule a second writer. No Durable Object is required for this model.

Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS origin before `pnpm build`. Public env variables are compiled into the client. Localhost defaults to `noindex` and an empty sitemap. Preview deployments should retain a localhost/non-public configuration or be protected from indexing by the hosting platform. Do not point a preview at your production analytics origin.

Set `NHC_USER_AGENT` to identify the app and provide a real contact address. Local `pnpm dev` can use OpenStreetMap public raster tiles under its [usage policy](https://operations.osmfoundation.org/policies/tiles/). Production builds have **no implicit tile provider**. A missing provider or tile failure shows a notice while keeping NHC overlays, server-rendered weather data and official links available.

Before a production build:

1. Choose a raster XYZ provider whose terms permit this site's commercial use and expected traffic. A paid service is not required by the code: a compliant free allowance may suffice. Confirm its account requirements, quota and any overage price before enabling it; this project does not open an account, purchase a plan or select a proxy.
2. Set `NEXT_PUBLIC_MAP_TILE_URL` to its HTTPS `{z}/{x}/{y}` endpoint and `NEXT_PUBLIC_MAP_ATTRIBUTION` to its required attribution HTML in the **build environment** (or ignored `.env.local`). Both values are compiled into the browser bundle; setting only Wrangler runtime vars is insufficient.
3. If the provider requires a browser token, restrict it to `isaiastracker.site` and the required read-only tile scope. Do not use a private/server API key or commit the token. Rebuild after changing the provider.
4. Check attribution, tile errors and usage limits before enabling public traffic. Do not prefetch tiles or remove attribution.

For Cloudflare Workers Builds, set both public map variables in the build environment before `pnpm build:cf`; for a local build, export them in the shell or use ignored `.env.local`. OpenNext runs the Next.js production build and copies its compiled client assets. Worker runtime variables and `.dev.vars` cannot change the tile URL already embedded in those assets. Rebuild and redeploy after a change. Public browser tokens are visible to visitors even when stored as build secrets; a provider requiring a private key is unsuitable for this direct browser integration.

To verify injection locally without a provider account or external tile requests, use a deliberately non-routable test endpoint (never deploy this build):

```sh
NEXT_PUBLIC_MAP_TILE_URL='https://tiles.invalid/isaias-build-check/{z}/{x}/{y}.png' \
NEXT_PUBLIC_MAP_ATTRIBUTION='Local build verification only' pnpm build:cf
rg -l --fixed-strings 'https://tiles.invalid/isaias-build-check/' .open-next/assets/_next/static
rg -l --fixed-strings 'Local build verification only' .open-next/assets/_next/static
```

Both searches must find a compiled JavaScript asset. Run `pnpm preview:cf --port 8787` and inspect the map with a saved snapshot in **local** R2: failed tiles should show a notice while the NHC layers, SSR advisory and links still work. To verify the unconfigured case, rebuild with both variables explicitly empty (`NEXT_PUBLIC_MAP_TILE_URL='' NEXT_PUBLIC_MAP_ATTRIBUTION='' pnpm build:cf`); production must not fall back to OSM. `pnpm dev` alone allows the development OSM fallback. Restore the selected provider values and rebuild before any deployment. These checks do not require a subscription or alter production R2.

The source fonts use Google Fonts, with system fallbacks if unavailable. No data-source API key is required for NHC or NWS.

## Analytics

Configure these public settings before building:

| Variable                           | Value                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_GA_ID`                | GA4 measurement ID, `G-…`                                                       |
| `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` | Site-specific script URL from Plausible, e.g. `https://plausible.io/js/pa-….js` |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`     | Optional domain for legacy/self-hosted script compatibility                     |

Analytics loads automatically in production mode when the browser origin exactly matches the configured public HTTPS origin. Neither provider is loaded on local development or a different preview hostname. There is no consent prompt or saved consent preference. Google Analytics may set analytics cookies; advertising storage, Google signals and ad personalization remain disabled. Plausible is loaded independently for aggregate cookie-free tracking. The privacy page reflects configuration.

**Disable history-change page views in GA4 Enhanced Measurement** because the application sends its own initial and client-navigation `page_view` events with `send_page_view: false`. Keeping both would double count SPA navigation. Plausible owns its own automatic [SPA pageviews](https://plausible.io/docs/spa-support); the app does not send a second manual Plausible pageview, and script IDs prevent duplicate injection. Do not add another GA/Tag Manager snippet.

Optional tool events: `select_city` (predefined city slug only), `toggle_cone`, `explore_forecast`. Update Plausible custom-event goals to these exact names. A slider interaction is counted once when its selected point changes and the interaction completes (pointer, keyboard or blur); clicking the current city does not count as a selection. Search-box text and user coordinates are never included. Verify final delivery with GA Realtime/DebugView and Plausible's installation check after real IDs and domain are set; local verification does not prove production dashboard receipt.

## Refresh and IndexNow

Generate `CRON_SECRET` and `INDEXNOW_KEY` locally and save in the deployment secret store (`.dev.vars` only for local Workers emulation). Do not commit them or place `CRON_SECRET` in a public variable. IndexNow requires its verification key to be publicly served by the dedicated text route; it is separate from the private refresh secret.

The protected `GET /api/cron/refresh` expects `Authorization: Bearer <CRON_SECRET>`. Cloudflare's configured Cron Trigger invokes it every five minutes. For a separate Node deployment, schedule `pnpm refresh` on that host. No public endpoint accepts arbitrary URLs for submission. The script/endpoint checks official updates and local alerts, stores snapshots and submits canonical pages only when content changes. Weather writes finish before IndexNow; an indexing failure returns `indexNow.status=failed` without turning a successful weather refresh into a failure. Pending changes are retried on later Cron runs, including after `Retry-After`.

NHC catalog/snapshot freshness expires after 10 minutes (two scheduled intervals); NWS freshness expires after 6 minutes (one interval plus grace). These are time-since-success checks, independent of advisory publication time. Only a fresh catalog can confirm a storm as active or archived; a missing or expired catalog makes its current activity unknown, with the last successful data-check time shown. Stale does not mean archived. Reviewed city pages are noindex and omitted from the sitemap while activity is unconfirmed.

Failed source requests preserve the complete last-good object and its `fetchedAt`; advisory time remains `storm.lastUpdate`, with map-product times shown separately. On the first sighting, if GIS times out, cannot be parsed or has no URL, the validated catalog supplies a basic snapshot with `track: null`. Classification, position, intensity, pressure and source links remain available; the map explicitly reports missing forecast layers. Its `fetchedAt` is the successful catalog-fetch time. Subsequent scheduled refreshes retry GIS and restore the full map when available. If an existing track update fails or its URL disappears, the previous advisory and geometry stay together and the page reports the mismatch/staleness. One storm's GIS failure does not block others. NWS `sent`/`expires` are validated; expired alerts are hidden. NWS refresh attempts still run if NHC is unavailable.

IndexNow stores per-canonical-page content fingerprints without `fetchedAt`. A city alert change affects only that city's approved active-storm pages; archive transitions affect the storm page and featured homepage, never archived city pages. The first run after this change baselines old archives instead of resubmitting them. Existing R2 weather object names are unchanged. Data refresh continues to work when indexing is disabled. Open browser tabs also refresh server data every five minutes while visible.

Before enabling IndexNow:

1. Configure the final public HTTPS origin and deploy.
2. Set `INDEXNOW_KEY` to 8–128 allowed characters; the root `/<key>.txt` route must return that exact key.
3. Set `INDEXNOW_ENABLED=true` and run the refresh once.
4. Verify the scheduler and subsequent refresh responses. `received` (200) means accepted, not indexed; `pending-key-validation` (202) means verification is pending.

Submissions use `api.indexnow.org`, which supports participating engines including Bing. IndexNow does not submit pages to Google. Add the sitemap in Google Search Console and Bing Webmaster Tools. Set their verification values using the two `NEXT_PUBLIC_*_SITE_VERIFICATION` variables.

On HTTP 429, the app saves the `Retry-After` deadline in R2 (one hour when absent) and resumes submissions on a later scheduled refresh. Weather continues updating during this wait; unaccepted content is never marked as submitted.

## SEO page ownership

- `/`: the featured storm tracker and city-selection entry point; stable Title “Hurricane Isaias 2026 Tracker – Path, Forecast & Updates” and H1 “Hurricane Isaias 2026 Tracker” when `FEATURED_STORM_ID=al092026`, even without data. The actual official classification is displayed separately.
- `/storms/2026/isaias-al092026`: detailed forecast table and advisory changes; permanent storm identity.
- `/storms/2026/isaias-al092026/pensacola`: city lookup and separate all-hazard NWS alerts; browsable but `noindex` until reviewed local context is configured.
- `/about`, `/privacy`: methodology and data practices.

Each page uses its own canonical URL. Unsupported storm/city routes return 404; alternate storm slugs redirect to the canonical slug. Map state does not create indexable URL permutations. Sitemap dates derive from weather publication times, not the time of each sitemap request. City alert-only changes are submitted only for approved active city pages. `cityCoverage` in `src/lib/config.ts` is an explicit storm ID + city slug map with a source URL and summary rendered on the page. It starts empty: no storm-city impact has been inferred from Atlantic/Gulf geography. Add an entry only after reviewing official geographic evidence or publishing meaningful independent local context, and remove it when no longer justified. The same `canIndexCity`/`stormUrls` rules drive metadata, sitemap and IndexNow. All existing Atlantic city lookup URLs and navigation remain usable.

The homepage is a durable informational hub (HTTP 200, indexable on the configured public origin) even when data is temporarily missing. Its SSR text explains the absence without inventing weather. Unknown or unsaved storm/detail routes return HTTP 404 with noindex; the alert API returns 503 when no snapshot exists. Archived detail pages remain indexable with archive wording and original saved official source links. Archived city pages are noindex and explicitly separate current local all-hazard alerts from historical storm data. `robots.txt` allows public pages and blocks `/api/`; it does not block noindex pages from being crawled.

Homepage and detail sitemap dates come from the saved official advisory; approved city pages also consider official NWS alert issue times. These dates never use page-render time. A snapshot can predate the final advisory if a refresh failed before the storm disappeared; “last saved” does not assert that it is the NHC's final advisory.

## Verification

`pnpm test` covers upstream validation, last-good persistence, 100 concurrent R2-only page/metadata/sitemap/alert reads, active/archived/unavailable SSR, canonical/redirect rules, city index eligibility, IndexNow change detection/failures/429 and analytics dispatch. Fixtures are test-only; no test depends on live weather or submits to real IndexNow. Browser checks cover city search/navigation, cone toggle, forecast slider, responsive overflow, console errors and local analytics suppression. Weather data may legitimately be empty; an empty NWS response must not be presented as “safe”.

With a production server running on port 3100, run `pnpm test:smoke` to check HTTP status codes, including real 404 responses for invalid routes. Set `TEST_BASE_URL` to check a different local server.

With a local production build serving a saved Isaias snapshot with at least two forecast points, run `TEST_BASE_URL=http://localhost:3100 node scripts/browser-smoke.mjs` using an existing Playwright installation (`PLAYWRIGHT_MODULE` may point to its `index.mjs`). This optional browser check blocks external traffic and checks actual city/cone/slider interactions without sending analytics.

With the site open in gstack browse, run `browse eval scripts/check-analytics.js` to check automatic analytics loading, one script per provider and absence of the consent UI. Run after a fresh visit and again after client navigation; network responses verify actual delivery separately.

Official references: [NHC current products](https://www.nhc.noaa.gov/CurrentStorms.json), [NWS API](https://www.weather.gov/documentation/services-web-api), [IndexNow](https://www.indexnow.org/documentation), [Plausible installation](https://plausible.io/docs/plausible-script), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## CI and deployment checks

`.github/workflows/ci.yml` runs frozen installation, type checking, unit tests and Next.js build on PRs and pushes to main. A separate job builds the OpenNext Worker without credentials. Neither job refreshes live weather, deploys or submits IndexNow. Node 22 and pnpm 11.24.0 match the tested environment.

Before deployment, retain the `WEATHER_DATA` R2 binding, five-minute Cron, runtime `CRON_SECRET`, `FEATURED_STORM_ID=al092026`, canonical origin and optional IndexNow settings. Populate missing snapshots through Cron or the authenticated refresh endpoint, never a page request. Observe scheduled refresh results and freshness warnings. This PR does not change production secrets or deploy automatically.

## Next step: spaghetti-model MVP (not implemented)

Use the [NHC public ATCF a-decks](https://ftp.nhc.noaa.gov/atcf/aid_public/) and [format/model documentation](https://ftp.nhc.noaa.gov/atcf/docs/): gzip-compressed comma-delimited records contain model identifiers, initialization cycles, forecast lead times and coordinates. Select a small set of documented public models from one common cycle, normalize to GeoJSON LineStrings, store under R2, and display a separately labelled model-guidance layer with run times and stale warnings. Do not mix cycles silently, depict guidance as official warnings, or call the NHC cone a spaghetti plot.

NWS government data is generally public domain [unless otherwise annotated](https://www.nhc.noaa.gov/mobile/disclaimer.html); check each selected model's provenance and redistribution annotations first. Tropical Tidbits remains a useful external link; do not republish its copyrighted graphics without permission. No API subscription or new service is assumed for public ATCF, but R2/Worker usage and maintenance still have costs.

Estimated engineering effort: 3–5 days for source/license verification, parser and validation, cycle selection, R2 persistence, map controls, accessible SSR model table and tests, plus observation across actual update cycles. A dedicated Isaias model-guidance page could serve “isaias spaghetti models” with distinct content while linking to the main tracker. Publish/index it only once real multi-model data is available; traffic and rankings are not guaranteed.
