import { readData, writeData, dataFiles } from "./storage";
export { readData, writeData } from "./storage";
import shp from "shpjs";
import {
  catalogSchema,
  stormIdSchema,
  type Catalog,
  type Snapshot,
  type Storm,
  type Track,
} from "./domain";
import { cityBySlug } from "./config";

async function upstream(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": process.env.NHC_USER_AGENT || "Stormscope/1.0",
      Accept: "*/*",
    },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
    redirect: "manual",
  });
  if (!response.ok)
    throw new Error(`Weather source returned ${response.status}`);
  return response;
}
let catalogFlight: Promise<Catalog> | null = null;
export function getCatalog(force = false): Promise<Catalog> {
  if (catalogFlight) return catalogFlight;
  catalogFlight = loadCatalog(force).finally(() => {
    catalogFlight = null;
  });
  return catalogFlight;
}
async function loadCatalog(force: boolean): Promise<Catalog> {
  const previous = await readData<Catalog>("catalog");
  if (
    !force &&
    previous &&
    Date.now() - Date.parse(previous.fetchedAt) < 300_000
  )
    return { ...previous, stale: false };
  try {
    const source = catalogSchema.parse(
      await (
        await upstream("https://www.nhc.noaa.gov/CurrentStorms.json")
      ).json(),
    );
    const catalog: Catalog = {
      storms: source.activeStorms,
      fetchedAt: new Date().toISOString(),
      stale: false,
    };
    await writeData("catalog", catalog);
    return catalog;
  } catch (error) {
    console.warn(
      "NHC catalog refresh failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    if (previous) return { ...previous, stale: true };
    throw new Error(
      "Official storm data is temporarily unavailable. Please check NHC directly.",
    );
  }
}
const flights = new Map<string, Promise<Snapshot>>();
export async function getSnapshot(storm: Storm): Promise<Snapshot> {
  const inflight = flights.get(storm.id);
  if (inflight) return inflight;
  const flight = loadSnapshot(storm).finally(() => flights.delete(storm.id));
  flights.set(storm.id, flight);
  return flight;
}
async function loadSnapshot(storm: Storm): Promise<Snapshot> {
  const cached = await readData<Snapshot>(storm.id);
  if (cached?.track && JSON.stringify(cached.storm) === JSON.stringify(storm))
    return cached;
  let track: Track | null = null;
  try {
    if (storm.forecastTrack?.zipFile) {
      const bytes = await (
        await upstream(storm.forecastTrack.zipFile)
      ).arrayBuffer();
      if (bytes.byteLength > 10_000_000)
        throw new Error("Track file exceeds size limit");
      const parsed = await shp(bytes);
      const layers = Array.isArray(parsed) ? parsed : [parsed];
      const layer = (suffix: string) =>
        layers.find((item) => item.fileName?.endsWith(suffix));
      const line = layer("_lin"),
        cone = layer("_pgn"),
        points = layer("_pts");
      if (!line || !cone || !points || !points.features.length)
        throw new Error("Track layers missing");
      track = { line, cone, points };
    }
  } catch (error) {
    console.warn(
      "NHC track refresh failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    // Only reuse a geometry set when its source product is unchanged.
    if (
      cached?.storm.forecastTrack?.zipFile === storm.forecastTrack?.zipFile &&
      cached?.storm.forecastTrack?.fileUpdateTime ===
        storm.forecastTrack?.fileUpdateTime
    )
      track = cached?.track || null;
  }
  const previous =
    cached && cached.storm.lastUpdate !== storm.lastUpdate
      ? {
          intensity: cached.storm.intensity,
          pressure: cached.storm.pressure,
          lastUpdate: cached.storm.lastUpdate,
        }
      : cached?.previous || null;
  const result: Snapshot = {
    storm,
    track,
    previous,
    fetchedAt: new Date().toISOString(),
  };
  await writeData(storm.id, result);
  return result;
}
export async function archivedSnapshots() {
  const files = await dataFiles();
  const snapshots = await Promise.all(
    files
      .filter((file) => /^(al|ep|cp)\d{6}\.json$/.test(file))
      .map((file) => readData<Snapshot>(file.slice(0, -5))),
  );
  return snapshots.filter((item): item is Snapshot => Boolean(item));
}
export async function resolveStorm(id: string) {
  if (!stormIdSchema.safeParse(id).success) return null;
  const catalog = await getCatalog().catch(() => null);
  const storm = catalog?.storms.find((storm) => storm.id === id);
  if (storm)
    return {
      snapshot: await getSnapshot(storm),
      active: true,
      stale: catalog!.stale,
    };
  const snapshot = await readData<Snapshot>(id);
  return snapshot
    ? {
        snapshot,
        active: catalog ? false : null,
        stale: !catalog || catalog.stale,
      }
    : null;
}
export async function resolvePage(year: string, slug: string) {
  const id = slug.match(/((?:al|ep|cp)\d{6})$/)?.[1];
  if (!id || year !== id.slice(-4)) return null;
  return resolveStorm(id);
}
export type Alert = {
  id: string;
  event: string;
  headline: string;
  description: string;
  instruction: string;
  severity: string;
  sent: string;
  expires: string;
  url: string;
};
export type AlertResult = {
  alerts: Alert[];
  fetchedAt: string;
  stale: boolean;
};
export async function getAlerts(slug: string): Promise<AlertResult> {
  const city = cityBySlug(slug);
  if (!city) throw new Error("Unknown city");
  const cached = await readData<AlertResult>(`alerts-${slug}`);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < 120_000)
    return cached;
  try {
    const data = await (
      await upstream(
        `https://api.weather.gov/alerts/active?point=${city.lat},${city.lon}`,
      )
    ).json();
    if (!Array.isArray(data.features))
      throw new Error("Invalid alerts response");
    const alerts: Alert[] = data.features.map(
      (feature: { id: string; properties: Record<string, unknown> }) => {
        const p = feature.properties;
        if (!p || typeof p.event !== "string" || typeof p.expires !== "string")
          throw new Error("Invalid alert");
        return {
          id: feature.id,
          event: p.event,
          headline: String(p.headline || p.event),
          description: String(p.description || ""),
          instruction: String(p.instruction || ""),
          severity: String(p.severity || "Unknown"),
          sent: String(p.sent || ""),
          expires: p.expires,
          url: `https://forecast.weather.gov/MapClick.php?lat=${city.lat}&lon=${city.lon}`,
        };
      },
    );
    const result = {
      alerts,
      fetchedAt: new Date().toISOString(),
      stale: false,
    };
    await writeData(`alerts-${slug}`, result);
    return result;
  } catch (error) {
    console.warn(
      "NWS alerts refresh failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    if (cached) return { ...cached, stale: true };
    throw new Error(
      "Local alerts are temporarily unavailable. Open your local NWS forecast for current warnings.",
    );
  }
}
