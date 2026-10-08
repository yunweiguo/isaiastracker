import { z } from "zod";
import { cities, cityBySlug, cityCoverage } from "./config";
import type { FeatureCollection } from "geojson";

export const stormIdSchema = z.string().regex(/^(al|ep|cp)\d{6}$/);
const officialUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "www.nhc.noaa.gov" &&
      !url.port &&
      !url.username &&
      !url.password
    );
  });
const product = z
  .object({
    advNum: z.string().optional(),
    issuance: z.string().optional(),
    fileUpdateTime: z.string().optional(),
    url: officialUrl.optional(),
    zipFile: officialUrl.optional(),
    kmzFile: officialUrl.optional(),
  })
  .nullable()
  .optional();
const sourceNumber = z
  .union([z.number(), z.string().min(1)])
  .transform(Number)
  .pipe(z.number().finite());
export const stormSchema = z.object({
  id: stormIdSchema,
  name: z.string().min(1).max(80),
  classification: z.string().max(12),
  intensity: sourceNumber.refine((value) => value >= 0 && value <= 250),
  pressure: sourceNumber,
  latitudeNumeric: z.number().min(-90).max(90),
  longitudeNumeric: z.number().min(-180).max(180),
  movementDir: z.number(),
  movementSpeed: z.number(),
  lastUpdate: z.string().datetime(),
  publicAdvisory: product,
  forecastAdvisory: product,
  forecastDiscussion: product,
  forecastTrack: product,
  trackCone: product,
  bestTrackGIS: product,
  forecastGraphics: product,
});
export const catalogSchema = z.object({ activeStorms: z.array(stormSchema) });
export type Storm = z.infer<typeof stormSchema>;
export type Catalog = { storms: Storm[]; fetchedAt: string; stale: boolean };
export type Track = {
  line: FeatureCollection;
  cone: FeatureCollection;
  points: FeatureCollection;
};
export type Snapshot = {
  storm: Storm;
  track: Track | null;
  fetchedAt: string;
  previous: Pick<Storm, "intensity" | "pressure" | "lastUpdate"> | null;
  advisoryText?: { watches: string; hazards: string; next: string } | null;
};
export function hasCityCoverage(storm: Pick<Storm, "id">, citySlug: string) {
  const city = cityBySlug(citySlug);
  return Boolean(
    storm.id.startsWith("al") && city && cityCoverage[storm.id]?.[city.slug],
  );
}
export function canIndexCity(
  storm: Pick<Storm, "id">,
  citySlug: string,
  active: boolean | null,
) {
  return active === true && hasCityCoverage(storm, citySlug);
}
export function stormUrls(storm: Storm, active: boolean | null) {
  return [
    stormPath(storm),
    ...cities
      .filter((city) => canIndexCity(storm, city.slug, active))
      .map((city) => `${stormPath(storm)}/${city.slug}`),
  ];
}
export function stormPath(storm: Pick<Storm, "id" | "name">) {
  return `/storms/${storm.id.slice(-4)}/${storm.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${storm.id}`;
}
// NHC advisory winds use 5-unit increments; avoid implying 1 mph precision.
export const knotsToMph = (knots: number) => Math.round((knots * 1.15078) / 5) * 5;
export const knotsToKmh = (knots: number) => Math.round((knots * 1.852) / 5) * 5;
export function classification(
  storm: Pick<Storm, "classification" | "intensity">,
) {
  if (storm.classification === "HU") {
    const category =
      storm.intensity >= 137
        ? 5
        : storm.intensity >= 113
          ? 4
          : storm.intensity >= 96
            ? 3
            : storm.intensity >= 83
              ? 2
              : 1;
    return `Category ${category} hurricane`;
  }
  return (
    (
      {
        TS: "Tropical storm",
        TD: "Tropical depression",
        PT: "Post-tropical cyclone",
        PTC: "Potential tropical cyclone",
        SS: "Subtropical storm",
        SD: "Subtropical depression",
      } as Record<string, string>
    )[storm.classification] || "Tropical cyclone"
  );
}
export function formatTime(value: string, zone = "UTC") {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: zone,
        timeZoneName: "short",
      }).format(date);
}
export function forecastRows(track: Track | null) {
  return (track?.points.features || [])
    .map((feature) => {
      const p = feature.properties || {};
      return {
        time: p.DATELBL
          ? `${p.DATELBL}${p.TIMEZONE ? ` ${p.TIMEZONE}` : ""}`
          : String(p.ADVDATE || "See official advisory"),
        hour: Number(p.TAU ?? 0),
        wind: p.MAXWIND == null ? null : knotsToMph(Number(p.MAXWIND)),
        coordinates:
          feature.geometry.type === "Point"
            ? feature.geometry.coordinates
            : null,
      };
    })
    .sort((a, b) => a.hour - b.hour);
}
