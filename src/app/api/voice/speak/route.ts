import { synthesizeAzure } from "@/lib/voice/azure";

export const dynamic = "force-dynamic";

function readText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const text = (body as { text?: unknown }).text;
  return typeof text === "string" ? text : null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { live: false, reason: "failed", detail: "The speak request was not valid JSON." },
      { status: 400 },
    );
  }

  const text = readText(body);
  if (text === null) {
    return Response.json(
      { live: false, reason: "failed", detail: "Send JSON like {\"text\":\"hello\"}." },
      { status: 400 },
    );
  }

  const result = await synthesizeAzure(text);
  if (!result.ok) {
    return Response.json(
      { live: false, reason: result.reason, detail: result.detail },
      { status: result.httpStatus },
    );
  }

  const copy = new ArrayBuffer(result.bytes.byteLength);
  new Uint8Array(copy).set(result.bytes);
  return new Response(copy, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store",
      "X-Voice-Mouth": "azure",
      "X-Voice-British": "true",
      "X-Voice-Name": result.voice,
      "X-Voice-Clipped": result.clipped ? "true" : "false",
    },
  });
}
