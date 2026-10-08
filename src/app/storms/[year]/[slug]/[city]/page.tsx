import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cityBySlug } from "@/lib/config";
import { getAlerts, resolvePage } from "@/lib/weather";
import { formatTime, hasCityCoverage, stormPath } from "@/lib/domain";
import { metadata } from "@/lib/seo";
import Tracker from "@/components/tracker";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ year: string; slug: string; city: string }> };
export async function generateMetadata({ params }: Props) {
  const { year, slug, city: citySlug } = await params;
  const city = cityBySlug(citySlug),
    data = await resolvePage(year, slug);
  if (!city || !data || !hasCityCoverage(data.snapshot.storm))
    return { title: "Location not found", robots: { index: false } };
  const result = metadata(
    `${data.snapshot.storm.name} ${year} in ${city.name}: Forecast & Local Alerts`,
    `See the official ${data.snapshot.storm.name} path near ${city.name}, ${city.state}, with current local NWS alerts and forecast sources.`,
    `${stormPath(data.snapshot.storm)}/${city.slug}`,
  );
  return data.active === true
    ? result
    : { ...result, robots: { index: false, follow: true } };
}
export default async function CityPage({ params }: Props) {
  const { year, slug, city: citySlug } = await params;
  const city = cityBySlug(citySlug);
  if (!city) notFound();
  const data = await resolvePage(year, slug);
  if (!data || !hasCityCoverage(data.snapshot.storm)) notFound();
  const { snapshot } = data,
    path = stormPath(snapshot.storm);
  if (`${path}/${city.slug}` !== `/storms/${year}/${slug}/${city.slug}`)
    permanentRedirect(`${path}/${city.slug}`);
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
          The forecast near your city, with direct access to local official
          guidance.
        </p>
      </section>
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
          {result
            ? `Live alerts could not be refreshed. Last checked ${formatTime(result.fetchedAt, city.zone)}.`
            : "Local alert data is unavailable."}{" "}
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
            Issued {formatTime(alert.sent, city.zone)} · Expires{" "}
            {formatTime(alert.expires, city.zone)}
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
          Alerts checked {formatTime(result.fetchedAt, city.zone)}. These are
          current local alerts for all hazards, not exclusively{" "}
          {snapshot.storm.name} advisories.
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
