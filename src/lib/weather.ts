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
// Two missed five-minute runs mark NHC data stale; NWS gets one run plus grace.
export const NHC_MAX_AGE = 10 * 60_000;
export const NWS_MAX_AGE = 6 * 60_000;
export function isStale(fetchedAt: string, maxAge = NHC_MAX_AGE) {
  const age = Date.now() - Date.parse(fetchedAt);
  return !Number.isFinite(age) || age < 0 || age >= maxAge;
}
export async function getCatalog(): Promise<Catalog> {
  const saved = await readData<Catalog>("catalog");
  if (!saved)
    throw new Error("Official storm data is temporarily unavailable.");
  return { ...saved, stale: saved.stale || isStale(saved.fetchedAt) };
}
export async function getSnapshot(storm: Storm): Promise<Snapshot | null> {
  return readData<Snapshot>(storm.id);
}
// Only the scheduled refresh and explicit local refresh command call writers.
export async function refreshCatalog(): Promise<Catalog> {
  const previous = await readData<Catalog>("catalog");
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
    // Publish the catalog after snapshots so readers never depend on a pending write.
    await Promise.all(
      catalog.storms.map(async (storm) => {
        try {
          await refreshSnapshot(storm, catalog.fetchedAt);
        } catch (error) {
          console.warn(
            "NHC snapshot unavailable",
            storm.id,
            error instanceof Error ? error.message : "Unknown error",
          );
        }
      }),
    );
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
async function refreshSnapshot(
  storm: Storm,
  fetchedAt: string,
): Promise<Snapshot> {
  const cached = await getSnapshot(storm);
  if (cached?.track && JSON.stringify(cached.storm) === JSON.stringify(storm)) {
    const result = { ...cached, fetchedAt };
    await writeData(storm.id, result);
    return result;
  }
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
    } else if (cached?.track) {
      // A missing GIS URL must not discard an existing complete advisory.
      return cached;
    }
  } catch (error) {
    console.warn(
      "NHC track refresh failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    // Keep the complete last-good advisory and geometry together on failure.
    if (cached) return cached;
    // The validated catalog still provides official base data for a first sighting.
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
    fetchedAt,
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
  const snapshot = storm
    ? await getSnapshot(storm)
    : await readData<Snapshot>(id);
  return snapshot
    ? {
        snapshot,
        active: catalog && !catalog.stale ? Boolean(storm) : null,
        stale:
          !catalog ||
          catalog.stale ||
          Boolean(
            storm &&
            (isStale(snapshot.fetchedAt) ||
              JSON.stringify(snapshot.storm) !== JSON.stringify(storm)),
          ),
      }
    : null;
}
export async function featuredStorm() {
  const catalog = await getCatalog().catch(() => null);
  const id = process.env.FEATURED_STORM_ID?.trim();
  const storm = id
    ? catalog?.storms.find((storm) => storm.id === id)
    : catalog?.storms.find((storm) => storm.id.startsWith("al")) ||
      catalog?.storms[0];
  const data = id || storm ? await resolveStorm(id || storm!.id) : null;
  return { catalog, data };
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
  if (!cached) throw new Error("Local alerts are temporarily unavailable.");
  return {
    ...cached,
    stale: cached.stale || isStale(cached.fetchedAt, NWS_MAX_AGE),
  };
}
export async function refreshAlerts(slug: string): Promise<AlertResult> {
  const city = cityBySlug(slug);
  if (!city) throw new Error("Unknown city");
  const cached = await readData<AlertResult>(`alerts-${slug}`);
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
        if (
          !p ||
          typeof feature.id !== "string" ||
          !feature.id ||
          typeof p.event !== "string" ||
          typeof p.sent !== "string" ||
          !Number.isFinite(Date.parse(p.sent)) ||
          typeof p.expires !== "string" ||
          !Number.isFinite(Date.parse(p.expires))
        )
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
