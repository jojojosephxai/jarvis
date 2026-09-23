import { assertNever } from "./assert";
import { CALL_REFUSAL, demoChatReply } from "./demo-brain";
import { brainMode, grokChat } from "./grok";
import { parseIntent, parseToolJson } from "./intent";
import { executeTool } from "./tools";
import type { ChatMessageInput, ChatResponse, Receipt } from "./types";

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

function confirmTool(receipt: Receipt): string {
  if (receipt.status === "failed") return receipt.outcome;
  switch (receipt.tool) {
    case "calendar.write":
      return `Saved “${receipt.input.title}” for ${receipt.input.when}. The receipt is below. This stays on the demo calendar on this computer.`;
    case "calendar.list":
      return receipt.outcome;
    case "notes.recall":
      return receipt.outcome;
    case "notes.keep":
      return "I saved that note. The receipt is below.";
    default:
      return assertNever(receipt.tool);
  }
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
      const receipt = await executeTool(parsed.request);
      return { reply: confirmTool(receipt), mode: brainMode(), receipts: [receipt] };
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
      const receipt = await executeTool(call.request);
      return { reply: confirmTool(receipt), mode: "grok", receipts: [receipt] };
    }
    default:
      return assertNever(call);
  }
}
