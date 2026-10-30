import { loadDoNext } from "@/lib/do-next.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const data = await loadDoNext();
  return Response.json(data ?? { error: "Couldn't load." }, {
    status: data ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
