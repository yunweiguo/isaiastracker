import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Pages use explicit weather snapshots; no ISR or Next data cache is needed.
export default defineCloudflareConfig();
