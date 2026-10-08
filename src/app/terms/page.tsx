import { metadata as pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Terms of use",
  "Terms for using Stormscope's independent hurricane tracker and public weather data.",
  "/terms",
);

export default function Terms() {
  return (
    <article className="prose">
      <h1>Terms of use</h1>
      <p>
        Stormscope is an independent information tool. Its forecasts and alerts
        come from public NHC and NWS sources. Stormscope does not issue forecasts,
        warnings or evacuation instructions. For safety decisions, check current
        official advisories and follow local emergency management.
      </p>
      <h2>Data and availability</h2>
      <p>
        Weather data may be delayed, incomplete or unavailable. Archived
        advisories describe past forecasts, not current conditions. We may
        update or discontinue the site at any time.
      </p>
      <h2>External services</h2>
      <p>
        Links to official agencies and other providers lead to services with
        their own terms and policies. See our <a href="/privacy">privacy page</a>{" "}
        for information about analytics and external requests.
      </p>
      <h2>Contact</h2>
      <p>
        Report a site error or share feedback through the{" "}
        <a href="https://github.com/yunweiguo/isaiastracker/issues/new">
          project issue tracker
        </a>.
      </p>
    </article>
  );
}
