import { assertNever } from "./assert";
import { clockStamp, isClockQuestion, isQuickAsk, isSmallTalk, localClockReply, readySentences } from "./clock";
import { CALL_REFUSAL } from "./demo-brain";
import { answerFromVault, streamAnswerFromVault, type AnswerOptions, type GroundedAnswer } from "./grounded-answer";
import { brainMode, grokConfigured, grokPhraseNotes, grokStreamSentences, warmGrokConnection } from "./grok";
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

export async function think(
  messages: ChatMessageInput[],
  options: AnswerOptions = {},
): Promise<ChatResponse> {
  const latest = messages.at(-1);
  if (!latest || latest.role !== "user") {
    return { reply: "Say that once more?", mode: brainMode(), receipts: [] };
  }

  const root = options.root ?? process.cwd();
  const vaultDir = resolveVaultPath(root, options.vaultPath);
  const clockOnly = isClockQuestion(latest.content) !== null;
  const watching = clockOnly ? null : observeVault(root, vaultDir);

  const done = (response: ChatResponse) => finishAfterWatch(response, root, watching);

  if (isMorningBriefRequest(latest.content)) {
    return done(await morningBriefResponse(options));
  }

  const parsed = parseIntent(latest.content);
  switch (parsed.kind) {
    case "refuse-call":
      return done({ reply: CALL_REFUSAL, mode: brainMode(), receipts: [] });
    case "changes": {
      if (watching) await watching;
      return {
        reply: await describeChanges(root),
        mode: brainMode(),
        receipts: [],
      };
    }
    case "graph": {
      const graph = await loadVaultGraph(vaultDir);
      const described = describeGraphCommand(parsed.command, graph.nodes);
      return done({ reply: described.reply, mode: brainMode(), receipts: [], graph: described.directive });
    }
    case "tool": {
      if (parsed.request.tool === "notes.recall") {
        const query = parsed.request.input.query?.trim() ?? "";
        if (!query) {
          return done({
            reply: "Tell me what to look for in the vault notes.",
            mode: brainMode(),
            receipts: [],
          });
        }
        return done(fromGrounded(await answerFromVault(query, options)));
      }
      if (parsed.request.tool === "notes.keep") {
        const enriched = await enrichKeepInput(parsed.request.input.text ?? "", vaultDir);
        const hand = await resolveHand({ tool: "notes.keep", input: enriched }, undefined, root, vaultDir);
        return done({ reply: hand.reply, mode: brainMode(), receipts: hand.receipts, plan: hand.plan });
      }
      const hand = await resolveHand(parsed.request, undefined, root, vaultDir);
      return done({ reply: hand.reply, mode: brainMode(), receipts: hand.receipts, plan: hand.plan });
    }
    case "chat":
      return done(await talk(latest.content, options));
    default:
      return assertNever(parsed);
  }
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
  if (isSmallTalk(latest)) return talkSmall(latest, options);

  return fromGrounded(await answerFromVault(latest, options));
}

async function talkSmall(latest: string, options: AnswerOptions): Promise<ChatResponse> {
  const now = options.now ?? new Date();
  const modelOn = options.useModel ?? grokConfigured();
  const packet = `Current time: ${clockStamp(now)} (America/New_York).\n\nQuestion:\n${latest}\n\nNotes:\nNo vault search. Answer in one or two short sentences.`;
  if (!modelOn && !options.complete) {
    return { reply: "Hello. I am here.", mode: "demo", receipts: [] };
  }
  const complete = options.complete ?? grokPhraseNotes;
  const result = await complete(latest, packet);
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
  warmGrokConnection();
  const started = Date.now();
  let logged = false;
  const logFirst = () => {
    if (logged) return;
    logged = true;
    console.info(`time-to-first-word ${Date.now() - started}`);
  };
  const emitReply = function* (response: ChatResponse): Generator<SpeakEvent> {
    for (const text of spokenParts(response.reply)) {
      logFirst();
      yield { type: "sentence", text };
    }
    if (!logged) logFirst();
    yield { type: "done", response };
  };

  const latest = messages.at(-1);
  if (!latest || latest.role !== "user") {
    yield* emitReply({ reply: "Say that once more?", mode: brainMode(), receipts: [] });
    return;
  }

  const clockKind = isClockQuestion(latest.content);
  if (clockKind) {
    yield* emitReply(await talk(latest.content, options));
    return;
  }
  if (isQuickAsk(latest.content)) {
    const modelOn = options.useModel ?? grokConfigured();
    if (!modelOn || options.complete) {
      yield* emitReply(await talk(latest.content, options));
      return;
    }
    const packet = `Current time: ${clockStamp(options.now ?? new Date())} (America/New_York).\n\nQuestion:\n${latest.content}\n\nNotes:\nNo vault search. Answer in one or two short sentences.`;
    let answerText = "";
    for await (const sentence of grokStreamSentences(latest.content, packet)) {
      const clean = sentence.trim();
      if (!clean) continue;
      logFirst();
      answerText = answerText ? `${answerText} ${clean}` : clean;
      yield { type: "sentence", text: clean };
    }
    if (!answerText) {
      yield* emitReply(await talk(latest.content, options));
      return;
    }
    const response = await finish(
      { reply: answerText, mode: "grok", receipts: [] },
      options.root ?? process.cwd(),
    );
    if (!logged) logFirst();
    yield { type: "done", response };
    return;
  }

  const parsed = parseIntent(latest.content);
  if (parsed.kind === "graph") {
    const root = options.root ?? process.cwd();
    const vaultDir = resolveVaultPath(root, options.vaultPath);
    const watching = observeVault(root, vaultDir);
    const graph = await loadVaultGraph(vaultDir);
    const described = describeGraphCommand(parsed.command, graph.nodes);
    for (const text of spokenParts(described.reply)) {
      logFirst();
      yield { type: "sentence", text };
    }
    const response = await finishAfterWatch(
      { reply: described.reply, mode: brainMode(), receipts: [], graph: described.directive },
      root,
      watching,
    );
    if (!logged) logFirst();
    yield { type: "done", response };
    return;
  }
  if (parsed.kind === "chat") {
    let answerText = "";
    for await (const event of streamAnswerFromVault(latest.content, options)) {
      if (event.type === "sentence") {
        logFirst();
        answerText = answerText ? `${answerText} ${event.text}` : event.text;
        yield { type: "sentence", text: event.text };
        continue;
      }
      const response = await finish(fromGrounded(event.answer), options.root ?? process.cwd());
      if (!answerText) {
        for (const text of spokenParts(response.reply)) {
          logFirst();
          yield { type: "sentence", text };
        }
      }
      if (!logged) logFirst();
      yield { type: "done", response };
    }
    return;
  }

  yield* emitReply(await think(messages, options));
}

function spokenParts(text: string): string[] {
  const spoken = butlerSpeech(text);
  if (!spoken) return [];
  const split = readySentences(`${spoken} `);
  const parts = split.ready.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
  return parts.length > 0 ? parts : [spoken];
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
