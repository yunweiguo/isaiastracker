import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import Tracker, { ChangeSummary, ForecastTable } from "@/components/tracker";
import { resolvePage } from "@/lib/weather";
import { classification, formatTime, stormPath } from "@/lib/domain";
import { metadata, jsonLd } from "@/lib/seo";
import { siteUrl } from "@/lib/config";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ year: string; slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { year, slug } = await params;
  const data = await resolvePage(year, slug);
  if (!data) return { title: "Storm not found", robots: { index: false } };
  const s = data.snapshot.storm;
  return metadata(
    `${s.name} ${year} Forecast: Path, Wind & Advisory Updates`,
    `View the ${s.name} ${year} NHC forecast path, forecast wind speeds and changes between saved advisories.`,
    stormPath(s),
  );
}
export default async function StormPage({ params }: Props) {
  const { year, slug } = await params;
  const data = await resolvePage(year, slug);
  if (!data) notFound();
  const { snapshot } = data,
    s = snapshot.storm,
    path = stormPath(s);
  if (path !== `/storms/${year}/${slug}`) permanentRedirect(path);
  return (
    <div className="page-wrap">
      <div className="breadcrumbs">
        <Link href="/">Storm tracker</Link>
        <span>/</span>
        <span>
          {s.name} {year}
        </span>
      </div>
      <section className="detail-hero">
        <p className="hero-context">
          {classification(s)} <span className="context-divider" />
          {formatTime(s.lastUpdate)}
        </p>
        <h1>
          {s.name} {year} forecast
        </h1>
        <p>The official path, forecast wind speeds, and what changed.</p>
      </section>
      <Tracker snapshot={snapshot} stale={data.stale} active={data.active} />
      <ForecastTable snapshot={snapshot} />
      <ChangeSummary snapshot={snapshot} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Storm tracker",
                item: siteUrl,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: `${s.name} ${year}`,
                item: siteUrl + path,
              },
            ],
          }),
        }}
      />
    </div>
  );
}
