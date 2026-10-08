import Link from "next/link";
import Tracker, { ChangeSummary } from "@/components/tracker";
import { getCatalog, getSnapshot, archivedSnapshots } from "@/lib/weather";
import { formatTime, stormPath } from "@/lib/domain";
import { metadata } from "@/lib/seo";
export const dynamic = "force-dynamic";
async function featured() {
  const catalog = await getCatalog().catch(() => null);
  const storm =
    catalog?.storms.find(
      (storm) => storm.id === process.env.FEATURED_STORM_ID,
    ) ||
    catalog?.storms.find((storm) => storm.id.startsWith("al")) ||
    catalog?.storms[0];
  return { catalog, storm };
}
export async function generateMetadata() {
  const { storm } = await featured();
  return metadata(
    storm
      ? `${storm.name} Tracker ${storm.id.slice(-4)}: Path Map & Local Alerts`
      : "Hurricane Tracker: Official Path Maps & Local Alerts",
    "Track tropical storms with official NHC forecast paths and current storm status. Select your city for local NWS alerts and forecast sources.",
  );
}
export default async function Home() {
  const { catalog, storm } = await featured();
  const snapshot = storm ? await getSnapshot(storm) : null;
  const archives = !storm ? await archivedSnapshots() : [];
  return (
    <div className="page-wrap">
      <section className="hero">
        <div>
          <div className="hero-context">
            <span className="status-dot" />{" "}
            {storm ? `Tracking ${storm.name}` : "Atlantic & eastern Pacific"}
            <span className="context-divider" />
            {storm ? formatTime(storm.lastUpdate) : "Official NHC forecasts"}
          </div>
          <h1>
            {storm ? (
              <>
                {storm.name} {storm.id.slice(-4)} tracker
              </>
            ) : (
              <>
                Every storm.
                <br />
                <span>A clearer picture.</span>
              </>
            )}
          </h1>
          <p>
            Follow the official forecast. Find your city.
            <br className="desktop-break" /> See what matters where you are.
          </p>
        </div>
        <div className="hero-aside">
          <span className="small-compass" aria-hidden="true">
            ✳
          </span>
          <p>
            One forecast.
            <br />
            Your place in it.
          </p>
          <a href="#tracker">
            Explore the map <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>
      {snapshot ? (
        <>
          <div id="tracker">
            <Tracker snapshot={snapshot} stale={catalog?.stale} />
          </div>
          <div className="below-map">
            <section className="feature-story">
              <span className="source-tag">The full picture</span>
              <h2>
                A forecast is more
                <br />
                than a center line.
              </h2>
              <p>
                Explore forecast points, the latest storm status, and changes
                between saved advisories. Every update links back to its
                official source.
              </p>
              <Link className="button" href={stormPath(snapshot.storm)}>
                View {snapshot.storm.name} forecast{" "}
                <span aria-hidden="true">↗</span>
              </Link>
            </section>
            <ChangeSummary snapshot={snapshot} />
          </div>
          {catalog && catalog.storms.length > 1 && (
            <section className="other-storms">
              <h2>Also being tracked</h2>
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
            {catalog
              ? "No active storms in the NHC feed"
              : "Official data is temporarily unavailable"}
          </h2>
          <p>
            {catalog
              ? "New storms will appear here when the National Hurricane Center starts issuing advisories."
              : "We could not load the official storm feed. Please check NHC for current conditions."}
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
