import type { Metadata } from "next";
import { siteName, siteUrl, isPublicSite } from "./config";
export function metadata(
  title: string,
  description: string,
  path = "/",
): Metadata {
  return {
    // All URLs below are absolute; preserve the homepage's explicit trailing slash.
    metadataBase: null,
    title,
    description,
    alternates: { canonical: `${siteUrl}${path}` },
    openGraph: {
      title,
      description,
      url: `${siteUrl}${path}`,
      siteName,
      type: "website",
      locale: "en_US",
      images: [{ url: `${siteUrl}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${siteUrl}/opengraph-image`],
    },
    robots: { index: isPublicSite, follow: isPublicSite },
  };
}
export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
