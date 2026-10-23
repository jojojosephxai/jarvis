import { readMessages, streamTurn, think, startChatTiming } from "@/lib/brain";

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

  const timing = startChatTiming(messages.at(-1)!.content, request.headers.get("x-jarvis-turn"));
  try {
    if (!stream) {
      const result = await think(messages);
      timing.first();
      timing.done();
      return Response.json(result);
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of streamTurn(messages, { onSources: sources => {
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: "sources", sources })}\n`));
          }, onToken: text => {
            timing.first();
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: "token", text })}\n`));
          } })) {
            if (event.type === "sentence") timing.first();
            if (event.type === "done") timing.done();
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
        } catch {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error" })}\n`));
        } finally {
          timing.done();
          controller.close();
        }
      },
    });
    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    timing.done();
    return Response.json({ error: "The brain hit a problem." }, { status: 500 });
  }
}
