import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Catalog, Snapshot, Storm } from "../src/lib/domain";

// Synthetic fixtures are test-only and never used by the production refresh.
process.env.NEXT_PUBLIC_SITE_URL = "https://isaiastracker.site";
process.env.FEATURED_STORM_ID = "al092026";
process.env.WEATHER_STORAGE = "r2";
process.env.INDEXNOW_ENABLED = "true";
process.env.INDEXNOW_KEY = "testkey1234";
const { cityCoverage, cities } = await import("../src/lib/config");
const { canIndexCity, stormPath, formatTime } =
  await import("../src/lib/domain");
const {
  getCatalog,
  getAlerts,
  resolveStorm,
  featuredStorm,
  refreshCatalog,
  refreshAlerts,
  isStale,
} = await import("../src/lib/weather");
const { indexablePageSignatures, changedPages, refreshWeather } =
  await import("../src/lib/indexnow");
const { default: Home, generateMetadata: homeMetadata } =
  await import("../src/app/page");
const { default: StormPage, generateMetadata: stormMetadata } =
  await import("../src/app/storms/[year]/[slug]/page");
const { default: CityPage, generateMetadata: cityMetadata } =
  await import("../src/app/storms/[year]/[slug]/[city]/page");
const { default: sitemap } = await import("../src/app/sitemap");
const { default: robots } = await import("../src/app/robots");
const now = new Date().toISOString();
const old = "2020-01-01T00:00:00.000Z";
// Tiny synthetic .shp line/polygon/point layers; no production weather data.
const gisZip = await readFile(
  new URL("./fixtures/forecast.zip", import.meta.url),
);
const storm: Storm = {
  id: "al092026",
  name: "Isaias",
  classification: "TS",
  intensity: 35,
  pressure: 1004,
  latitudeNumeric: 22,
  longitudeNumeric: -94.1,
  movementDir: 75,
  movementSpeed: 8,
  lastUpdate: now,
};
const snapshot: Snapshot = {
  storm,
  track: null,
  previous: null,
  fetchedAt: now,
};
const other: Snapshot = {
  ...snapshot,
  storm: { ...storm, id: "al102026", name: "Other" },
};
const archive: Snapshot = {
  ...snapshot,
  storm: { ...storm, id: "al012020", name: "Historical", lastUpdate: old },
  fetchedAt: old,
};
const catalog: Catalog = {
  storms: [storm, other.storm],
  fetchedAt: now,
  stale: false,
};
const params = Promise.resolve({ year: "2026", slug: "isaias-al092026" });
const cityParams = Promise.resolve({
  year: "2026",
  slug: "isaias-al092026",
  city: "pensacola",
});
const alert = {
  id: "test-alert",
  event: "Test warning",
  headline: "Test only",
  description: "Test only",
  instruction: "",
  severity: "Severe",
  sent: now,
  expires: new Date(Date.now() + 3600_000).toISOString(),
  url: "https://www.weather.gov/",
};
const html = (element: Awaited<ReturnType<typeof Home>>) =>
  renderToStaticMarkup(
    createElement(AppRouterContext.Provider, { value: {} as never }, element),
  );

test("snapshot reads, SEO rendering and refresh reliability", async (t) => {
  const objects = new Map<string, string>();
  let writes = 0;
  const written: string[] = [];
  const save = (name: string, value: unknown) =>
    objects.set(`${name}.json`, JSON.stringify(value));
  const symbol = Symbol.for("__cloudflare-context__");
  const oldContext = Reflect.get(globalThis, symbol);
  const oldFetch = globalThis.fetch;
  Reflect.set(globalThis, symbol, {
    env: {
      WEATHER_DATA: {
        async get(key: string) {
          const value = objects.get(key);
          return value ? { json: async () => JSON.parse(value) } : null;
        },
        async put(key: string, value: string) {
          writes++;
          written.push(key);
          objects.set(key, value);
        },
        async list() {
          return {
            objects: [...objects.keys()].map((key) => ({ key })),
            truncated: false,
          };
        },
      },
    },
  });
  const seed = () => {
    objects.clear();
    save("catalog", catalog);
    for (const s of [snapshot, other, archive]) save(s.storm.id, s);
    for (const city of cities)
      save(`alerts-${city.slug}`, {
        alerts: [],
        fetchedAt: now,
        stale: false,
      });
  };
  try {
    await t.test(
      "100 concurrent page, metadata, sitemap and alert reads never fetch or write",
      async () => {
        seed();
        save("catalog", { ...catalog, fetchedAt: old });
        save(storm.id, { ...snapshot, fetchedAt: old });
        for (const city of cities)
          save(`alerts-${city.slug}`, {
            alerts: [],
            fetchedAt: old,
            stale: false,
          });
        let fetches = 0;
        globalThis.fetch = async () => {
          fetches++;
          throw new Error("Readers must not fetch");
        };
        await Promise.all(
          Array.from({ length: 100 }, async () => {
            const [page, metadata, map, alerts] = await Promise.all([
              Home(),
              homeMetadata(),
              sitemap(),
              getAlerts("pensacola"),
            ]);
            assert.ok(page);
            assert.equal(
              metadata.alternates?.canonical,
              "https://isaiastracker.site/",
            );
            assert.ok(map.length);
            assert.equal(alerts.stale, true);
          }),
        );
        assert.equal(fetches, 0);
        assert.equal(writes, 0);
        assert.equal((await resolveStorm(storm.id))?.stale, true);
        assert.equal((await resolveStorm(storm.id))?.active, null);
        assert.match(html(await Home()), /Live status could not be verified/);
        assert.equal(isStale("invalid"), true);
        assert.equal(
          isStale(new Date(Date.now() + 60_000).toISOString()),
          true,
        );
      },
    );
    for (const failure of ["timeout", "invalid ZIP", "missing URL"] as const) {
      await t.test(
        `first snapshot survives GIS ${failure} and recovers`,
        async () => {
          objects.clear();
          written.length = 0;
          const input: Storm = {
            ...storm,
            publicAdvisory: {
              url: "https://www.nhc.noaa.gov/test-advisory.shtml",
            },
            forecastTrack:
              failure === "missing URL"
                ? null
                : {
                    zipFile: "https://www.nhc.noaa.gov/test.zip",
                  },
          };
          const healthy: Storm = {
            ...other.storm,
            forecastTrack: { zipFile: "https://www.nhc.noaa.gov/other.zip" },
          };
          let recover = false;
          let downloads = 0;
          globalThis.fetch = async (url, options) => {
            const source = String(url);
            if (source.endsWith("CurrentStorms.json"))
              return Response.json({ activeStorms: [input, healthy] });
            if (source === healthy.forecastTrack?.zipFile)
              return new Response(gisZip);
            assert.equal(source, input.forecastTrack?.zipFile);
            assert.ok(options?.signal);
            downloads++;
            if (!recover && failure === "timeout")
              throw new DOMException("Test download timed out", "TimeoutError");
            return new Response(recover ? gisZip : "not a ZIP archive");
          };
          const started = Date.now();
          const refreshed = await refreshCatalog();
          const data = (await resolveStorm(storm.id))!;
          assert.equal(data.active, true);
          assert.equal(data.stale, false);
          assert.equal(data.snapshot.track, null);
          assert.deepEqual(data.snapshot.storm, input);
          assert.equal(data.snapshot.storm.lastUpdate, storm.lastUpdate);
          assert.equal(data.snapshot.fetchedAt, refreshed.fetchedAt);
          assert.ok(Date.parse(data.snapshot.fetchedAt) >= started);
          assert.ok(Date.parse(data.snapshot.fetchedAt) <= Date.now());
          assert.deepEqual(refreshed.storms[0], data.snapshot.storm);
          assert.equal(written.at(-1), "catalog.json");
          assert.ok(written.includes(`${storm.id}.json`));
          assert.ok((await resolveStorm(healthy.id))?.snapshot.track);
          assert.equal(downloads, failure === "missing URL" ? 0 : 1);
          for (const page of [
            await Home(),
            await StormPage({ params }),
            await CityPage({ params: cityParams }),
          ]) {
            const body = html(page);
            assert.match(body, /Official classification: Tropical storm/);
            assert.match(body, /40 <small>mph/);
            assert.match(body, /1004 <small>mb/);
            assert.match(body, /22\.0°N/);
            assert.match(body, /94\.1°W/);
            assert.match(body, /Forecast track unavailable/);
            assert.match(
              body,
              /href="https:\/\/www.nhc.noaa.gov\/test-advisory.shtml"/,
            );
          }
          assert.match(
            html(await Home()),
            /<h1>Hurricane Isaias 2026 Tracker<\/h1>/,
          );
          assert.equal(
            (await homeMetadata()).alternates?.canonical,
            "https://isaiastracker.site/",
          );
          // Same advisory, but the next scheduled attempt can fill in missing GIS.
          recover = true;
          input.forecastTrack = {
            zipFile: "https://www.nhc.noaa.gov/test.zip",
          };
          await refreshCatalog();
          const restored = (await resolveStorm(storm.id))!;
          assert.equal(restored.stale, false);
          assert.equal(restored.snapshot.track?.line.features.length, 1);
          assert.equal(restored.snapshot.track?.cone.features.length, 1);
          assert.equal(restored.snapshot.track?.points.features.length, 2);
          assert.doesNotMatch(html(await Home()), /Forecast track unavailable/);
          assert.deepEqual(
            restored.snapshot.storm,
            (await getCatalog()).storms[0],
          );
          assert.equal(
            restored.snapshot.fetchedAt,
            (await getCatalog()).fetchedAt,
          );
          // A later GIS failure preserves the complete previous advisory, never mixes versions.
          const good = objects.get(`${storm.id}.json`);
          input.intensity = 55;
          input.lastUpdate = new Date(Date.parse(now) + 3600_000).toISOString();
          globalThis.fetch = async (url) => {
            if (String(url).endsWith("CurrentStorms.json"))
              return Response.json({ activeStorms: [input, healthy] });
            throw new DOMException("Test download timed out", "TimeoutError");
          };
          await refreshCatalog();
          assert.equal(objects.get(`${storm.id}.json`), good);
          assert.equal((await getCatalog()).storms[0].intensity, 55);
          assert.equal((await resolveStorm(storm.id))?.stale, true);
          assert.match(html(await Home()), /out of date/);
          input.forecastTrack = null;
          await refreshCatalog();
          assert.equal(objects.get(`${storm.id}.json`), good);
        },
      );
    }
    await t.test(
      "catalog freshness transitions preserve identity and city index rules",
      async (context) => {
        seed();
        context.mock.timers.enable({ apis: ["Date"], now: Date.parse(now) });
        cityCoverage[storm.id] = {
          pensacola: {
            summary: "Test-only reviewed context",
            sourceUrl: "https://www.weather.gov/",
          },
        };
        const assertState = async (active: boolean | null) => {
          const data = (await resolveStorm(storm.id))!;
          assert.equal(data.active, active);
          assert.equal(data.stale, active === null);
          assert.equal(
            (await featuredStorm()).data?.snapshot.storm.id,
            storm.id,
          );
          assert.deepEqual(
            (await cityMetadata({ params: cityParams })).robots,
            { index: active === true, follow: true },
          );
          assert.equal(
            (await sitemap()).some((row) => row.url.endsWith("/pensacola")),
            active === true,
          );
          assert.equal(
            (await homeMetadata()).alternates?.canonical,
            "https://isaiastracker.site/",
          );
          assert.equal(
            (await stormMetadata({ params })).alternates?.canonical,
            `https://isaiastracker.site${stormPath(storm)}`,
          );
          for (const page of [
            await Home(),
            await StormPage({ params }),
            await CityPage({ params: cityParams }),
          ]) {
            const body = html(page);
            assert.ok(
              body.includes(
                `Last successful data check: ${formatTime(data.snapshot.fetchedAt)}`,
              ),
            );
            if (active === null) {
              assert.match(body, /Live status could not be verified/);
              assert.doesNotMatch(
                body,
                /Archived \/ Last Official Advisory|advisory archive|Archived storm map/,
              );
            } else if (active === false) {
              assert.match(body, /Archived \/ Last Official Advisory/);
            } else {
              assert.doesNotMatch(
                body,
                /Live status could not be verified|Archived \/ Last Official Advisory/,
              );
            }
          }
        };
        // Active → Stale → Active; no refresh means exactly ten minutes expires.
        await assertState(true);
        context.mock.timers.tick(10 * 60_000);
        await assertState(null);
        const fresh = new Date().toISOString();
        save("catalog", { ...catalog, fetchedAt: fresh });
        save(storm.id, { ...snapshot, fetchedAt: fresh });
        await assertState(true);
        // Active → Stale → Archived → Stale.
        context.mock.timers.tick(10 * 60_000);
        await assertState(null);
        save("catalog", {
          ...catalog,
          storms: [],
          fetchedAt: new Date().toISOString(),
        });
        await assertState(false);
        context.mock.timers.tick(10 * 60_000);
        await assertState(null);
        // Missing catalog with a saved advisory cannot confirm either activity state.
        objects.delete("catalog.json");
        await assertState(null);
        objects.delete(`${storm.id}.json`);
        assert.equal(await resolveStorm(storm.id), null);
        assert.match(
          html(await Home()),
          /Official data is temporarily unavailable/,
        );
        // Unavailable → Active.
        context.mock.timers.setTime(Date.parse(now));
        seed();
        await assertState(true);
        delete cityCoverage[storm.id];
      },
    );
    await t.test(
      "active, archived and unavailable SSR preserve homepage identity and canonical",
      async () => {
        seed();
        const title =
          "Hurricane Isaias 2026 Tracker – Path, Forecast & Updates";
        assert.equal((await homeMetadata()).title, title);
        let body = html(await Home());
        assert.match(body, /<h1>Hurricane Isaias 2026 Tracker<\/h1>/);
        assert.match(body, /Official classification: Tropical storm/);
        assert.match(body, /Official advisory:/);
        save("catalog", { ...catalog, storms: [other.storm] });
        const featured = await featuredStorm();
        assert.equal(featured.data?.snapshot.storm.id, storm.id);
        assert.equal(featured.data?.active, false);
        body = html(await Home());
        assert.match(body, /Archived \/ Last Official Advisory/);
        assert.equal((await homeMetadata()).title, title);
        assert.match(html(await StormPage({ params })), /advisory archive/);
        assert.match(
          String((await stormMetadata({ params })).title),
          /Archive/,
        );
        objects.delete(`${storm.id}.json`);
        body = html(await Home());
        assert.match(body, /<h1>Hurricane Isaias 2026 Tracker<\/h1>/);
        assert.match(
          body,
          /No saved official Isaias 2026 advisory is available/,
        );
        assert.equal((await featuredStorm()).data, null);
        assert.deepEqual((await stormMetadata({ params })).robots, {
          index: false,
        });
        await assert.rejects(
          StormPage({ params }),
          /NEXT_HTTP_ERROR_FALLBACK;404/,
        );
        delete process.env.FEATURED_STORM_ID;
        assert.equal(
          (await featuredStorm()).data?.snapshot.storm.id,
          other.storm.id,
        );
        process.env.FEATURED_STORM_ID = storm.id;
      },
    );
    await t.test(
      "city browse URLs work but indexability requires explicit storm-city evidence",
      async () => {
        seed();
        assert.equal(canIndexCity(storm, "pensacola", true), false);
        assert.match(
          html(await CityPage({ params: cityParams })),
          /have not verified a connection/,
        );
        assert.deepEqual((await cityMetadata({ params: cityParams })).robots, {
          index: false,
          follow: true,
        });
        let urls = (await sitemap()).map((row) => row.url);
        assert.ok(!urls.some((url) => url.endsWith("/pensacola")));
        cityCoverage[storm.id] = {
          pensacola: {
            summary: "Test-only reviewed local context",
            sourceUrl: "https://www.weather.gov/",
          },
        };
        assert.equal(canIndexCity(storm, "pensacola", true), true);
        assert.equal(canIndexCity(other.storm, "pensacola", true), false);
        assert.equal(canIndexCity(storm, "mobile", true), false);
        assert.deepEqual((await cityMetadata({ params: cityParams })).robots, {
          index: true,
          follow: true,
        });
        urls = (await sitemap()).map((row) => row.url);
        assert.ok(
          urls.includes(
            `https://isaiastracker.site${stormPath(storm)}/pensacola`,
          ),
        );
        assert.ok(!urls.some((url) => url.endsWith("/mobile")));
        const before = await sitemap();
        assert.deepEqual(
          await sitemap(),
          before,
          "rendering must not invent lastModified",
        );
        assert.equal(
          (await cityMetadata({ params: cityParams })).alternates?.canonical,
          `https://isaiastracker.site${stormPath(storm)}/pensacola`,
        );
        await assert.rejects(
          StormPage({
            params: Promise.resolve({ year: "2026", slug: "wrong-al092026" }),
          }),
          {
            digest: "NEXT_REDIRECT;replace;/storms/2026/isaias-al092026;308;",
          },
        );
        await assert.rejects(
          CityPage({
            params: Promise.resolve({
              year: "2026",
              slug: "wrong-al092026",
              city: "pensacola",
            }),
          }),
          {
            digest:
              "NEXT_REDIRECT;replace;/storms/2026/isaias-al092026/pensacola;308;",
          },
        );
        save("catalog", { ...catalog, storms: [] });
        assert.equal(canIndexCity(storm, "pensacola", false), false);
        assert.deepEqual((await cityMetadata({ params: cityParams })).robots, {
          index: false,
          follow: true,
        });
        assert.ok(
          !(await sitemap()).some((row) => row.url.endsWith("/pensacola")),
        );
        assert.deepEqual(robots().rules, {
          userAgent: "*",
          allow: "/",
          disallow: ["/api/"],
        });
      },
    );
    await t.test(
      "change detection isolates storms and cities, including archive transitions",
      () => {
        const snapshots = [snapshot, other, archive];
        const before = indexablePageSignatures(snapshots, catalog, {
          pensacola: [],
        });
        assert.deepEqual(
          changedPages(
            indexablePageSignatures(
              snapshots,
              { ...catalog, fetchedAt: old },
              { pensacola: [] },
            ),
            before,
          ),
          [],
        );
        const alertChange = indexablePageSignatures(snapshots, catalog, {
          pensacola: [alert],
        });
        assert.deepEqual(changedPages(alertChange, before), [
          `${stormPath(storm)}/pensacola`,
        ]);
        assert.deepEqual(
          changedPages(
            indexablePageSignatures(snapshots, catalog, {
              pensacola: [],
              mobile: [alert],
            }),
            before,
          ),
          [],
        );
        const changedStorm = {
          ...other,
          storm: { ...other.storm, intensity: 50 },
        };
        assert.deepEqual(
          changedPages(
            indexablePageSignatures(
              [snapshot, changedStorm, archive],
              catalog,
              { pensacola: [] },
            ),
            before,
          ),
          [stormPath(other.storm)],
        );
        const ended = indexablePageSignatures(
          snapshots,
          { ...catalog, storms: [other.storm] },
          { pensacola: [alert] },
        );
        assert.deepEqual(
          changedPages(ended, before).sort(),
          ["/", stormPath(storm)].sort(),
        );
        assert.ok(
          !Object.keys(ended).some((path) => path.endsWith("/pensacola")),
        );
        assert.deepEqual(
          changedPages(
            indexablePageSignatures(
              snapshots,
              { ...catalog, storms: [other.storm] },
              { pensacola: [] },
            ),
            ended,
          ),
          [],
        );
      },
    );
    await t.test(
      "NHC/NWS/track failures preserve exact last-good data and timestamps",
      async () => {
        seed();
        const goodCatalog = objects.get("catalog.json");
        const goodSnapshot = objects.get(`${storm.id}.json`);
        globalThis.fetch = async () => {
          throw new Error("Offline test");
        };
        assert.equal((await refreshCatalog()).stale, true);
        assert.equal(objects.get("catalog.json"), goodCatalog);
        assert.equal(objects.get(`${storm.id}.json`), goodSnapshot);
        const goodAlerts = objects.get("alerts-pensacola.json");
        assert.equal((await refreshAlerts("pensacola")).stale, true);
        assert.equal(objects.get("alerts-pensacola.json"), goodAlerts);
        globalThis.fetch = async () =>
          Response.json({
            features: [
              {
                id: "invalid",
                properties: { event: "Test", sent: "bad", expires: "bad" },
              },
            ],
          });
        assert.equal((await refreshAlerts("pensacola")).stale, true);
        assert.equal(objects.get("alerts-pensacola.json"), goodAlerts);
        const update = {
          ...storm,
          intensity: 45,
          forecastTrack: { zipFile: "https://www.nhc.noaa.gov/test.zip" },
        };
        globalThis.fetch = async (url) => {
          if (String(url).endsWith("CurrentStorms.json"))
            return Response.json({ activeStorms: [update] });
          throw new Error("Track unavailable");
        };
        await refreshCatalog();
        assert.equal(objects.get(`${storm.id}.json`), goodSnapshot);
        assert.equal((await resolveStorm(storm.id))?.stale, true);
        assert.equal(
          (await resolveStorm(storm.id))?.snapshot.storm.intensity,
          35,
        );
      },
    );
    await t.test(
      "legacy IndexNow state preserves archive transitions without resubmitting old archives",
      async () => {
        seed();
        save("indexnow-submitted", {
          storms: [other.storm],
          signature: "legacy",
        });
        let submitted: string[] = [];
        globalThis.fetch = async (url, options) => {
          const u = String(url);
          if (u.endsWith("CurrentStorms.json"))
            return Response.json({ activeStorms: [storm] });
          if (u.includes("api.weather.gov"))
            return Response.json({ features: [] });
          if (u.endsWith("testkey1234.txt")) return new Response("testkey1234");
          assert.equal(u, "https://api.indexnow.org/indexnow");
          submitted = JSON.parse(String(options?.body)).urlList;
          return new Response("", { status: 200 });
        };
        await refreshWeather();
        assert.ok(
          submitted.includes(
            `https://isaiastracker.site${stormPath(other.storm)}`,
          ),
        );
        assert.ok(
          !submitted.includes(
            `https://isaiastracker.site${stormPath(archive.storm)}`,
          ),
        );
        assert.ok(
          !submitted.some((url) => url.includes(`${stormPath(other.storm)}/`)),
        );
        submitted = [];
        await refreshWeather();
        assert.deepEqual(submitted, []);
      },
    );
    await t.test(
      "IndexNow failure and 429 never block weather writes, pending changes retry",
      async () => {
        seed();
        let mode = "failed";
        let submissions = 0;
        globalThis.fetch = async (url) => {
          const u = String(url);
          if (u.endsWith("CurrentStorms.json"))
            return Response.json({ activeStorms: [storm] });
          if (u.includes("api.weather.gov"))
            return Response.json({ features: [] });
          if (u.endsWith("testkey1234.txt")) return new Response("testkey1234");
          assert.equal(u, "https://api.indexnow.org/indexnow");
          submissions++;
          if (mode === "failed") throw new Error("IndexNow unavailable");
          return new Response("", {
            status: mode === "limited" ? 429 : 200,
            headers: { "Retry-After": "600" },
          });
        };
        let result = (await refreshWeather()) as {
          indexNow: { status: string } | string;
        };
        assert.deepEqual(result.indexNow, { status: "failed" });
        assert.equal((await getCatalog()).stale, false);
        assert.equal((await getAlerts("pensacola")).stale, false);
        assert.ok(!objects.has("indexnow-submitted.json"));
        mode = "limited";
        result = (await refreshWeather()) as typeof result;
        assert.equal(
          (result.indexNow as { status: string }).status,
          "rate-limited",
        );
        const calls = submissions;
        await refreshWeather();
        assert.equal(submissions, calls);
        assert.ok(!objects.has("indexnow-submitted.json"));
        save("indexnow-retry", { retryAt: 0 });
        mode = "ok";
        await refreshWeather();
        assert.ok(objects.has("indexnow-submitted.json"));
        const accepted = submissions;
        result = (await refreshWeather()) as typeof result;
        assert.equal(result.indexNow, "unchanged");
        assert.equal(submissions, accepted);
      },
    );
  } finally {
    delete cityCoverage[storm.id];
    globalThis.fetch = oldFetch;
    if (oldContext === undefined) Reflect.deleteProperty(globalThis, symbol);
    else Reflect.set(globalThis, symbol, oldContext);
  }
});

test("tile configuration separates development fallback from production and keeps SSR available", () => {
  for (const [mode, url, attribution, expected] of [
    ["development", "", "", "https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    ["production", "", "", ""],
    [
      "production",
      "https://tiles.invalid/{z}/{x}/{y}.png",
      "Test attribution",
      "https://tiles.invalid/{z}/{x}/{y}.png",
    ],
  ] as const) {
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
      import assert from "node:assert/strict";
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import { mapTiles } from "./src/lib/config.ts";
      import StormMap from "./src/components/storm-map.tsx";
      assert.equal(mapTiles.url, ${JSON.stringify(expected)});
      assert.equal(Boolean(mapTiles.attribution), ${Boolean(expected)});
      if (process.env.NEXT_PUBLIC_MAP_ATTRIBUTION)
        assert.equal(mapTiles.attribution, process.env.NEXT_PUBLIC_MAP_ATTRIBUTION);
      const body = renderToStaticMarkup(createElement(StormMap, { snapshot: ${JSON.stringify(snapshot)} }));
      assert.ok(body.includes("Forecast track unavailable"));
      assert.equal(body.includes("The background map is unavailable"), ${!expected});
    `,
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: mode,
          NEXT_PUBLIC_MAP_TILE_URL: url,
          NEXT_PUBLIC_MAP_ATTRIBUTION: attribution,
        },
      },
    );
  }
});
