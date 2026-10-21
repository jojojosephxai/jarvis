import { clockStamp, isQuickAsk, readySentences } from "./clock";
import type { BrainMode, ChatMessageInput } from "./types";

/** Butler prompt. Vault notes are context, not a reason to skip the model. */
export const BUTLER_PROMPT = `You are Jarvis, a calm butler speaking in a quiet room.
Use short, clear sentences. No emoji. No bullet lists unless the user asks for a list.

Vault notes may be included with the question. They are context when they are relevant, not a gate.
When a note helps, use it and cite the note title in parentheses, like (School).
When no note matches, or the notes do not cover the question, still answer.
A greeting, a general question, or anything else still gets a real answer.
Do not refuse only because the vault had no hit. Do not say the vault blocked you.
Do not invent private facts about the person that are not in the notes. If a personal fact is missing, say it is not written down, then still be helpful.
Do not mention the calendar unless the user asked about it. An unconnected calendar must not delay or replace the answer.
Do not claim you sent email, placed a phone call, or spent money.
Do not call tools. Do not output JSON.`;

const SYSTEM_PROMPT = `You are Jarvis, a calm personal assistant speaking in a quiet room.
Use short, clear sentences. No emoji. No bullet lists unless the user asks for a list.

You do not place phone calls, send text messages, or control a real calendar.
If asked to call someone, say you do not place phone calls.

You may request exactly one tool by replying with only a JSON object and no other text:
{"tool":"calendar.write","input":{"title":"Library return","when":"Friday at 3pm"}}
{"tool":"calendar.list","input":{}}
{"tool":"notes.recall","input":{"query":"science fair"}}
{"tool":"notes.keep","input":{"text":"The library book is due Friday"}}

calendar.write stores an event on this computer. No calendar is connected, so it does not sync anywhere.
calendar.list does not read a connected calendar. Say that the calendar is not connected.
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

/** Hard questions stay on grok-4.7. Quick asks use the faster model. Names are constants, not env overrides. */
export const HARD_XAI_MODEL = "grok-4.7";
export const FAST_XAI_MODEL = "grok-4-fast-non-reasoning";
export const LOCKED_XAI_MODEL = HARD_XAI_MODEL;

export function grokModel(): string {
  return HARD_XAI_MODEL;
}

export function grokFastModel(): string {
  return FAST_XAI_MODEL;
}

export function pickGrokModel(question: string): string {
  return isQuickAsk(question) ? FAST_XAI_MODEL : HARD_XAI_MODEL;
}

let grokWarmed = false;

/** Open the Brain connection once when the page loads, before the first question. */
export function warmGrokConnection(): void {
  if (grokWarmed) return;
  grokWarmed = true;
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return;
  void fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  }).catch(() => {
    grokWarmed = false;
  });
}

function reasoningEffort(model: string): string | null {
  const chosen = process.env.XAI_REASONING?.trim();
  if (chosen) return chosen;
  if (model === HARD_XAI_MODEL) return "low";
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

function clocked(prompt: string): string {
  return `${prompt}\n\nCurrent time: ${clockStamp()} (America/New_York). Use this for the date and the time. Do not say you have no clock.`;
}

export async function grokChat(messages: ChatMessageInput[]): Promise<GrokResult> {
  const model = grokModel();
  return postChat(
    chatBody(model, 0.4, 400, [
      { role: "system", content: clocked(SYSTEM_PROMPT) },
      ...messages.slice(-8).map((message) => ({
        role: message.role,
        content: message.content.slice(0, 1500),
      })),
    ]),
  );
}

export async function grokPhraseNotes(question: string, packet: string): Promise<GrokResult> {
  const model = pickGrokModel(question);
  const user = (packet.startsWith("Question:") ? packet : `Question:\n${question}\n\n${packet}`).slice(0, 12000);
  return postChat(
    chatBody(model, 0.4, 400, [
      { role: "system", content: clocked(BUTLER_PROMPT) },
      { role: "user", content: user },
    ]),
    45_000,
  );
}

export async function* grokStreamSentences(question: string, packet: string): AsyncGenerator<string> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return;
  const model = pickGrokModel(question);
  const user = (packet.startsWith("Current time:") || packet.startsWith("Question:")
    ? packet
    : `Question:\n${question}\n\n${packet}`
  ).slice(0, 12000);
  const body = chatBody(model, 0.4, 400, [
    { role: "system", content: clocked(BUTLER_PROMPT) },
    { role: "user", content: user },
  ]);
  body.stream = true;

  let response: Response;
  try {
    response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return;
  }
  if (!response.ok || !response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let text = "";
  let primed = false;
  const pull = (): string[] => {
    const split = readySentences(text);
    text = split.rest;
    const ready = split.ready.slice();
    if (ready.length > 0) primed = true;
    if (!primed) {
      const lead = text.trimStart();
      let cut = -1;
      const pause = lead.search(/[,;]\s/);
      if (pause >= 12) cut = pause + 1;
      else if (lead.length >= 32) {
        const space = lead.lastIndexOf(" ", 32);
        if (space >= 12) cut = space;
      }
      if (cut >= 12) {
        primed = true;
        ready.push(lead.slice(0, cut).trim());
        text = lead.slice(cut).trimStart();
      }
    }
    return ready.filter((sentence) => sentence.length > 0);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const payload: unknown = JSON.parse(data);
        text += streamDelta(payload);
      } catch {
        // Ignore a partial SSE frame.
      }
    }
    for (const sentence of pull()) yield sentence;
  }
  const tail = text.trim();
  if (tail) yield tail;
}

function streamDelta(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const delta = (choices[0] as { delta?: { content?: unknown } }).delta;
  return messageText(delta?.content);
}

function readChoice(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return messageText(message?.content).trim();
}
