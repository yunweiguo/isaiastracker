import { timingSafeEqual } from "node:crypto";
import { refreshWeather } from "@/lib/indexnow";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    auth.length !== expected.length ||
    !timingSafeEqual(auth, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await refreshWeather(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "Refresh failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return Response.json(
      {
        error:
          "Refresh or indexing failed. Previous weather data was retained.",
      },
      { status: 503 },
    );
  }
}
