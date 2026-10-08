import Link from "next/link";
import Tracker, { ChangeSummary } from "@/components/tracker";
import { featuredStorm, archivedSnapshots } from "@/lib/weather";
import { stormPath } from "@/lib/domain";
import { metadata } from "@/lib/seo";
import Time from "@/components/time";
export const dynamic = "force-dynamic";
const isIsaias = () => process.env.FEATURED_STORM_ID?.trim() === "al092026";
export async function generateMetadata() {
  const { data } = await featuredStorm();
  const storm = data?.snapshot.storm;
  return metadata(
    isIsaias()
      ? "Hurricane Isaias 2026 Tracker – Path, Forecast & Updates"
      : storm
        ? `${storm.name} ${storm.id.slice(-4)} Tracker – Path & Updates`
        : "Hurricane Tracker: Official Path Maps & Local Alerts",
    isIsaias()
      ? "Follow Isaias 2026 with official NHC path maps, advisory updates and local NWS sources. Saved advisories remain available after the storm ends."
      : "Explore official NHC storm paths and saved advisories with local NWS sources.",
  );
}
export default async function Home() {
  const { catalog, data } = await featuredStorm();
  const snapshot = data?.snapshot;
  const storm = snapshot?.storm;
  const archives =
    !storm && !process.env.FEATURED_STORM_ID?.trim()
      ? await archivedSnapshots()
      : [];
  return (
    <div className="page-wrap">
      <section className="hero">
        <div>
          <div className="hero-context">
            <span className="status-dot" />{" "}
            {data?.active === false
              ? "Archived / Last Official Advisory"
              : data?.active === true
                ? `Tracking ${storm?.name}`
                : "Official data status unavailable"}
            <span className="context-divider" />
            {storm ? <Time value={storm.lastUpdate} /> : "Official NHC forecasts"}
          </div>
          <h1>
            {isIsaias()
              ? "Hurricane Isaias 2026 Tracker"
              : storm
                ? `${storm.name} ${storm.id.slice(-4)} Tracker`
                : "Official Hurricane Tracker"}
          </h1>
          <p>
            {isIsaias()
              ? "Explore the Hurricane Isaias 2026 path, official NHC advisories and local weather sources."
              : "Explore official storm paths, saved advisories and local weather sources."}
            {data?.active === false &&
              " The data below is archived, not a live forecast."}
          </p>
        </div>
        <div className="hero-aside">
          <span className="small-compass" aria-hidden="true">
            ✳
          </span>
          <p>
            Official forecast.
            <br />
            Local context.
          </p>
          <a href="#tracker">
            Explore the map <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>
      {snapshot ? (
        <>
          <div id="tracker">
            <Tracker
              snapshot={snapshot}
              stale={data?.stale}
              active={data?.active}
            />
          </div>
          <div className={`below-map${snapshot.previous ? "" : " no-comparison"}`}>
            <section className="feature-story">
              <span className="source-tag">The full picture</span>
              <h2>
                A forecast is more
                <br />
                than a center line.
              </h2>
              <p>
                Explore forecast points, the saved official storm status, and
                changes between saved advisories. Every update links back to its
                official source.
              </p>
              <Link className="button" href={stormPath(snapshot.storm)}>
                View {snapshot.storm.name} advisory details{" "}
                <span aria-hidden="true">↗</span>
              </Link>
            </section>
            {snapshot.previous && <ChangeSummary snapshot={snapshot} />}
          </div>
          {catalog && catalog.storms.some((s) => s.id !== storm?.id) && (
            <section className="other-storms">
              <h2>
                {catalog.stale
                  ? "Storms in the last saved NHC feed"
                  : "Also being tracked"}
              </h2>
              {catalog.storms
                .filter((s) => s.id !== storm?.id)
                .map((s) => (
                  <Link key={s.id} href={stormPath(s)}>
                    {s.name}
                    <span>View official forecast ↗</span>
                  </Link>
                ))}
            </section>
          )}
        </>
      ) : (
        <section className="empty-state">
          <h2>
            {catalog &&
            !catalog.stale &&
            !catalog.storms.length &&
            !process.env.FEATURED_STORM_ID?.trim()
              ? "No active storms in the NHC feed"
              : "Official data is temporarily unavailable"}
          </h2>
          <p>
            {isIsaias()
              ? "No saved official Isaias 2026 advisory is available. Please check NHC for current conditions; this page does not infer a storm’s existence or intensity."
              : "No official snapshot is available for the selected storm. Please check NHC for current conditions."}
          </p>
          <a className="button" href="https://www.nhc.noaa.gov/">
            Open the National Hurricane Center ↗
          </a>
          {archives.length > 0 && (
            <>
              <h3>Saved storm archives</h3>
              {archives.map((s) => (
                <p key={s.storm.id}>
                  <Link href={stormPath(s.storm)}>
                    {s.storm.name} {s.storm.id.slice(-4)} — saved forecast
                  </Link>
                </p>
              ))}
            </>
          )}
        </section>
      )}
      <section className="faq">
        <h2>A little context goes a long way.</h2>
        <details>
          <summary>Is this an official hurricane forecast?</summary>
          <p>
            Stormscope displays National Hurricane Center data and National
            Weather Service alerts. We do not produce forecasts and are not
            affiliated with NOAA. Follow official advisories and local emergency
            management instructions.
          </p>
        </details>
        <details>
          <summary>How often does the tracker update?</summary>
          <p>
            We check for new official data about every five minutes when the
            scheduled refresh is running. NHC advisories and map products have
            their own publication schedules. The time shown is the official
            advisory time, not an estimate of a real-time position.
          </p>
        </details>
        <details>
          <summary>Does being outside the cone mean I am safe?</summary>
          <p>
            No. The cone represents uncertainty in the path of the storm center.
            Hazardous wind, rain and storm surge can extend beyond it. Check
            local warnings for your location.
          </p>
        </details>
        <details>
          <summary>Can I see spaghetti models?</summary>
          <p>
            This version shows the official NHC forecast, not individual
            computer model tracks.{" "}
            <a href="https://www.tropicaltidbits.com/storminfo/">
              Tropical Tidbits provides model guidance.
            </a>{" "}
            Individual model lines are not official warnings.
          </p>
        </details>
      </section>
    </div>
  );
}
