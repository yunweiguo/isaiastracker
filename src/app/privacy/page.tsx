import { metadata as pageMetadata } from "@/lib/seo";
import { analyticsConfig } from "@/lib/config";
export const metadata = pageMetadata(
  "Privacy & analytics",
  "How Stormscope handles city searches, analytics and third-party map requests.",
  "/privacy",
);
export default function Privacy() {
  return (
    <article className="prose">
      <h1>Privacy, in plain language.</h1>
      <p>
        You can use the tracker without an account or sharing your precise
        location. City searches run in your browser against a short list of
        supported cities. City pages request public weather data using fixed
        city coordinates.
      </p>
      <p>
        If you choose “Use my location,” your browser asks permission and opens
        the official NWS forecast with coordinates rounded to four decimal
        places in the URL. NWS receives those coordinates, and the URL may remain
        in your browser history. Stormscope does not store them. NWS forecasts
        are only available where that service provides coverage.
      </p>
      <h2>Analytics</h2>
      <p>
        {analyticsConfig.plausibleSrc
          ? "Plausible is configured to measure aggregate page views and tool interactions on the production site. It does not use analytics cookies."
          : "Plausible is not currently configured."}
      </p>
      <p>
        {analyticsConfig.gaId
          ? "Google Analytics loads automatically on the production site to measure visits and tool interactions. It may use cookies to measure visits. Google advertising signals and ad personalization are disabled."
          : "Google Analytics is not currently configured."}
      </p>
      <p>
        When enabled, tool events describe actions such as selecting a supported
        city or moving the forecast slider. We do not send free-text search
        queries or precise user coordinates in these events.
      </p>
      <h2>Maps, fonts and external links</h2>
      <p>
        Your browser requests map tiles from the configured map provider, if
        enabled, and fonts from Google Fonts. These providers
        receive the technical information needed to serve requests, including
        your IP address. Their privacy policies apply to those requests.
      </p>
      <p>
        Links to NOAA, NWS and other sites take you to external services
        governed by their own policies.
      </p>
      <h2>Stored weather data</h2>
      <p>
        The service caches public storm forecasts and local alerts. This cache
        contains weather information, not visitor accounts or personal location
        histories. Hosting providers may maintain technical access logs.
      </p>
      <h2>Your choices</h2>
      <p>
        You can block cookies and third-party resources with your browser
        settings. Map and font blocking may change how the page looks; forecast
        information remains available as text.
      </p>
    </article>
  );
}
