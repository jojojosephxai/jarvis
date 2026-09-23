import { assertNever } from "./assert";
import { CALL_REFUSAL, demoChatReply } from "./demo-brain";
import { brainMode, grokChat } from "./grok";
import { resolveHand } from "./hands";
import { parseIntent, parseToolJson } from "./intent";
import type { ChatMessageInput, ChatResponse } from "./types";

const MAX_MESSAGES = 16;
const MAX_CONTENT = 2000;

export function readMessages(body: unknown): ChatMessageInput[] | null {
  if (!body || typeof body !== "object") return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return null;
  }

  const parsed: ChatMessageInput[] = [];
  for (const entry of messages) {
    if (!entry || typeof entry !== "object") return null;
    const role = (entry as { role?: unknown }).role;
    const content = (entry as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const trimmed = content.trim();
    if (!trimmed) return null;
    parsed.push({ role, content: trimmed.slice(0, MAX_CONTENT) });
  }

  if (parsed.at(-1)?.role !== "user") return null;
  return parsed;
}

export async function think(messages: ChatMessageInput[]): Promise<ChatResponse> {
  const latest = messages.at(-1);
  if (!latest || latest.role !== "user") {
    return { reply: "Say that once more?", mode: brainMode(), receipts: [] };
  }

  const parsed = parseIntent(latest.content);
  switch (parsed.kind) {
    case "refuse-call":
      return { reply: CALL_REFUSAL, mode: brainMode(), receipts: [] };
    case "tool": {
      const hand = await resolveHand(parsed.request);
      return { reply: hand.reply, mode: brainMode(), receipts: hand.receipts, plan: hand.plan };
    }
    case "chat":
      return talk(messages, latest.content);
    default:
      return assertNever(parsed);
  }
}

async function talk(messages: ChatMessageInput[], latest: string): Promise<ChatResponse> {
  if (brainMode() === "demo") {
    return { reply: demoChatReply(latest), mode: "demo", receipts: [] };
  }

  const result = await grokChat(messages);
  if (!result.ok) {
    return {
      reply: demoChatReply(latest),
      mode: "demo",
      receipts: [],
      notice: `Grok didn't answer because ${result.reason}. This reply is from the demo brain.`,
    };
  }

  const call = parseToolJson(result.text);
  switch (call.kind) {
    case "none":
      return { reply: result.text, mode: "grok", receipts: [] };
    case "unknown":
      return {
        reply: `I don't have a tool named ${call.name}, so I didn't run anything.`,
        mode: "grok",
        receipts: [],
      };
    case "call": {
      const hand = await resolveHand(call.request);
      return { reply: hand.reply, mode: "grok", receipts: hand.receipts, plan: hand.plan };
    }
    default:
      return assertNever(call);
  }
}
