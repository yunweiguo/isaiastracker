import { cityBySlug } from "@/lib/config";
import { getAlerts } from "@/lib/weather";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ city: string }> },
) {
  const { city } = await params;
  if (!cityBySlug(city))
    return Response.json({ error: "Unknown city" }, { status: 404 });
  try {
    return Response.json(await getAlerts(city), {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  } catch {
    return Response.json(
      { error: "Official local alerts are unavailable. Check weather.gov." },
      { status: 503 },
    );
  }
}
