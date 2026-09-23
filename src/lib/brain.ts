import { assertNever } from "./assert";
import { CALL_REFUSAL } from "./demo-brain";
import { answerFromVault, type AnswerOptions, type GroundedAnswer } from "./grounded-answer";
import { brainMode } from "./grok";
import { resolveHand } from "./hands";
import { mentionsCalendar, parseIntent } from "./intent";
import { isMorningBriefRequest, morningBriefResponse } from "./morning-brief";
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

export async function think(
  messages: ChatMessageInput[],
  options: AnswerOptions = {},
): Promise<ChatResponse> {
  const latest = messages.at(-1);
  if (!latest || latest.role !== "user") {
    return { reply: "Say that once more?", mode: brainMode(), receipts: [] };
  }

  if (isMorningBriefRequest(latest.content)) {
    return morningBriefResponse(options);
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
      const hand = await resolveHand(parsed.request, undefined, options.root ?? process.cwd());
      return { reply: hand.reply, mode: brainMode(), receipts: hand.receipts, plan: hand.plan };
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
