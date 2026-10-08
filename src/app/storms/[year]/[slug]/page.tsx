import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import Tracker, { ChangeSummary, ForecastTable } from "@/components/tracker";
import { resolvePage } from "@/lib/weather";
import { classification, stormPath } from "@/lib/domain";
import { metadata, jsonLd } from "@/lib/seo";
import { siteUrl } from "@/lib/config";
import Time from "@/components/time";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ year: string; slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { year, slug } = await params;
  const data = await resolvePage(year, slug);
  if (!data) return { title: "Storm not found", robots: { index: false } };
  const s = data.snapshot.storm;
  return metadata(
    `${s.name} ${year} ${data.active === false ? "Archive" : "NHC Advisory"}: Forecast Table & Changes`,
    `Read ${s.name} ${year} ${data.active === false ? "archived" : "saved"} NHC advisory details, forecast points and changes between advisories.`,
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
          <Time value={s.lastUpdate} />
        </p>
        <h1>
          {s.name} {year}{" "}
          {data.active === false ? "advisory archive" : "NHC advisory details"}
        </h1>
        <p>
          {data.active === false
            ? "Historical forecast points from the last saved official advisory; not current conditions."
            : "The saved official forecast table, advisory sources, and changes between advisories."}
        </p>
      </section>
      <Tracker snapshot={snapshot} stale={data.stale} active={data.active} />
      <ForecastTable snapshot={snapshot} />
      {snapshot.previous && <ChangeSummary snapshot={snapshot} />}
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
