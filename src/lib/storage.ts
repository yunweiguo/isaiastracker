import { mkdir, readFile, rename, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { R2Bucket } from "@cloudflare/workers-types";

declare global {
  interface CloudflareEnv {
    WEATHER_DATA: R2Bucket;
    CRON_SECRET: string;
  }
}

function bucket() {
  if (process.env.WEATHER_STORAGE !== "r2") return null;
  const value = getCloudflareContext().env.WEATHER_DATA;
  if (!value) throw new Error("WEATHER_DATA binding is required");
  return value;
}
const directory = () => process.env.DATA_DIR || join(process.cwd(), ".data");
export async function readData<T>(name: string): Promise<T | null> {
  try {
    const r2 = bucket();
    if (r2) {
      const object = await r2.get(`${name}.json`);
      return object ? await object.json<T>() : null;
    }
    return JSON.parse(
      await readFile(join(directory(), `${name}.json`), "utf8"),
    ) as T;
  } catch {
    return null;
  }
}
export async function writeData(name: string, value: unknown) {
  const r2 = bucket();
  if (r2) {
    await r2.put(`${name}.json`, JSON.stringify(value), {
      httpMetadata: { contentType: "application/json" },
    });
    return;
  }
  await mkdir(directory(), { recursive: true });
  const path = join(directory(), `${name}.json`);
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value));
  await rename(temporary, path);
}
export async function dataFiles(): Promise<string[]> {
  const r2 = bucket();
  if (!r2)
    return readdir(/* turbopackIgnore: true */ directory()).catch(() => []);
  const files: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await r2.list({ cursor });
    files.push(...page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return files;
}
