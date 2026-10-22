import { assertNever } from "./assert";
import { isClockQuestion, isQuickAsk, localClockReply, readySentences } from "./clock";
import { CALL_REFUSAL } from "./demo-brain";
import { answerFromVault, streamAnswerFromVault, type AnswerOptions, type GroundedAnswer } from "./grounded-answer";
import { brainMode, grokConfigured, grokPhraseNotes, grokStreamSentences, pickGrokModel } from "./grok";
import { pinnedContext } from "./pinned-context";
import { resolveHand } from "./hands";
import { describeGraphCommand } from "./graph-command";
import { parseIntent } from "./intent";
import { loadVaultGraph } from "./note-graph.server";
import { isMorningBriefRequest, morningBriefResponse } from "./morning-brief";
import type { ChatMessageInput, ChatResponse } from "./types";
import { butlerSpeech } from "./voice/policy";
import { resolveVaultPath } from "./vault-read";
import { attachWriteNudge, describeChanges, enrichKeepInput, observeVault, takeNudge } from "./vault-write";

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

/** Both transports share command dispatch and vault observation before quick answers. */
function prepareTurn(messages: ChatMessageInput[], options: AnswerOptions) {
  const latest = messages.at(-1);
  const root = options.root ?? process.cwd();
  const vaultDir = resolveVaultPath(root, options.vaultPath);
  const watching = latest && !isClockQuestion(latest.content) ? observeVault(root, vaultDir) : null;
  // Attach a handler immediately; observation is awaited before completing the turn.
  void watching?.catch(() => {});
  return { latest, root, vaultDir, watching, parsed: parseIntent(latest?.content ?? "") };
}

async function dispatchCommand(prepared: ReturnType<typeof prepareTurn>, options: AnswerOptions): Promise<ChatResponse | null> {
  const { latest, root, vaultDir, watching, parsed } = prepared;
  if (!latest || latest.role !== "user") return { reply: "Say that once more?", mode: brainMode(), receipts: [] };
  if (isMorningBriefRequest(latest.content)) return morningBriefResponse(options);
  switch (parsed.kind) {
    case "refuse-call": return { reply: CALL_REFUSAL, mode: brainMode(), receipts: [] };
    case "changes":
      if (watching) await watching;
      return { reply: await describeChanges(root), mode: brainMode(), receipts: [] };
    case "graph": {
      const nodes = parsed.command.action === "layout" ? [] : (await loadVaultGraph(vaultDir)).nodes;
      const described = describeGraphCommand(parsed.command, nodes);
      return { reply: described.reply, mode: brainMode(), receipts: [], graph: described.directive };
    }
    case "tool": {
      if (parsed.request.tool === "notes.recall") {
        const query = parsed.request.input.query?.trim() ?? "";
        return query ? fromGrounded(await answerFromVault(query, options)) : { reply: "Tell me what to look for in the vault notes.", mode: brainMode(), receipts: [] };
      }
      const request = parsed.request.tool === "notes.keep"
        ? { tool: "notes.keep" as const, input: await enrichKeepInput(parsed.request.input.text ?? "", vaultDir) }
        : parsed.request;
      const hand = await resolveHand(request, undefined, root, vaultDir);
      return { reply: hand.reply, mode: brainMode(), receipts: hand.receipts, plan: hand.plan };
    }
    case "chat": return null;
    default: return assertNever(parsed);
  }
}

export async function think(messages: ChatMessageInput[], options: AnswerOptions = {}): Promise<ChatResponse> {
  const digest = await Promise.resolve().then(() => options.boardDigest?.() ?? "").catch(() => "");
  options = { ...options, history: messages.slice(0, -1), boardDigest: () => digest };
  const prepared = prepareTurn(messages, options);
  const response = await dispatchCommand(prepared, options) ?? await talk(prepared.latest!.content, options);
  response.model = response.mode === "grok" ? pickGrokModel(prepared.latest?.content ?? "", digest) : "local";
  return finishAfterWatch(response, prepared.root, prepared.watching);
}

async function finishAfterWatch(
  response: ChatResponse,
  root: string,
  watching: Promise<unknown> | null,
): Promise<ChatResponse> {
  if (watching) await watching;
  return finish(response, root);
}

async function finish(response: ChatResponse, root: string): Promise<ChatResponse> {
  const nudge = await takeNudge(root);
  return attachWriteNudge(response, nudge);
}

async function talk(latest: string, options: AnswerOptions): Promise<ChatResponse> {
  const clockKind = isClockQuestion(latest);
  if (clockKind) {
    return {
      reply: localClockReply(clockKind, options.now ?? new Date()),
      mode: brainMode(),
      receipts: [],
    };
  }
  if (isQuickAsk(latest, await options.boardDigest?.())) return talkSmall(latest, options);

  return fromGrounded(await answerFromVault(latest, options));
}

async function talkSmall(latest: string, options: AnswerOptions): Promise<ChatResponse> {
  const modelOn = options.useModel ?? grokConfigured();
  const packet = `${await pinnedContext(latest, options)}\n\nQuestion:\n${latest}\n\nNotes:\nNo vault search. Answer in one or two short sentences.`;
  if (!modelOn && !options.complete) {
    return { reply: "Hello. I am here.", mode: "demo", receipts: [] };
  }
  const complete = options.complete ?? grokPhraseNotes;
  const result = await complete(latest, packet, options.history);
  if (result.ok && result.text.trim()) {
    return { reply: result.text.trim(), mode: "grok", receipts: [] };
  }
  return { reply: "Hello. I am here.", mode: "demo", receipts: [] };
}

export type SpeakEvent =
  | { type: "sentence"; text: string }
  | { type: "done"; response: ChatResponse };

export async function* streamTurn(
  messages: ChatMessageInput[],
  options: AnswerOptions = {},
): AsyncGenerator<SpeakEvent> {
  const digest = await Promise.resolve().then(() => options.boardDigest?.() ?? "").catch(() => "");
  options = { ...options, history: messages.slice(0, -1), boardDigest: () => digest };
  let logged = false;
  const logFirst = () => {
    if (logged) return;
    logged = true;

  };
  const emitReply = function* (response: ChatResponse): Generator<SpeakEvent> {
    for (const text of spokenParts(response.reply)) {
      logFirst();
      yield { type: "sentence", text };
    }
    if (!logged) logFirst();
    response.model = response.mode === "grok" ? pickGrokModel(messages.at(-1)?.content ?? "", digest) : "local";
    yield { type: "done", response };
  };

  const prepared = prepareTurn(messages, options);
  const { latest, root, watching } = prepared;
  const command = await dispatchCommand(prepared, options);
  if (command) {
    yield* emitReply(await finishAfterWatch(command, root, watching));
    return;
  }
  if (!latest) return;

  const clockKind = isClockQuestion(latest.content);
  if (clockKind) {
    yield* emitReply(await finishAfterWatch(await talk(latest.content, options), root, watching));
    return;
  }
  if (isQuickAsk(latest.content, digest)) {
    const modelOn = options.useModel ?? grokConfigured();
    if (!modelOn || options.complete) {
      yield* emitReply(await finishAfterWatch(await talk(latest.content, options), root, watching));
      return;
    }
    const packet = `${await pinnedContext(latest.content, options)}\n\nQuestion:\n${latest.content}\n\nNotes:\nNo vault search. Answer in one or two short sentences.`;
    let answerText = "";
    for await (const sentence of (options.stream ?? grokStreamSentences)(latest.content, packet, options.history)) {
      const clean = sentence.trim();
      if (!clean) continue;
      logFirst();
      answerText = answerText ? `${answerText} ${clean}` : clean;
      yield { type: "sentence", text: clean };
    }
    if (!answerText) {
      yield* emitReply(await finishAfterWatch(await talk(latest.content, options), root, watching));
      return;
    }
    const response = await finishAfterWatch({ reply: answerText, mode: "grok", receipts: [] }, root, watching);
    if (!logged) logFirst();
    response.model = response.mode === "grok" ? pickGrokModel(messages.at(-1)?.content ?? "", digest) : "local";
    yield { type: "done", response };
    return;
  }

  {
    let answerText = "";
    for await (const event of streamAnswerFromVault(latest.content, options)) {
      if (event.type === "sentence") {
        logFirst();
        answerText = answerText ? `${answerText} ${event.text}` : event.text;
        yield { type: "sentence", text: event.text };
        continue;
      }
      const response = await finishAfterWatch(fromGrounded(event.answer), root, watching);
      if (!answerText) {
        for (const text of spokenParts(response.reply)) {
          logFirst();
          yield { type: "sentence", text };
        }
      }
      if (!logged) logFirst();
      response.model = response.mode === "grok" ? pickGrokModel(messages.at(-1)?.content ?? "", digest) : "local";
    yield { type: "done", response };
    }
    return;
  }

}

function spokenParts(text: string): string[] {
  const spoken = butlerSpeech(text);
  if (!spoken) return [];
  const split = readySentences(`${spoken} `);
  const parts = split.ready.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
  return [...parts, split.rest.trim()].filter(Boolean);
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

export type TimingKind = "quick" | "grounded" | "command";
type TurnTiming = { kind: TimingKind; firstSentenceMs: number; doneMs: number; ttsFirstByteMs: number };
const turnTimings = new Map<string, TurnTiming>();
function timingLine(sample: TurnTiming) {
  console.info(`[timing] kind=${sample.kind} firstSentenceMs=${sample.firstSentenceMs} doneMs=${sample.doneMs} ttsFirstByteMs=${sample.ttsFirstByteMs}`);
}
/** -1 means audio has not been requested/observed; a later audio sample updates the same durations. */
export function startChatTiming(question: string, id: string | null, now = () => performance.now()) {
  const kind: TimingKind = parseIntent(question).kind !== "chat" || isMorningBriefRequest(question) ? "command" : isQuickAsk(question) ? "quick" : "grounded";
  const started = now();
  const sample: TurnTiming = { kind, firstSentenceMs: -1, doneMs: -1, ttsFirstByteMs: -1 };
  if (id && /^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    if (turnTimings.size >= 300) turnTimings.delete(turnTimings.keys().next().value!);
    turnTimings.set(id, sample);
    const expiry = setTimeout(() => turnTimings.delete(id), 120_000);
    expiry.unref();
  }
  return {
    first() { if (sample.firstSentenceMs < 0) sample.firstSentenceMs = Math.round(now() - started); },
    done() { if (sample.doneMs >= 0) return; sample.doneMs = Math.round(now() - started); timingLine(sample); },
  };
}
export function recordVoiceFirstByte(id: string | undefined, milliseconds: number) {
  const sample = id ? turnTimings.get(id) : undefined;
  if (!sample || sample.ttsFirstByteMs >= 0) return;
  sample.ttsFirstByteMs = Math.round(milliseconds);
  if (sample.doneMs >= 0) timingLine(sample);
}
