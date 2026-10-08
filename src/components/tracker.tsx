import Link from "next/link";
import StormMap from "./storm-map";
import CitySearch from "./city-search";
import Refresh from "./refresh";
import {
  classification,
  forecastRows,
  formatTime,
  knotsToMph,
  stormPath,
  type Snapshot,
} from "@/lib/domain";
import { isStale } from "@/lib/weather";
import type { City } from "@/lib/config";
export default function Tracker({
  snapshot,
  city,
  stale,
  active = true,
}: {
  snapshot: Snapshot;
  city?: City;
  stale?: boolean;
  active?: boolean | null;
}) {
  const { storm } = snapshot;
  const outdated =
    stale ||
    (active === true && isStale(snapshot.fetchedAt)) ||
    Date.now() - Date.parse(storm.lastUpdate) > 9 * 3600_000;
  return (
    <>
      <Refresh />
      {storm.forecastTrack?.issuance &&
        storm.forecastTrack.issuance !== storm.lastUpdate && (
          <p className="product-time">
            Storm status: {formatTime(storm.lastUpdate)}. Map forecast:{" "}
            {formatTime(storm.forecastTrack.issuance)}. Official products can
            update at different times.
          </p>
        )}
      {(outdated || active !== true) && (
        <div className="notice" role="status">
          {active === false
            ? "Archived / Last Official Advisory. This map shows the last saved official forecast, not current conditions."
            : active === null
              ? "Live status could not be verified. Showing the last saved official data."
              : "This forecast may be out of date. Check the latest NHC advisory before making decisions."}{" "}
          <a href="https://www.nhc.noaa.gov/">Open NHC</a>
        </div>
      )}
      {stale && active !== true && (
        <p className="notice" role="status">
          Scheduled weather checks are overdue or unavailable. Verify current
          conditions with NHC.
        </p>
      )}
      <p className="product-time">
        Official advisory: {formatTime(storm.lastUpdate)}. Last successful data
        check: {formatTime(snapshot.fetchedAt)}.
      </p>
      <section className="tracker-shell" aria-label="Storm tracker">
        <StormMap snapshot={snapshot} city={city} />
        <aside className="tracker-sidebar">
          <div className="storm-heading">
            <span className="storm-symbol" aria-hidden="true">
              ↻
            </span>
            <div>
              <h2>{storm.name}</h2>
              <p>Official classification: {classification(storm)}</p>
            </div>
          </div>
          <dl className="storm-stats">
            <div>
              <dt>Sustained wind</dt>
              <dd>
                {knotsToMph(storm.intensity)} <small>mph</small>
              </dd>
            </div>
            <div>
              <dt>Pressure</dt>
              <dd>
                {storm.pressure > 0 ? storm.pressure : "—"} <small>mb</small>
              </dd>
            </div>
          </dl>
          <p className="position">
            {Math.abs(storm.latitudeNumeric).toFixed(1)}°
            {storm.latitudeNumeric >= 0 ? "N" : "S"} &nbsp;{" "}
            {Math.abs(storm.longitudeNumeric).toFixed(1)}°
            {storm.longitudeNumeric >= 0 ? "E" : "W"}
            <br />
            <span>Reported {formatTime(storm.lastUpdate)}</span>
          </p>
          {storm.id.startsWith("al") ? (
            <CitySearch path={stormPath(storm)} selected={city?.slug} />
          ) : (
            <p className="muted small">
              This storm is in the Pacific basin. Our local city alerts
              currently cover the U.S. Gulf Coast.
            </p>
          )}
          <a
            className="source-link"
            href={storm.publicAdvisory?.url || "https://www.nhc.noaa.gov/"}
            target="_blank"
            rel="noreferrer"
          >
            Read the official advisory ↗
          </a>
        </aside>
      </section>
      <p className="map-caption">
        <span className="info-icon">i</span> The cone shows the possible path of
        the storm’s center. Wind, rain and surge can affect areas outside it.{" "}
        <Link href="/about#forecast-cone">How to read this map</Link>
      </p>
      {!snapshot.track && (
        <p className="notice">
          Forecast track, cone and points are temporarily unavailable. The
          position above comes from the saved official advisory.
        </p>
      )}
    </>
  );
}
export function ForecastTable({ snapshot }: { snapshot: Snapshot }) {
  const rows = forecastRows(snapshot.track);
  return (
    <section className="forecast-section">
      <div className="section-heading">
        <div>
          <h2>Along the forecast path</h2>
          <p>
            Storm-center predictions from the NHC. Times are shown as published.
          </p>
        </div>
        <span className="source-tag">
          NHC advisory {snapshot.storm.forecastTrack?.advNum || "—"}
        </span>
      </div>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Forecast time</th>
                <th scope="col">Lead time</th>
                <th scope="col">Sustained wind</th>
                <th scope="col">Position</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td>{row.time}</td>
                  <td>+{row.hour}h</td>
                  <td>
                    {row.wind == null ? "Unavailable" : `${row.wind} mph`}
                  </td>
                  <td>
                    {row.coordinates
                      ? `${row.coordinates[1].toFixed(1)}°, ${row.coordinates[0].toFixed(1)}°`
                      : "Unavailable"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="notice">
          Forecast points are unavailable.{" "}
          <a
            href={
              snapshot.storm.forecastAdvisory?.url ||
              "https://www.nhc.noaa.gov/"
            }
          >
            Read the official forecast.
          </a>
        </p>
      )}
    </section>
  );
}
export function ChangeSummary({ snapshot }: { snapshot: Snapshot }) {
  const previous = snapshot.previous;
  return (
    <section className="update-summary">
      <h2>Since the previous advisory</h2>
      {previous ? (
        <>
          <p>
            Compared with the saved advisory from{" "}
            {formatTime(previous.lastUpdate)}:
          </p>
          <dl>
            <div>
              <dt>Sustained wind</dt>
              <dd>
                {knotsToMph(previous.intensity)} →{" "}
                {knotsToMph(snapshot.storm.intensity)} mph
              </dd>
            </div>
            <div>
              <dt>Central pressure</dt>
              <dd>
                {previous.pressure} → {snapshot.storm.pressure} mb
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p>No previous advisory comparison is available in the saved data.</p>
      )}
      <p className="muted">
        Changes describe official observations and forecasts, not an independent
        prediction.
      </p>
    </section>
  );
}
