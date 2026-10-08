import type { MetadataRoute } from "next";
import { isPublicSite, siteUrl } from "@/lib/config";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      ...(isPublicSite
        ? { allow: "/", disallow: ["/api/"] }
        : { disallow: "/" }),
    },
    ...(isPublicSite ? { sitemap: `${siteUrl}/sitemap.xml` } : {}),
  };
}
