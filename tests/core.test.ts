import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  catalogSchema,
  classification,
  forecastRows,
  knotsToMph,
  knotsToKmh,
  stormPath,
  type Track,
} from "../src/lib/domain";
import { indexNowPayload } from "../src/lib/indexnow";
import {
  getCatalog,
  refreshCatalog,
  refreshAlerts,
  getAlerts,
  writeData,
  resolvePage,
  parsePublicAdvisory,
} from "../src/lib/weather";
import { GET as refresh } from "../src/app/api/cron/refresh/route";
import { GET as keyFile } from "../src/app/[file]/route";
import { jsonLd } from "../src/lib/seo";

const storm = {
  id: "al092026",
  name: "Isaias",
  classification: "TS",
  intensity: "35",
  pressure: "1004",
  latitudeNumeric: 22,
  longitudeNumeric: -94.1,
  movementDir: 75,
  movementSpeed: 8,
  lastUpdate: "2026-10-07T09:00:00.000Z",
};
test("weather, indexing and failure paths", async (t) => {
  await t.test("only displays impacts from the matching official advisory", () => {
    const current = catalogSchema.parse({ activeStorms: [{
      ...storm,
      publicAdvisory: { advNum: "008", url: "https://www.nhc.noaa.gov/text/MIATCPAT4.shtml" },
    }] }).activeStorms[0];
    const product = `<pre>Hurricane Isaias Advisory Number 8\nAL092026\nWATCHES AND WARNINGS\n---\nSUMMARY OF WATCHES AND WARNINGS IN EFFECT:\nA Hurricane Warning is in effect for...\n* Ocean Springs to Bay/Gulf County Line\n\nA Hurricane Warning means danger.\nDISCUSSION AND OUTLOOK\n---\nHAZARDS AFFECTING LAND\n---\nSTORM SURGE: 5-7 ft\nRAINFALL: 3-7 inches\nNEXT ADVISORY\n---\nNext intermediate advisory at 100 PM CDT.\n$$</pre>`;
    const parsed = parsePublicAdvisory(product, current);
    assert.match(parsed?.watches || "", /Ocean Springs/);
    assert.doesNotMatch(parsed?.watches || "", /means danger/);
    assert.match(parsed?.hazards || "", /STORM SURGE: 5-7 ft/);
    assert.match(parsed?.next || "", /100 PM CDT/);
    assert.equal(parsePublicAdvisory(product.replace("Number 8", "Number 7"), current), null);
    assert.equal(parsePublicAdvisory(product.replace("AL092026", "AL102026"), current), null);
  });
  await t.test(
    "validates upstream numbers, identity and download hosts",
    () => {
      const parsed = catalogSchema.parse({ activeStorms: [storm] })
        .activeStorms[0];
      assert.equal(parsed.intensity, 35);
      assert.equal(knotsToMph(parsed.intensity), 40);
      assert.equal(knotsToKmh(parsed.intensity), 65);
      assert.equal(knotsToMph(70), 80);
      assert.equal(knotsToKmh(70), 130);
      assert.equal(knotsToMph(0), 0);
      assert.equal(knotsToKmh(250), 465);
      assert.equal(stormPath(parsed), "/storms/2026/isaias-al092026");
      for (const change of [
        { intensity: null },
        { latitudeNumeric: 95 },
        { id: "../../private" },
        { forecastTrack: { zipFile: "https://evil.test/file.zip" } },
        {
          forecastTrack: { zipFile: "https://www.nhc.noaa.gov:8443/file.zip" },
        },
      ])
        assert.equal(
          catalogSchema.safeParse({ activeStorms: [{ ...storm, ...change }] })
            .success,
          false,
        );
      assert.equal(catalogSchema.safeParse({ activeStorms: [] }).success, true);
    },
  );
  await t.test(
    "uses hurricane thresholds without classifying tropical storms as hurricanes",
    () => {
      assert.equal(
        classification({ classification: "TS", intensity: 35 }),
        "Tropical storm",
      );
      for (const [wind, category] of [
        [64, 1],
        [83, 2],
        [96, 3],
        [113, 4],
        [137, 5],
      ])
        assert.equal(
          classification({ classification: "HU", intensity: wind }),
          `Category ${category} hurricane`,
        );
    },
  );
  await t.test(
    "sorts forecast points and preserves missing wind as missing",
    () => {
      const empty = { type: "FeatureCollection", features: [] } as const;
      const track = {
        line: empty,
        cone: empty,
        points: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {
                TAU: 24,
                DATELBL: "1:00 AM Thu",
                TIMEZONE: "CDT",
                MAXWIND: 65,
              },
              geometry: { type: "Point", coordinates: [-92, 24] },
            },
            {
              type: "Feature",
              properties: { TAU: 0 },
              geometry: { type: "Point", coordinates: [-94, 22] },
            },
          ],
        },
      } as unknown as Track;
      const rows = forecastRows(track);
      assert.equal(rows[0].wind, null);
      assert.equal(rows[1].time, "1:00 AM Thu CDT");
      assert.equal(rows[1].wind, 75);
    },
  );
  await t.test(
    "IndexNow only accepts same-origin canonical URLs and valid keys",
    () => {
      const payload = indexNowPayload("https://storms.test", "abcd1234", [
        "/",
        "/about",
        "/about",
      ]);
      assert.equal(payload.urlList.length, 2);
      assert.equal(payload.keyLocation, "https://storms.test/abcd1234.txt");
      for (const path of [
        "//evil.test/",
        "https://evil.test/x",
        "/?city=123",
        "/#track",
      ])
        assert.throws(() =>
          indexNowPayload("https://storms.test", "abcd1234", [path]),
        );
      assert.throws(() =>
        indexNowPayload("http://localhost:3000", "abcd1234", ["/"]),
      );
      assert.throws(() =>
        indexNowPayload("https://storms.test", "bad key", ["/"]),
      );
      assert.ok(
        !jsonLd({ name: "</script><script>bad()</script>" }).includes("<"),
      );
    },
  );
  await t.test(
    "IndexNow verifies the public key, handles 202, and surfaces rate limits without live submissions",
    () => {
      const code = `
      import assert from 'node:assert/strict';
      import { mkdtemp, rm } from 'node:fs/promises';
      import { tmpdir } from 'node:os';
      import { join } from 'node:path';
      process.env.DATA_DIR = await mkdtemp(join(tmpdir(), 'indexnow-test-'));
      const { submitIndexNow } = await import('./src/lib/indexnow.ts');
      const { writeData } = await import('./src/lib/storage.ts');
      let calls = 0;
      globalThis.fetch = async (url, options) => {
        calls++;
        if (String(url) === 'https://stormscope.test/abcd1234.txt') return new Response('abcd1234');
        assert.equal(String(url), 'https://api.indexnow.org/indexnow');
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body).urlList, ['https://stormscope.test/']);
        return new Response('', { status: 202 });
      };
      assert.equal((await submitIndexNow(['/'])).status, 'pending-key-validation');
      assert.equal(calls, 2);
      globalThis.fetch = async url => String(url).includes('abcd1234.txt') ? new Response('abcd1234') : new Response('', {status:429, headers:{'Retry-After':'600'}});
      const limited = await submitIndexNow(['/']);
      assert.equal(limited.status, 'rate-limited');
      assert.ok(Date.parse(limited.retryAt) > Date.now() + 590000);
      globalThis.fetch = async () => { throw new Error('Must respect retry deadline'); };
      assert.equal((await submitIndexNow(['/'])).status, 'rate-limited');
      await writeData('indexnow-retry', {retryAt:0});
      globalThis.fetch = async () => new Response('wrong key');
      await assert.rejects(submitIndexNow(['/']), /not publicly verified/);
      await rm(process.env.DATA_DIR, { recursive: true, force: true });
    `;
      execFileSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", code],
        {
          env: {
            ...process.env,
            NEXT_PUBLIC_SITE_URL: "https://stormscope.test",
            INDEXNOW_KEY: "abcd1234",
            INDEXNOW_ENABLED: "true",
          },
        },
      );
    },
  );
  await t.test(
    "failed refresh retains last good catalog; a real empty feed removes active storms",
    async () => {
      const temp = await mkdtemp(join(tmpdir(), "stormscope-test-"));
      const originalDir = process.env.DATA_DIR,
        originalFetch = globalThis.fetch;
      process.env.DATA_DIR = temp;
      try {
        await writeData("catalog", {
          storms: [
            catalogSchema.parse({ activeStorms: [storm] }).activeStorms[0],
          ],
          fetchedAt: "2020-01-01T00:00:00Z",
          stale: false,
        });
        globalThis.fetch = async () => {
          throw new Error("Network offline");
        };
        const fallback = await refreshCatalog();
        assert.equal(fallback.stale, true);
        assert.equal(fallback.storms.length, 1);
        await assert.rejects(getAlerts("unsupported-city"));
        assert.equal(await resolvePage("2025", "isaias-al092026"), null);
        globalThis.fetch = async (_url, options) => {
          assert.equal(options?.redirect, "manual");
          return Response.json({ activeStorms: [] });
        };
        const empty = await refreshCatalog();
        assert.equal(empty.stale, false);
        assert.equal(empty.storms.length, 0);
        globalThis.fetch = async () => Response.json({ features: [] });
        const alerts = await refreshAlerts("pensacola");
        assert.equal(alerts.alerts.length, 0);
        assert.equal(alerts.stale, false);
        await writeData("alerts-pensacola", {
          ...alerts,
          fetchedAt: "2020-01-01T00:00:00Z",
        });
        globalThis.fetch = async () => {
          throw new Error("Offline");
        };
        assert.equal((await getAlerts("pensacola")).stale, true);
      } finally {
        globalThis.fetch = originalFetch;
        if (originalDir === undefined) delete process.env.DATA_DIR;
        else process.env.DATA_DIR = originalDir;
        await rm(temp, { recursive: true, force: true });
      }
    },
  );
  await t.test(
    "refresh auth denies missing, incorrect and non-ASCII tokens; key file is exact",
    async () => {
      const oldSecret = process.env.CRON_SECRET,
        oldKey = process.env.INDEXNOW_KEY;
      process.env.CRON_SECRET = "test-token";
      process.env.INDEXNOW_KEY = "abcdef123456";
      try {
        for (const auth of ["", "Bearer wrong", "Bearer tést-token"])
          assert.equal(
            (
              await refresh(
                new Request("http://localhost/api/cron/refresh", {
                  headers: { authorization: auth },
                }),
              )
            ).status,
            401,
          );
        const key = await keyFile(new Request("http://localhost"), {
          params: Promise.resolve({ file: "abcdef123456.txt" }),
        });
        assert.equal(key.status, 200);
        assert.equal(await key.text(), "abcdef123456");
        assert.equal(
          (
            await keyFile(new Request("http://localhost"), {
              params: Promise.resolve({ file: "random.txt" }),
            })
          ).status,
          404,
        );
      } finally {
        if (oldSecret === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = oldSecret;
        if (oldKey === undefined) delete process.env.INDEXNOW_KEY;
        else process.env.INDEXNOW_KEY = oldKey;
      }
    },
  );
});
