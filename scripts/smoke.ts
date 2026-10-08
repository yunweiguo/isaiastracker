import assert from "node:assert/strict";

// Run against a running production build to catch streamed soft-404 responses.
const base = process.env.TEST_BASE_URL || "http://localhost:3100";
const routes: [string, number][] = [
  ["/", 200],
  ["/about", 200],
  ["/privacy", 200],
  ["/robots.txt", 200],
  ["/sitemap.xml", 200],
  ["/opengraph-image", 200],
  ["/storms/2026/isaias-al092026/unsupported-city", 404],
  ["/storms/2025/isaias-al092026", 404],
  ["/api/alerts/unsupported-city", 404],
  ["/api/cron/refresh", 401],
];
for (const [path, status] of routes) {
  const response = await fetch(new URL(path, base), {
    signal: AbortSignal.timeout(30_000),
    redirect: "manual",
  });
  assert.equal(response.status, status, path);
  if (path === "/") {
    const html = await response.text();
    assert.match(html, /<h1[\s>]/);
    assert.match(html, /rel="canonical"/);
    if (process.env.FEATURED_STORM_ID === "al092026") {
      assert.match(html, /<h1>Hurricane Isaias 2026 Tracker<\/h1>/);
      assert.match(html, /<title>Hurricane Isaias 2026 Tracker/);
      assert.match(
        html,
        /rel="canonical" href="https:\/\/isaiastracker.site\/"/,
      );
    }
  } else {
    await response.arrayBuffer();
  }
  console.log(`${status} ${path}`);
}
