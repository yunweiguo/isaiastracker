export const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Stormscope";
export const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
).origin;
export const isPublicSite =
  siteUrl.startsWith("https://") &&
  !/localhost|127\.0\.0\.1|example\.(com|org)/.test(new URL(siteUrl).hostname);
export const analyticsConfig = {
  gaId: process.env.NEXT_PUBLIC_GA_ID || "",
  plausibleSrc: process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL || "",
  plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || "",
};
export const cities = [
  {
    slug: "pensacola",
    name: "Pensacola",
    state: "Florida",
    code: "FL",
    lat: 30.4213,
    lon: -87.2169,
    zone: "America/Chicago",
    office: "https://www.weather.gov/mob/",
  },
  {
    slug: "mobile",
    name: "Mobile",
    state: "Alabama",
    code: "AL",
    lat: 30.6954,
    lon: -88.0399,
    zone: "America/Chicago",
    office: "https://www.weather.gov/mob/",
  },
  {
    slug: "new-orleans",
    name: "New Orleans",
    state: "Louisiana",
    code: "LA",
    lat: 29.9511,
    lon: -90.0715,
    zone: "America/Chicago",
    office: "https://www.weather.gov/lix/",
  },
  {
    slug: "biloxi",
    name: "Biloxi",
    state: "Mississippi",
    code: "MS",
    lat: 30.396,
    lon: -88.8853,
    zone: "America/Chicago",
    office: "https://www.weather.gov/lix/",
  },
  {
    slug: "tallahassee",
    name: "Tallahassee",
    state: "Florida",
    code: "FL",
    lat: 30.4383,
    lon: -84.2807,
    zone: "America/New_York",
    office: "https://www.weather.gov/tae/",
  },
] as const;
export type City = (typeof cities)[number];
export const cityBySlug = (slug: string) =>
  cities.find((city) => city.slug === slug);

// Only add a storm/city pair after reviewing official geographic evidence or
// publishing independent local content. Empty by default; browsing still works.
export const cityCoverage: Record<
  string,
  Partial<
    Record<
      City["slug"],
      {
        summary: string;
        sourceUrl: string;
      }
    >
  >
> = {};

// Public build-time settings. Browser tile tokens must be domain-restricted.
export const mapTiles = {
  url:
    process.env.NEXT_PUBLIC_MAP_TILE_URL ||
    (process.env.NODE_ENV === "development"
      ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      : ""),
  attribution:
    process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
    (process.env.NODE_ENV === "development"
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      : ""),
};
