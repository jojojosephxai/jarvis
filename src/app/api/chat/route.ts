import { readMessages, think } from "@/lib/brain";

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

  try {
    const result = await think(messages);
    return Response.json(result);
  } catch {
    return Response.json({ error: "The brain hit a problem." }, { status: 500 });
  }
}
