import Link from "next/link";
import type { Metadata } from "next";
import Analytics from "@/components/analytics";
import { siteName, siteUrl } from "@/lib/config";
import { jsonLd, metadata as pageMetadata } from "@/lib/seo";
import "leaflet/dist/leaflet.css";
import "./globals.css";
export const metadata: Metadata = {
  ...metadataBase(),
  metadataBase: new URL(siteUrl),
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: {
      "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || "",
    },
  },
};
function metadataBase() {
  return pageMetadata(
    "Hurricane path maps & local alerts | " + siteName,
    "Track active tropical storms with official NHC path maps, forecast updates and NWS local alerts.",
  );
}
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="site-header">
          <div className="header-inner">
            <Link className="brand" href="/" aria-label={`${siteName} home`}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M25 6c-8-5-20 2-17 12 2 7 11 7 14 2 3-5-2-11-7-9-3 1-3 5-1 7"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <path
                  d="M7 26c7 5 17 0 18-8"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
              {siteName}
            </Link>
            <nav aria-label="Main navigation">
              <Link href="/">Storm tracker</Link>
              <Link href="/about">Data & methodology</Link>
            </nav>
            <span className="header-source">
              <span /> Official-source data
            </span>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div>
            <Link className="brand" href="/">
              {siteName}
            </Link>
            <p>Understand the forecast. Stay connected to official guidance.</p>
            <small>
              Independent weather tool. Not affiliated with NOAA or NWS.
            </small>
          </div>
          <nav aria-label="Footer navigation">
            <Link href="/about">About & sources</Link>
            <a href="https://github.com/yunweiguo/isaiastracker/issues/new">
              Contact
            </a>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="https://www.nhc.noaa.gov/">National Hurricane Center ↗</a>
          </nav>
        </footer>
        <Analytics />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": `${siteUrl}/#website`,
                  name: siteName,
                  url: siteUrl,
                  inLanguage: "en",
                  publisher: { "@id": `${siteUrl}/#publisher` },
                },
                {
                  "@type": "Organization",
                  "@id": `${siteUrl}/#publisher`,
                  name: siteName,
                  url: siteUrl,
                  sameAs: ["https://github.com/yunweiguo/isaiastracker"],
                },
              ],
            }),
          }}
        />
      </body>
    </html>
  );
}
