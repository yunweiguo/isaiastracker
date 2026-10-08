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

`pnpm refresh` downloads official data. When IndexNow is disabled (the default), it does not submit anything to search engines. The initial page request can also populate the cache. No fabricated weather data is bundled. If the source fails before any data is saved, the site shows an unavailable state and an official-source link.

```sh
pnpm test
pnpm check
pnpm build
pnpm start
```

## What is implemented

- Featured active storm on the homepage; a fixed URL per storm and year.
- Leaflet forecast track, official cone, forecast points and time slider.
- Five Gulf Coast city views with local NWS alerts, city time zones, source links and an explicit representative-coordinate limitation.
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

`pnpm dev` and `pnpm start` still use atomic local files in `DATA_DIR`; Workers uses the `WEATHER_DATA` R2 binding whenever `WEATHER_STORAGE=r2`. Never enable that mode on a plain Node server. In-process request deduplication only coordinates one isolate; R2 provides shared persistent snapshots. If concurrent refresh traffic becomes significant, serialize refreshes with a Durable Object.

Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS origin before `pnpm build`. Public env variables are compiled into the client. Localhost defaults to `noindex` and an empty sitemap. Preview deployments should retain a localhost/non-public configuration or be protected from indexing by the hosting platform. Do not point a preview at your production analytics origin.

Set `NHC_USER_AGENT` to identify the app and provide a real contact address. The default OpenStreetMap tile service is suitable for modest interactive use subject to its policy, not an unlimited tile CDN. Configure `NEXT_PUBLIC_MAP_TILE_URL` and attribution for the chosen production provider. Do not prefetch tiles or remove attribution.

The source fonts use Google Fonts, with system fallbacks if unavailable. No data-source API key is required for NHC or NWS.

## Analytics

Configure these public settings before building:

| Variable                           | Value                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_GA_ID`                | GA4 measurement ID, `G-…`                                                       |
| `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` | Site-specific script URL from Plausible, e.g. `https://plausible.io/js/pa-….js` |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`     | Optional domain for legacy/self-hosted script compatibility                     |

Analytics loads automatically in production mode when the browser origin exactly matches the configured public HTTPS origin. Neither provider is loaded on local development or a different preview hostname. There is no consent prompt or saved consent preference. Google Analytics may set analytics cookies; advertising storage, Google signals and ad personalization remain disabled. Plausible is loaded independently for aggregate cookie-free tracking. The privacy page reflects configuration.

**Disable history-change page views in GA4 Enhanced Measurement** because the application sends its own initial and client-navigation `page_view` events with `send_page_view: false`. Keeping both would double count SPA navigation. Do not add another GA/Tag Manager snippet.

Optional tool events: `Select city` (city slug only), `Toggle cone`, `Explore forecast`. Define matching custom-event goals in Plausible if desired. Search-box text and user coordinates are never included. Verify final delivery with GA Realtime/DebugView and Plausible's installation check after real IDs and domain are set; local verification does not prove production dashboard receipt.

## Refresh and IndexNow

Generate `CRON_SECRET` and `INDEXNOW_KEY` locally and save in `.env.local` or the deployment secret store. Do not commit them or place `CRON_SECRET` in a public variable. IndexNow requires its verification key to be publicly served by the dedicated text route; it is separate from the private refresh secret.

The protected `GET /api/cron/refresh` expects `Authorization: Bearer <CRON_SECRET>`. Cloudflare's configured Cron Trigger invokes it every five minutes. For a separate Node deployment, schedule `pnpm refresh` on that host. No public endpoint accepts arbitrary URLs for submission. The script/endpoint checks official updates and local alerts, stores snapshots and submits canonical pages only when content changes. Data refresh continues to work when indexing is disabled. Open browser tabs also refresh server data every five minutes while visible.

Before enabling IndexNow:

1. Configure the final public HTTPS origin and deploy.
2. Set `INDEXNOW_KEY` to 8–128 allowed characters; the root `/<key>.txt` route must return that exact key.
3. Set `INDEXNOW_ENABLED=true` and run the refresh once.
4. Verify the scheduler and subsequent refresh responses. `received` (200) means accepted, not indexed; `pending-key-validation` (202) means verification is pending.

Submissions use `api.indexnow.org`, which supports participating engines including Bing. IndexNow does not submit pages to Google. Add the sitemap in Google Search Console and Bing Webmaster Tools. Set their verification values using the two `NEXT_PUBLIC_*_SITE_VERIFICATION` variables.

On HTTP 429, the app saves the `Retry-After` deadline in R2 (one hour when absent) and resumes submissions on a later scheduled refresh. Weather continues updating during this wait; unaccepted content is never marked as submitted.

## SEO page ownership

- `/`: the featured storm tracker and city-selection entry point; dynamic title such as “Isaias Tracker 2026: Path Map & Local Alerts”.
- `/storms/2026/isaias-al092026`: detailed forecast table and advisory changes; permanent storm identity.
- `/storms/2026/isaias-al092026/pensacola`: local alerts and forecast sources for the selected city.
- `/about`, `/privacy`: methodology and data practices.

Each page uses its own canonical URL. Unsupported storm/city routes return 404; alternate storm slugs redirect to the canonical slug. Map state does not create indexable URL permutations. Sitemap dates derive from weather publication times, not the time of each sitemap request. City alert-only changes are also submitted by IndexNow. Keep city-page expansion tied to meaningful local data and measured search demand.

## Verification

`pnpm test` covers upstream validation/host restrictions, wind conversions, forecast sorting, no-data states, cached fallback, refresh authorization and IndexNow key/URL restrictions. Browser checks cover city search/navigation, cone toggle, forecast slider, responsive overflow, console errors and local analytics suppression. Weather data may legitimately be empty; an empty NWS response must not be presented as “safe”.

With a production server running on port 3100, run `pnpm test:smoke` to check HTTP status codes, including real 404 responses for invalid routes. Set `TEST_BASE_URL` to check a different local server.

With the site open in gstack browse, run `browse eval scripts/check-analytics.js` to check automatic analytics loading, one script per provider and absence of the consent UI. Run after a fresh visit and again after client navigation; network responses verify actual delivery separately.

Official references: [NHC current products](https://www.nhc.noaa.gov/CurrentStorms.json), [NWS API](https://www.weather.gov/documentation/services-web-api), [IndexNow](https://www.indexnow.org/documentation), [Plausible installation](https://plausible.io/docs/plausible-script), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
