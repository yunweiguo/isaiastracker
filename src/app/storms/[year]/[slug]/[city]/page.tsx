import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cityBySlug, cityCoverage } from "@/lib/config";
import { getAlerts, resolvePage } from "@/lib/weather";
import { canIndexCity, stormPath } from "@/lib/domain";
import { metadata } from "@/lib/seo";
import Tracker from "@/components/tracker";
import Time from "@/components/time";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ year: string; slug: string; city: string }> };
export async function generateMetadata({ params }: Props) {
  const { year, slug, city: citySlug } = await params;
  const city = cityBySlug(citySlug),
    data = await resolvePage(year, slug);
  if (!city || !data || !data.snapshot.storm.id.startsWith("al"))
    return { title: "Location not found", robots: { index: false } };
  const result = metadata(
    `${data.snapshot.storm.name} ${year} ${data.active === false ? "Archive" : "Map"} & ${city.name} Weather Sources`,
    `Compare the saved ${data.snapshot.storm.name} track with ${city.name}, ${city.state}. Local NWS alerts cover all hazards; a connection to this storm is not assumed.`,
    `${stormPath(data.snapshot.storm)}/${city.slug}`,
  );
  return canIndexCity(data.snapshot.storm, city.slug, data.active)
    ? result
    : { ...result, robots: { index: false, follow: true } };
}
export default async function CityPage({ params }: Props) {
  const { year, slug, city: citySlug } = await params;
  const city = cityBySlug(citySlug);
  if (!city) notFound();
  const data = await resolvePage(year, slug);
  if (!data || !data.snapshot.storm.id.startsWith("al")) notFound();
  const { snapshot } = data,
    path = stormPath(snapshot.storm);
  if (`${path}/${city.slug}` !== `/storms/${year}/${slug}/${city.slug}`)
    permanentRedirect(`${path}/${city.slug}`);
  const coverage = cityCoverage[snapshot.storm.id]?.[city.slug];
  const result = await getAlerts(city.slug).catch(() => null);
  const alerts =
    result?.alerts.filter((a) => Date.parse(a.expires) > Date.now()) || [];
  return (
    <div className="page-wrap">
      <div className="breadcrumbs">
        <Link href="/">Storm tracker</Link>
        <span>/</span>
        <Link href={path}>
          {snapshot.storm.name} {year}
        </Link>
        <span>/</span>
        <span>{city.name}</span>
      </div>
      <section className="detail-hero">
        <p className="hero-context">
          {city.name}, {city.state}
        </p>
        <h1>
          {snapshot.storm.name} in {city.name}
        </h1>
        <p>
          {data.active === false
            ? "Archived storm map with separate local weather sources."
            : "Compare the saved storm map with your city and consult local official guidance."}{" "}
          A city marker does not establish that this storm will affect the city.
        </p>
      </section>
      {coverage && (
        <p>
          {coverage.summary}{" "}
          <a href={coverage.sourceUrl}>Local context source</a>
        </p>
      )}
      <section className="local-brief">
        <div>
          <h2>Local alerts for {city.name}</h2>
          <p>
            Representative city location: {city.lat.toFixed(3)}°,{" "}
            {city.lon.toFixed(3)}°. Alerts can vary across a city.
          </p>
        </div>
        <a className="button secondary" href={city.office}>
          Local NWS office ↗
        </a>
      </section>
      {(!result || result.stale) && (
        <p className="notice" role="status">
          {result ? (
            <>Live alerts could not be refreshed. Last checked <Time value={result.fetchedAt} />.</>
          ) : "Local alert data is unavailable."}{" "}
          Check the local NWS office for current warnings.
        </p>
      )}
      {result && !alerts.length && (
        <p className="alert-empty">
          {result.stale
            ? "No unexpired alerts in the saved response."
            : "No active NWS alerts returned for this city location."}{" "}
          This does not mean there is no risk.
        </p>
      )}
      {alerts.map((alert) => (
        <article className="alert-card" key={alert.id}>
          <span className="alert-label">
            {alert.severity} · {alert.event}
          </span>
          <h3>{alert.headline}</h3>
          <p>
            Issued <Time value={alert.sent} /> · Expires{" "}
            <Time value={alert.expires} />
          </p>
          <details>
            <summary>Read alert and instructions</summary>
            <p className="preserve-lines">{alert.description}</p>
            {alert.instruction && (
              <p className="preserve-lines">{alert.instruction}</p>
            )}
            <a href={alert.url}>View NWS forecast ↗</a>
          </details>
        </article>
      ))}
      {result && (
        <p className="muted small">
          Alerts checked <Time value={result.fetchedAt} />. These are
          saved local alerts for all hazards. We have not verified a connection
          between these alerts and {snapshot.storm.name}. They are not
          historical alerts associated with the saved storm advisory.
        </p>
      )}
      <Tracker
        snapshot={snapshot}
        city={city}
        stale={data.stale}
        active={data.active}
      />
      <section className="city-explainer">
        <h2>What this map tells you</h2>
        <p>
          The marker locates {city.name} relative to the official forecast
          track. It does not predict the wind, rainfall or storm surge at your
          home. The forecast cone is not a danger boundary.
        </p>
        <p>
          For local conditions, use the{" "}
          <a
            href={`https://forecast.weather.gov/MapClick.php?lat=${city.lat}&lon=${city.lon}`}
          >
            {city.name} NWS forecast
          </a>
          . Follow instructions from your local emergency management agency.
        </p>
        <p>
          We do not calculate a city arrival time from the storm’s speed.{" "}
          <a
            href={
              snapshot.storm.forecastGraphics?.url ||
              "https://www.nhc.noaa.gov/"
            }
          >
            See official NHC graphics for available wind-arrival products.
          </a>
        </p>
      </section>
    </div>
  );
}
