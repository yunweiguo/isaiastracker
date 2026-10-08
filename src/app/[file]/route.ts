export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const key = process.env.INDEXNOW_KEY;
  if (!key || !/^[a-zA-Z0-9-]{8,128}$/.test(key) || file !== `${key}.txt`)
    return new Response("Not found", { status: 404 });
  return new Response(key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
