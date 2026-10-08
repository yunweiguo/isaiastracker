import { test } from "node:test";
import assert from "node:assert/strict";
import { trackEvent } from "../src/components/analytics";

test("snake_case interactions dispatch once per provider; provider failures cannot break the tool", () => {
  const previous = globalThis.window;
  const plausible: unknown[][] = [],
    ga: unknown[][] = [];
  globalThis.window = {
    plausible: (...args: unknown[]) => {
      plausible.push(args);
    },
    gtag: (...args: unknown[]) => {
      ga.push(args);
    },
  } as unknown as Window & typeof globalThis;
  try {
    trackEvent("select_city", { city: "pensacola" });
    trackEvent("toggle_cone");
    trackEvent("explore_forecast");
    assert.deepEqual(plausible, [
      ["select_city", { props: { city: "pensacola" } }],
      ["toggle_cone", { props: {} }],
      ["explore_forecast", { props: {} }],
    ]);
    assert.deepEqual(ga, [
      ["event", "select_city", { city: "pensacola" }],
      ["event", "toggle_cone", {}],
      ["event", "explore_forecast", {}],
    ]);
    window.plausible = () => {
      throw new Error("Provider unavailable");
    };
    assert.doesNotThrow(() => trackEvent("toggle_cone"));
    assert.equal(ga.length, 4);
    window.gtag = () => {
      throw new Error("Provider unavailable");
    };
    assert.doesNotThrow(() => trackEvent("explore_forecast"));
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, "window");
    else globalThis.window = previous;
  }
});
