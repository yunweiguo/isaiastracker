import { metadata as metadataForPage } from "@/lib/seo";
export const metadata = metadataForPage(
  "About our data & forecast maps",
  "How Stormscope uses official NHC forecasts and NWS local alerts, including update times and map limitations.",
  "/about",
);
export default function About() {
  return (
    <article className="prose">
      <h1>
        Official data.
        <br />
        Clearly presented.
      </h1>
      <p>
        Stormscope is an independent tool that brings National Hurricane Center
        forecasts and National Weather Service local alerts into one view. We do
        not create weather forecasts or evacuation instructions.
      </p>
      <h2>Where the data comes from</h2>
      <ul>
        <li>
          <a href="https://www.nhc.noaa.gov/CurrentStorms.json">
            NHC current storms feed
          </a>
          : storm identity, classification, location and links to official
          products.
        </li>
        <li>
          <a href="https://www.nhc.noaa.gov/gis/">NHC GIS products</a>: forecast
          points, forecast track and the official uncertainty cone.
        </li>
        <li>
          <a href="https://www.weather.gov/documentation/services-web-api">
            NWS API
          </a>
          : active warnings and watches at the representative coordinates shown
          on each city page.
        </li>
      </ul>
      <h2>Freshness and saved forecasts</h2>
      <p>
        The tracker checks for updates about every five minutes when its
        scheduled refresh is running. NHC data is marked stale after ten minutes
        without a successful check; local alerts after six minutes. Source
        publication times are shown separately from alert retrieval times.
        Weather products can be published at different times.
      </p>
      <p>
        If a source is unavailable, the site may show the last saved data with a
        warning. Advisories older than nine hours are flagged. A storm absent
        from a fresh NHC active list is displayed as an archive. When that list
        is missing or stale, current storm activity is unconfirmed. A saved
        forecast is not a statement about current conditions.
      </p>
      <h2 id="forecast-cone">What the forecast cone means</h2>
      <p>
        The cone describes uncertainty in the forecast track of the storm
        center. It does not show the full extent of damaging winds, rainfall or
        storm surge. Being outside the cone does not mean you are safe.{" "}
        <a href="https://www.nhc.noaa.gov/aboutcone.shtml">
          Read NHC’s explanation.
        </a>
      </p>
      <h2>Understanding city pages</h2>
      <p>
        City alerts are queried at a representative city coordinate, not your
        address. They cover all active NWS hazards at that point and are not all
        necessarily caused by the selected storm. No returned alerts does not
        mean no risk.
      </p>
      <p>
        We do not infer a city arrival time from storm speed or distance. Follow
        the NHC wind-arrival products and local NWS forecasts for timing
        guidance.
      </p>
      <h2>Units and forecast comparisons</h2>
      <p>
        Forecast wind speeds are converted from knots to miles per hour and
        rounded to the nearest whole number. Times in the forecast-point table
        follow the source labels. City alert timestamps use the city’s time
        zone. Advisory comparisons use the previously saved official advisory.
      </p>
      <h2>Questions about a forecast?</h2>
      <p>
        Use the official advisory and local NWS links throughout this site.
        Follow local emergency management for evacuation and shelter
        instructions. Stormscope is not affiliated with NOAA, NHC or NWS.
      </p>
    </article>
  );
}
