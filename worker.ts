// @ts-ignore OpenNext generates this module during the Cloudflare build.
import handler from "./.open-next/worker.js";
import type { ExportedHandler } from "@cloudflare/workers-types";

export default {
  fetch: handler.fetch,
  async scheduled(_event, env, ctx) {
    if (!env.CRON_SECRET) throw new Error("CRON_SECRET is required");
    const response = await handler.fetch(
      new Request("https://isaiastracker.site/api/cron/refresh", {
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      }),
      env,
      ctx,
    );
    if (!response.ok)
      throw new Error(`Scheduled refresh failed: ${response.status}`);
    console.log("Scheduled refresh", await response.json());
  },
} satisfies ExportedHandler<CloudflareEnv>;
