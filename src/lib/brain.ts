import { assertNever } from "./assert";
import { CALL_REFUSAL } from "./demo-brain";
import { answerFromVault, type AnswerOptions, type GroundedAnswer } from "./grounded-answer";
import { brainMode } from "./grok";
import { mentionsCalendar, parseIntent } from "./intent";
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

export async function think(
  messages: ChatMessageInput[],
  options: AnswerOptions = {},
): Promise<ChatResponse> {
  const latest = messages.at(-1);
  if (!latest || latest.role !== "user") {
    return { reply: "Say that once more?", mode: brainMode(), receipts: [] };
  }

  const parsed = parseIntent(latest.content);
  switch (parsed.kind) {
    case "refuse-call":
      return { reply: CALL_REFUSAL, mode: brainMode(), receipts: [] };
    case "tool": {
      if (parsed.request.tool === "notes.recall") {
        const query = parsed.request.input.query?.trim() ?? "";
        if (!query) {
          return {
            reply: "Tell me what to look for in the vault notes.",
            mode: brainMode(),
            receipts: [],
          };
        }
        return fromGrounded(await answerFromVault(query, options));
      }
      const receipt = await executeTool(parsed.request, options.root ?? process.cwd());
      return { reply: confirmTool(receipt), mode: brainMode(), receipts: [receipt] };
    }
    case "chat":
      return talk(latest.content, options);
    default:
      return assertNever(parsed);
  }
}

async function talk(latest: string, options: AnswerOptions): Promise<ChatResponse> {
  if (mentionsCalendar(latest)) {
    return {
      reply:
        "I need an event and a time before I can put that on the demo calendar. Try: Put soccer practice on my calendar tomorrow at 4pm.",
      mode: brainMode(),
      receipts: [],
    };
  }

  return fromGrounded(await answerFromVault(latest, options));
}

function fromGrounded(answer: GroundedAnswer): ChatResponse {
  return {
    reply: answer.reply,
    mode: answer.mode,
    receipts: [],
    notice: answer.notice,
    sources: answer.sources,
  };
}
