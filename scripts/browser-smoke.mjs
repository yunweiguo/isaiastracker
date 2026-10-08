// Requires Playwright from your existing browser tooling; no production dependency.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const base = process.env.TEST_BASE_URL || "http://localhost:3100";
  assert.ok(
    ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
    "Browser checks must target a local server",
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(base).origin
      ? route.continue()
      : route.abort(),
  );
  await page.goto(base);
  await page.waitForSelector(".leaflet-container");
  assert.equal(
    await page.locator("h1").innerText(),
    "Hurricane Isaias 2026 Tracker",
  );
  assert.equal(
    await page.locator("link[rel=canonical]").getAttribute("href"),
    "https://isaiastracker.site/",
  );
  await page.evaluate(() => {
    window.qaEvents = [];
    window.gtag = (...args) => window.qaEvents.push(["ga", ...args]);
    window.plausible = (...args) =>
      window.qaEvents.push(["plausible", ...args]);
  });
  await page.getByRole("checkbox", { name: "Forecast cone" }).uncheck();
  let events = await page.evaluate(() => window.qaEvents);
  assert.deepEqual(
    events.map((e) => (e[0] === "ga" ? e[2] : e[1])),
    ["toggle_cone", "toggle_cone"],
  );
  const slider = page.getByRole("slider", { name: "Forecast time" });
  assert.equal(await slider.isEnabled(), true);
  await slider.click({ position: { x: 1, y: 5 } });
  assert.equal(
    (await page.evaluate(() => window.qaEvents)).filter(
      (e) => e[0] === "ga" && e[2] === "explore_forecast",
    ).length,
    0,
  );
  await slider.focus();
  await slider.press("ArrowRight");
  await slider.press("Tab");
  events = await page.evaluate(() => window.qaEvents);
  assert.equal(
    events.filter((e) => e[0] === "ga" && e[2] === "explore_forecast").length,
    1,
  );
  assert.equal(
    events.filter((e) => e[0] === "plausible" && e[1] === "explore_forecast")
      .length,
    1,
  );
  await page.getByRole("searchbox").fill("Pensacola");
  await page.locator(".city-results a").click();
  await page.waitForURL("**/pensacola");
  events = await page.evaluate(() => window.qaEvents);
  assert.equal(
    events.filter((e) => e[0] === "ga" && e[2] === "select_city").length,
    1,
  );
  await page.locator(".city-results a.selected").click();
  events = await page.evaluate(() => window.qaEvents);
  assert.equal(
    events.filter((e) => e[0] === "ga" && e[2] === "select_city").length,
    1,
  );
  assert.ok(!JSON.stringify(events).includes("query"));
  assert.match(
    await page.locator("meta[name=robots]").getAttribute("content"),
    /noindex/,
  );
  assert.equal(await page.locator("#ga-script, #plausible-script").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Browser: cone, keyboard slider, city navigation, no duplicate custom events, noindex and local analytics suppression passed",
  );
  // Emulate the public origin, forwarding only app requests to the local server.
  // Analytics scripts return empty test responses; no production traffic is sent.
  const publicPage = await browser.newPage();
  await publicPage.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "https://isaiastracker.site") {
      const response = await route.fetch({
        url: new URL(url.pathname + url.search, base).href,
      });
      return route.fulfill({ response });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    });
  });
  await publicPage.goto("https://isaiastracker.site/");
  await publicPage.waitForFunction(() =>
    (window.dataLayer || []).some((e) => e[1] === "page_view"),
  );
  await publicPage
    .getByRole("link", { name: "Data & methodology", exact: true })
    .click();
  await publicPage.waitForURL("**/about");
  await publicPage.waitForFunction(
    () =>
      (window.dataLayer || []).filter((e) => e[1] === "page_view").length >= 2,
  );
  const views = await publicPage.evaluate(() =>
    (window.dataLayer || [])
      .filter((e) => e[1] === "page_view")
      .map((e) => e[2].page_location),
  );
  assert.deepEqual(views, [
    "https://isaiastracker.site/",
    "https://isaiastracker.site/about",
  ]);
  assert.equal(await publicPage.locator("#ga-script").count(), 1);
  assert.equal(await publicPage.locator("#plausible-script").count(), 1);
  console.log(
    "Browser: one GA page_view per initial load/SPA navigation and one script per provider passed (provider delivery not tested)",
  );
} finally {
  await browser.close();
}
