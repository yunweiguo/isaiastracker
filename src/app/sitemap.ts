import type { MetadataRoute } from "next";
import { isPublicSite, siteUrl, cities } from "@/lib/config";
import { getCatalog, archivedSnapshots } from "@/lib/weather";
import { hasCityCoverage, stormPath } from "@/lib/domain";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isPublicSite) return [];
  const catalog = await getCatalog().catch(() => null);
  const saved = await archivedSnapshots();
  const storms = new Map(saved.map((s) => [s.storm.id, s.storm]));
  for (const storm of catalog?.storms || []) storms.set(storm.id, storm);
  const latest = [...storms.values()]
    .map((s) => s.lastUpdate)
    .sort()
    .at(-1);
  return [
    { url: siteUrl, ...(latest ? { lastModified: latest } : {}) },
    { url: `${siteUrl}/about` },
    { url: `${siteUrl}/privacy` },
    ...[...storms.values()].flatMap((storm) => [
      { url: siteUrl + stormPath(storm), lastModified: storm.lastUpdate },
      ...(hasCityCoverage(storm) &&
      catalog?.storms.some((active) => active.id === storm.id)
        ? cities.map((city) => ({
            url: `${siteUrl}${stormPath(storm)}/${city.slug}`,
            lastModified: storm.lastUpdate,
          }))
        : []),
    ]),
  ];
}
