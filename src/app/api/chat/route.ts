import { readMessages, streamTurn, think } from "@/lib/brain";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON message." }, { status: 400 });
  }

  const messages = readMessages(body);
  if (!messages) {
    return Response.json({ error: "Messages were not in the right shape." }, { status: 400 });
  }

  const stream = Boolean(body && typeof body === "object" && (body as { stream?: unknown }).stream === true);

  try {
    if (!stream) {
      const result = await think(messages);
      return Response.json(result);
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of streamTurn(messages)) {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
        } catch {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error" })}\n`));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "The brain hit a problem." }, { status: 500 });
  }
}
