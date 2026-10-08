import { test } from "node:test";
import assert from "node:assert/strict";
import { dataFiles, readData, writeData } from "../src/lib/storage";

test("R2 persists snapshots, paginates archives and never falls back to disk on a missing binding", async () => {
  const symbol = Symbol.for("__cloudflare-context__");
  const previous = Reflect.get(globalThis, symbol);
  const mode = process.env.WEATHER_STORAGE;
  const objects = new Map<string, string>();
  process.env.WEATHER_STORAGE = "r2";
  Reflect.set(globalThis, symbol, {
    env: {
      WEATHER_DATA: {
        async put(key: string, value: string) {
          objects.set(key, value);
        },
        async get(key: string) {
          const value = objects.get(key);
          return value
            ? {
                async json() {
                  return JSON.parse(value);
                },
              }
            : null;
        },
        async list({ cursor }: { cursor?: string }) {
          return cursor
            ? { objects: [{ key: "ep012026.json" }], truncated: false }
            : {
                objects: [{ key: "al092026.json" }],
                truncated: true,
                cursor: "page-2",
              };
        },
      },
    },
  });
  try {
    assert.equal(await readData("missing"), null);
    await writeData("al092026", { saved: true });
    assert.deepEqual(await readData("al092026"), { saved: true });
    assert.deepEqual(await dataFiles(), ["al092026.json", "ep012026.json"]);
    objects.set("invalid.json", "broken JSON");
    assert.equal(await readData("invalid"), null);
    Reflect.set(globalThis, symbol, { env: {} });
    await assert.rejects(writeData("fail", {}), /WEATHER_DATA/);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, symbol);
    else Reflect.set(globalThis, symbol, previous);
    if (mode === undefined) delete process.env.WEATHER_STORAGE;
    else process.env.WEATHER_STORAGE = mode;
  }
});
