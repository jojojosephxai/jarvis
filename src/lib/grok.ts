import type { BrainMode, ChatMessageInput } from "./types";

const PHRASE_PROMPT = `You are Jarvis. You may only use the note text in the user message.
Every fact must appear in those notes. Cite the note title in parentheses, like (School).
If the notes do not say it, reply exactly: I don't have that in the vault notes.
Do not add facts. Do not mention email, messages, or overnight unless the notes do.
Do not call tools. Do not output JSON. Short sentences. No emoji.
Stay on words from the notes. Extra words get the reply thrown away.`;

const SYSTEM_PROMPT = `You are Jarvis, a calm personal assistant speaking in a quiet room.
Use short, clear sentences. No emoji. No bullet lists unless the user asks for a list.

You do not place phone calls, send text messages, or control a real calendar.
If asked to call someone, say you do not place phone calls.

You may request exactly one tool by replying with only a JSON object and no other text:
{"tool":"calendar.write","input":{"title":"Soccer practice","when":"tomorrow at 4pm"}}
{"tool":"calendar.list","input":{}}
{"tool":"notes.recall","input":{"query":"science fair"}}
{"tool":"notes.keep","input":{"text":"The library book is due Friday"}}

calendar.write stores an event on a demo calendar on this computer. It does not sync anywhere.
calendar.list reads that same demo calendar.
notes.recall searches local markdown notes and, if configured, an Obsidian vault folder. It does not modify a vault.
notes.keep writes a line into the Obsidian vault. It does not read that note back. A sensitive or large rewrite waits for a yes.

If you do not need a tool, answer in plain sentences. Never claim a tool ran. Never invent a receipt.`;

type GrokSuccess = { ok: true; text: string };
type GrokFailure = { ok: false; reason: string };

export type GrokResult = GrokSuccess | GrokFailure;

export function grokConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

export function brainMode(): BrainMode {
  return grokConfigured() ? "grok" : "demo";
}

/** Talk model lock. The API id is grok-4.7. Other ids, including grok-4.3, are not used. */
export const LOCKED_XAI_MODEL = "grok-4.7";

export function grokModel(): string {
  return LOCKED_XAI_MODEL;
}

function reasoningEffort(model: string): string | null {
  const chosen = process.env.XAI_REASONING?.trim();
  if (chosen) return chosen;
  if (model === LOCKED_XAI_MODEL) return "low";
  return null;
}

function failureReason(status: number): string {
  if (status === 401 || status === 403) return "the key was rejected";
  if (status === 429) return "the rate limit was hit";
  if (status === 400) return "the request was not accepted";
  return `the request failed (${status})`;
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("")
    .trim();
}

async function postChat(body: Record<string, unknown>, timeoutMs = 20_000): Promise<GrokResult> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return { ok: false, reason: "no key is set" };

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return { ok: false, reason: failureReason(response.status) };

    const payload: unknown = await response.json();
    const text = readChoice(payload);
    if (!text) return { ok: false, reason: "the reply was empty" };
    return { ok: true, text };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { ok: false, reason: "the request timed out" };
    }
    return { ok: false, reason: "the request could not be sent" };
  }
}

function chatBody(
  model: string,
  temperature: number,
  maxTokens: number,
  messages: Array<{ role: string; content: string }>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages,
  };
  const effort = reasoningEffort(model);
  if (effort) body.reasoning_effort = effort;
  if (!effort || effort === "none") body.temperature = temperature;
  return body;
}

export async function grokChat(messages: ChatMessageInput[]): Promise<GrokResult> {
  const model = grokModel();
  return postChat(
    chatBody(model, 0.4, 400, [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.slice(-8).map((message) => ({
        role: message.role,
        content: message.content.slice(0, 1500),
      })),
    ]),
  );
}

export async function grokPhraseNotes(question: string, packet: string): Promise<GrokResult> {
  const model = grokModel();
  const user = (packet.startsWith("Question:") ? packet : `Question:\n${question}\n\n${packet}`).slice(0, 12000);
  return postChat(
    chatBody(model, 0, 350, [
      { role: "system", content: PHRASE_PROMPT },
      { role: "user", content: user },
    ]),
    45_000,
  );
}

function readChoice(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return messageText(message?.content).trim();
}
