import { createHash } from "node:crypto";
import { siteUrl, isPublicSite, cities } from "./config";
import { stormUrls, type Catalog, type Snapshot, type Storm } from "./domain";
import {
  archivedSnapshots,
  getAlerts,
  refreshCatalog,
  refreshAlerts,
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
type PageSignatures = Record<string, string>;
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function indexablePageSignatures(
  snapshots: Snapshot[],
  catalog: Catalog,
  alerts: Record<string, AlertResult["alerts"] | null>,
  featuredId = process.env.FEATURED_STORM_ID?.trim(),
) {
  const pages: PageSignatures = {};
  for (const snapshot of snapshots) {
    const active = catalog.storms.some(
      (storm) => storm.id === snapshot.storm.id,
    );
    const content = {
      storm: snapshot.storm,
      track: snapshot.track,
      previous: snapshot.previous,
      active,
    };
    const [path, ...cityPaths] = stormUrls(snapshot.storm, active);
    pages[path] = fingerprint(content);
    for (const cityPath of cityPaths) {
      const slug = cityPath.split("/").at(-1)!;
      const local = alerts[slug];
      pages[cityPath] = fingerprint({
        content,
        alerts: local
          ? [...local]
              .filter((alert) => Date.parse(alert.expires) > Date.now())
              .sort((a, b) => a.id.localeCompare(b.id))
          : null,
      });
    }
  }
  const featured = featuredId
    ? snapshots.find((snapshot) => snapshot.storm.id === featuredId)
    : snapshots.find(
        (snapshot) =>
          snapshot.storm.id ===
          (
            catalog.storms.find((storm) => storm.id.startsWith("al")) ||
            catalog.storms[0]
          )?.id,
      );
  pages["/"] = fingerprint(
    featured
      ? { page: pages[stormUrls(featured.storm, false)[0]], featuredId }
      : { unavailable: true, featuredId },
  );
  return pages;
}
export function changedPages(
  current: PageSignatures,
  previous: PageSignatures,
) {
  return Object.keys(current).filter(
    (path) => current[path] !== previous[path],
  );
}
async function runRefresh() {
  // NWS can still refresh when NHC is down, and vice versa.
  const [catalogResult] = await Promise.all([
    refreshCatalog().catch(() => null),
    ...cities.map((city) => refreshAlerts(city.slug).catch(() => null)),
  ]);
  if (!catalogResult || catalogResult.stale)
    throw new Error("Official source unavailable; retained previous NHC data");
  const catalog = catalogResult;
  // Indexing is best-effort, after every weather write has finished.
  try {
    const alerts = Object.fromEntries(
      await Promise.all(
        cities.map(
          async (city) =>
            [
              city.slug,
              (await getAlerts(city.slug).catch(() => null))?.alerts || null,
            ] as const,
        ),
      ),
    );
    const snapshots = await archivedSnapshots();
    const pages = indexablePageSignatures(snapshots, catalog, alerts);
    const submitted = await readData<{
      pages?: PageSignatures;
      storms?: Storm[];
    }>("indexnow-submitted");
    // On first run (or migration), baseline archives instead of resubmitting the archive.
    const previous =
      submitted?.pages ||
      Object.fromEntries(
        snapshots
          .filter(
            (snapshot) =>
              !catalog.storms.some((storm) => storm.id === snapshot.storm.id) &&
              !submitted?.storms?.some(
                (storm) => storm.id === snapshot.storm.id,
              ),
          )
          .map((snapshot) => {
            const path = stormUrls(snapshot.storm, false)[0];
            return [path, pages[path]];
          }),
      );
    const changed = changedPages(pages, previous);
    if (!changed.length)
      return { storms: catalog.storms.length, indexNow: "unchanged" };
    const result = await submitIndexNow(changed);
    if (
      result.status === "received" ||
      result.status === "pending-key-validation"
    )
      await writeData("indexnow-submitted", { pages });
    return { storms: catalog.storms.length, indexNow: result };
  } catch (error) {
    console.warn(
      "IndexNow submission failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return { storms: catalog.storms.length, indexNow: { status: "failed" } };
  }
}
