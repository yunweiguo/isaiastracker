import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

const advisory = "2026-10-08T00:30:00.000Z";
const alertTime = "2026-10-08T01:30:00.000Z";
const storm = {
  id: "al092026", name: "Isaias", classification: "HU", intensity: 70,
  pressure: 980, latitudeNumeric: 25, longitudeNumeric: -88,
  movementDir: 30, movementSpeed: 8, lastUpdate: advisory,
  publicAdvisory: { url: "https://www.nhc.noaa.gov/" },
};
const track = {
  line: { type: "FeatureCollection", features: [{
    type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[-88, 25], [-87, 26]] },
  }] },
  cone: { type: "FeatureCollection", features: [{
    type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-89, 24], [-86, 24], [-86, 27], [-89, 24]]] },
  }] },
  points: { type: "FeatureCollection", features: [{
    type: "Feature", geometry: { type: "Point", coordinates: [-88, 25] },
    properties: { TAU: 0, DATELBL: "7:30 PM Wed", TIMEZONE: "CDT", MAXWIND: 70 },
  }] },
};
const directory = await mkdtemp(join(tmpdir(), "stormscope-browser-"));
const write = (name: string, value: unknown) =>
  writeFile(join(directory, `${name}.json`), JSON.stringify(value));
await Promise.all([
  write("catalog", { storms: [storm], fetchedAt: advisory, stale: false }),
  write(storm.id, { storm, track, previous: null, fetchedAt: advisory }),
  write("alerts-pensacola", {
    alerts: [{ id: "test-alert", event: "Test warning", headline: "Test only",
      description: "Synthetic browser fixture", instruction: "", severity: "Severe",
      sent: alertTime, expires: "9999-01-01T00:00:00.000Z",
      url: "https://forecast.weather.gov/MapClick.php?lat=30.4213&lon=-87.2169" }],
    fetchedAt: alertTime, stale: false,
  }),
]);

const port = await new Promise<number>((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    server.close(() => resolve(address.port));
  });
});
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, DATA_DIR: directory, WEATHER_STORAGE: "local", FEATURED_STORM_ID: storm.id, INDEXNOW_ENABLED: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
child.stdout?.on("data", (chunk) => { serverOutput += String(chunk); });
child.stderr?.on("data", (chunk) => { serverOutput += String(chunk); });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

async function open(context: BrowserContext, path = "/") {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration/i.test(message.text()))
      errors.push(message.text());
  });
  await page.route(/https?:\/\/(?!127\.0\.0\.1).*/, (route) => route.abort());
  const response = await page.goto(origin + path);
  try {
    await page.locator(".time-zone-switch").waitFor({ timeout: 5000 });
  } catch {
    throw new Error(`Tracker missing (${response?.status()}): ${(await page.locator("body").innerText()).slice(0, 1000)}\n${serverOutput}`);
  }
  return { page, errors };
}

try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Next.js exited: ${serverOutput}`);
    try {
      if ((await fetch(origin)).ok) break;
    } catch { /* Server is starting. */ }
    if (attempt === 99) throw new Error(`Next.js did not start: ${serverOutput}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const response = await fetch(origin);
  const policy = response.headers.get("permissions-policy");
  assert.equal(policy, "camera=(), microphone=(), geolocation=(self)");
  const ssr = await response.text();
  assert.match(ssr, /<time[^>]*2026-10-08T00:30:00\.000Z[^>]*>/);
  assert.match(ssr, /Oct 8, 2026, 12:30 AM UTC/);

  browser = await chromium.launch({ headless: true });
  for (const zone of ["America/New_York", "Asia/Singapore"]) {
    const context = await browser.newContext({ timezoneId: zone });
    const { page, errors } = await open(context);
    const time = page.locator(`time[datetime="${advisory}"]`).first();
    await time.waitFor();
    await page.locator(".time-zone-switch").filter({ hasText: "Local" }).waitFor();
    const local = await time.textContent();
    assert.match(local || "", zone === "America/New_York" ? /Oct 7, 2026/ : /Oct 8, 2026/);
    assert.match((await page.locator(".storm-stats").textContent()) || "", /80 mph · 70 kt · 130 km\/h/);
    assert.match((await page.locator(".storm-label").textContent()) || "", /80 mph/);
    await page.locator(".time-zone-switch").click();
    await page.locator(".time-zone-switch").filter({ hasText: "UTC" }).waitFor();
    assert.match((await time.textContent()) || "", /Oct 8, 2026, 12:30 AM UTC/);
    for (const label of await page.locator(`time[datetime="${advisory}"]`).allTextContents())
      assert.equal(label, await time.textContent());
    await page.getByRole("link", { name: /Pensacola/ }).first().click();
    await page.getByText("Test only").first().waitFor();
    assert.match((await page.locator(`time[datetime="${alertTime}"]`).first().textContent()) || "", /Oct 8, 2026, 1:30 AM UTC/);
    assert.match((await page.locator(`time[datetime="${advisory}"]`).first().textContent()) || "", /Oct 8, 2026, 12:30 AM UTC/);
    await page.locator(".time-zone-switch").click();
    await page.locator(".time-zone-switch").filter({ hasText: "Local" }).waitFor();
    assert.match((await page.locator(`time[datetime="${alertTime}"]`).first().textContent()) || "", zone === "America/New_York" ? /Oct 7, 2026/ : /Oct 8, 2026/);
    assert.equal(await page.locator(".map-timeline strong").textContent(), "7:30 PM Wed CDT");
    await page.getByRole("link", { name: /Isaias 2026/ }).first().click();
    assert.match((await page.locator("table").textContent()) || "", /7:30 PM Wed CDT.*80 mph/s);
    await page.locator(".time-zone-switch").filter({ hasText: "Local" }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  }

  const success = await browser.newContext({ geolocation: { latitude: 30.1234567, longitude: -87.9876543 }, permissions: ["geolocation"] });
  const { page: successPage, errors: successErrors } = await open(success);
  await successPage.route("https://forecast.weather.gov/**", (route) => route.fulfill({ status: 200, body: "NWS test destination" }));
  await successPage.getByRole("button", { name: /Use my location at NWS/ }).click();
  await successPage.waitForURL("https://forecast.weather.gov/**");
  const target = new URL(successPage.url());
  assert.equal(target.searchParams.get("lat"), "30.1235");
  assert.equal(target.searchParams.get("lon"), "-87.9877");
  assert.deepEqual(successErrors, []);
  await success.close();

  for (const [kind, script, expected] of [
    ["denied", "Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(_ok, fail) { fail({code: 1}); } } });", /permission was denied/],
    ["position-unavailable", "Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(_ok, fail) { fail({code: 2}); } } });", /location is unavailable/],
    ["native-timeout", "Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(_ok, fail) { fail({code: 3}); } } });", /timed out/],
    ["unavailable", "Object.defineProperty(navigator, 'geolocation', { value: undefined });", /cannot find your location/],
    ["insecure", "Object.defineProperty(window, 'isSecureContext', { value: false });", /secure connection/],
  ] as const) {
    const context = await browser.newContext();
    await context.addInitScript({ content: script });
    const { page, errors } = await open(context);
    await page.getByRole("button", { name: /Use my location at NWS/ }).click();
    await page.getByRole("status").filter({ hasText: expected }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Use my location at NWS/ }).isEnabled(), true, kind);
    assert.equal(await page.getByRole("link", { name: /Search locations on NWS/ }).count(), 1);
    assert.deepEqual(errors, []);
    await context.close();
  }

  const timeoutContext = await browser.newContext();
  await timeoutContext.addInitScript({ content: "window.geoCalls = 0; Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition() { window.geoCalls++; } } });" });
  const { page: timeoutPage, errors: timeoutErrors } = await open(timeoutContext);
  await timeoutPage.clock.install();
  assert.equal(await timeoutPage.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls), 0);
  await timeoutPage.getByRole("button", { name: /Use my location at NWS/ }).click();
  assert.equal(await timeoutPage.getByRole("button", { name: "Getting your location..." }).isDisabled(), true);
  assert.equal(await timeoutPage.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls), 1);
  await timeoutPage.clock.fastForward(11_100);
  await timeoutPage.getByRole("status").filter({ hasText: /timed out/ }).waitFor();
  assert.equal(await timeoutPage.getByRole("button", { name: /Use my location at NWS/ }).isEnabled(), true);
  assert.deepEqual(timeoutErrors, []);
  await timeoutContext.close();

  const fallbackContext = await browser.newContext();
  await fallbackContext.addInitScript({ content: "const original = Intl.DateTimeFormat.prototype.resolvedOptions; Intl.DateTimeFormat.prototype.resolvedOptions = function () { return { ...original.call(this), timeZone: 'Invalid/Zone' }; };" });
  const { page: fallbackPage, errors: fallbackErrors } = await open(fallbackContext);
  await fallbackPage.locator(".time-zone-switch").filter({ hasText: "Local" }).waitFor();
  assert.match((await fallbackPage.locator(`time[datetime="${advisory}"]`).first().textContent()) || "", /Oct 8, 2026, 12:30 AM UTC/);
  assert.deepEqual(fallbackErrors, []);
  await fallbackContext.close();
  console.log("Browser smoke passed: timezone, hydration, city navigation, geolocation and policy");
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  await rm(directory, { recursive: true, force: true });
}
