import { siteUrl, isPublicSite, cities } from "./config";
import { hasCityCoverage, stormPath, type Storm } from "./domain";
import {
  archivedSnapshots,
  getAlerts,
  getCatalog,
  getSnapshot,
  readData,
  writeData,
  type AlertResult,
} from "./weather";

export function indexNowPayload(origin: string, key: string, paths: string[]) {
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key))
    throw new Error("Invalid IndexNow key");
  const base = new URL(origin);
  if (
    base.protocol !== "https:" ||
    /localhost|127\.0\.0\.1/.test(base.hostname)
  )
    throw new Error("Public HTTPS origin required");
  const urls = [
    ...new Set(
      paths.map((path) => {
        const url = new URL(path, base);
        if (
          url.origin !== base.origin ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw new Error("Only canonical same-origin URLs are allowed");
        return url.href;
      }),
    ),
  ];
  if (!urls.length || urls.length > 10000) throw new Error("Invalid URL count");
  return {
    host: base.host,
    key,
    keyLocation: `${base.origin}/${key}.txt`,
    urlList: urls,
  };
}
export function stormUrls(storm: Storm) {
  return [
    stormPath(storm),
    ...(hasCityCoverage(storm)
      ? cities.map((city) => `${stormPath(storm)}/${city.slug}`)
      : []),
  ];
}
export async function submitIndexNow(paths: string[]) {
  if (!isPublicSite || process.env.INDEXNOW_ENABLED !== "true")
    return { status: "disabled" };
  const payload = indexNowPayload(
    siteUrl,
    process.env.INDEXNOW_KEY || "",
    paths,
  );
  const backoff = await readData<{ retryAt: number }>("indexnow-retry");
  if (backoff && backoff.retryAt > Date.now())
    return {
      status: "rate-limited",
      retryAt: new Date(backoff.retryAt).toISOString(),
    };
  const verification = await fetch(payload.keyLocation, {
    signal: AbortSignal.timeout(10000),
    redirect: "manual",
  });
  if (!verification.ok || (await verification.text()).trim() !== payload.key)
    throw new Error("IndexNow key file is not publicly verified");
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 429) {
    const header = response.headers.get("Retry-After");
    const delay =
      header && /^\d+$/.test(header)
        ? Number(header) * 1000
        : header
          ? Date.parse(header) - Date.now()
          : NaN;
    const retryAt =
      Date.now() +
      (Number.isFinite(delay) ? Math.max(60_000, delay) : 3_600_000);
    await writeData("indexnow-retry", { retryAt });
    return { status: "rate-limited", retryAt: new Date(retryAt).toISOString() };
  }
  if (response.status !== 200 && response.status !== 202)
    throw new Error(`IndexNow returned ${response.status}`);
  return {
    status: response.status === 202 ? "pending-key-validation" : "received",
    count: payload.urlList.length,
  };
}
let refreshFlight: Promise<unknown> | null = null;
export function refreshWeather() {
  if (refreshFlight) return refreshFlight;
  refreshFlight = runRefresh().finally(() => {
    refreshFlight = null;
  });
  return refreshFlight;
}
async function runRefresh() {
  const catalog = await getCatalog(true);
  if (catalog.stale)
    throw new Error("Official source unavailable; retained previous data");
  await Promise.all(catalog.storms.map((storm) => getSnapshot(storm)));
  const localAlerts = await Promise.all(
    cities.map(async (city) => {
      const result = await getAlerts(city.slug).catch(() => null);
      return [city.slug, result?.alerts || null] as const;
    }),
  );
  const alerts = Object.fromEntries(localAlerts);
  const signature = JSON.stringify({ storms: catalog.storms, alerts });
  const submitted = await readData<{
    signature: string;
    storms: Storm[];
    alerts?: Record<string, AlertResult["alerts"] | null>;
  }>("indexnow-submitted");
  if (submitted?.signature === signature)
    return { storms: catalog.storms.length, indexNow: "unchanged" };
  const snapshots = await archivedSnapshots();
  const changed = snapshots.filter((snapshot) => {
    const current = catalog.storms.find(
      (storm) => storm.id === snapshot.storm.id,
    );
    const old = submitted?.storms.find(
      (storm) => storm.id === snapshot.storm.id,
    );
    return (
      JSON.stringify(current) !== JSON.stringify(old) ||
      !submitted ||
      JSON.stringify(alerts) !== JSON.stringify(submitted.alerts)
    );
  });
  const result = await submitIndexNow([
    "/",
    ...changed.flatMap((snapshot) => stormUrls(snapshot.storm)),
  ]);
  if (
    result.status === "received" ||
    result.status === "pending-key-validation"
  )
    await writeData("indexnow-submitted", {
      signature,
      storms: catalog.storms,
      alerts,
    });
  return { storms: catalog.storms.length, indexNow: result };
}
