import type { MetadataRoute } from "next";
import { isPublicSite, siteUrl } from "@/lib/config";
import { getCatalog, archivedSnapshots, getAlerts } from "@/lib/weather";
import { stormUrls } from "@/lib/domain";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isPublicSite) return [];
  const catalog = await getCatalog().catch(() => null);
  const saved = await archivedSnapshots();
  const storms = new Map(saved.map((s) => [s.storm.id, s.storm]));
  const featuredId = process.env.FEATURED_STORM_ID?.trim();
  const featured = featuredId
    ? storms.get(featuredId)
    : catalog?.storms.find((storm) => storm.id.startsWith("al")) ||
      catalog?.storms[0];
  return [
    {
      url: `${siteUrl}/`,
      ...(featured ? { lastModified: featured.lastUpdate } : {}),
    },
    { url: `${siteUrl}/about` },
    { url: `${siteUrl}/privacy` },
    ...(
      await Promise.all(
        [...storms.values()].map(async (storm) => {
          const [path, ...cityPaths] = stormUrls(
            storm,
            catalog && !catalog.stale
              ? catalog.storms.some((active) => active.id === storm.id)
              : null,
          );
          return [
            { url: siteUrl + path, lastModified: storm.lastUpdate },
            ...(await Promise.all(
              cityPaths.map(async (cityPath) => {
                const alerts = await getAlerts(
                  cityPath.split("/").at(-1)!,
                ).catch(() => null);
                const lastModified = [
                  storm.lastUpdate,
                  ...(alerts?.alerts.map((alert) => alert.sent) || []),
                ]
                  .sort((a, b) => Date.parse(a) - Date.parse(b))
                  .at(-1)!;
                return { url: siteUrl + cityPath, lastModified };
              }),
            )),
          ];
        }),
      )
    ).flat(),
  ];
}
