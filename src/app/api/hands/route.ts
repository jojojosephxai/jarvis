import { resolveHand, type HandDecision } from "@/lib/hands";
import { gateFor } from "@/lib/hands-policy";
import { isStringRecord, isToolName } from "@/lib/types";

function readDecision(value: unknown): HandDecision | null {
  if (value === "yes" || value === "no") return value;
  return null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON message." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "The confirm message was not in the right shape." }, { status: 400 });
  }

  const record = body as { tool?: unknown; input?: unknown; decision?: unknown };
  if (!isToolName(record.tool)) {
    return Response.json({ error: "That is not a hand I can run." }, { status: 400 });
  }

  const decision = readDecision(record.decision);
  if (!decision) {
    return Response.json({ error: "Choose yes or no." }, { status: 400 });
  }

  const input = record.input ?? {};
  if (!isStringRecord(input)) {
    return Response.json({ error: "The plan inputs were not in the right shape." }, { status: 400 });
  }
  if (gateFor(record.tool, input) !== "confirm") {
    return Response.json({ error: "That hand does not wait for a yes." }, { status: 400 });
  }

  try {
    const hand = await resolveHand({ tool: record.tool, input }, decision);
    return Response.json({ reply: hand.reply, plan: hand.plan, receipts: hand.receipts });
  } catch {
    return Response.json({ error: "The hand hit a problem." }, { status: 500 });
  }
}
