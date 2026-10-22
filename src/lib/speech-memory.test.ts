import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { streamAnswerFromVault } from "./grounded-answer";
import { grokPhraseNotes, grokStreamSentences } from "./grok";
import { finishedHistory } from "./thread-storage";
import { readMessages, think, streamTurn } from "./brain";
import { butlerSpeech } from "./voice/policy";
import { unspokenTail } from "./voice/sentence-queue";

async function vault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "talks-"));
  await mkdir(path.join(root, "vault"));
  await writeFile(path.join(root, "vault", "School.md"), "# School\nJoseph studies science.");
  return root;
}
const sentences = ["First sentence.", "Second sentence.", "Third sentence.", "Fourth sentence.", "Fifth sentence."];
test("vault stream yields all five sentences before done", async () => {
  const events = [];
  for await (const event of streamAnswerFromVault("school", { root: await vault(), vaultPath: "vault", useModel: true,
    stream: async function* () { yield* sentences; },
  })) events.push(event);
  assert.deepEqual(events.filter(e => e.type === "sentence").map(e => e.text), sentences);
  assert.equal(events.at(-1)?.type, "done");
});
test("speech keeps four sentences, removes sources and reconciles the missing tail", () => {
  assert.equal(butlerSpeech("A. B. C. D."), "A. B. C. D.");
  assert.equal(butlerSpeech("School starts soon (School-schedule)."), "School starts soon.");
  assert.equal(butlerSpeech("A. B.\n\nNotes used: School, Goals."), "A. B.");
  assert.equal(unspokenTail(sentences.join(" "), sentences.slice(0, 2).join(" ")), sentences.slice(2).join(" "));
  assert.equal(unspokenTail("The first sentence. Last one.", "The first"), "sentence. Last one.");
  assert.equal(unspokenTail("A. A. B.", "A."), "A. B.");
});
test("completion and stream send real history roles capped at eight and 600 characters", async () => {
  const originalKey = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "fake-test-key";
  const history = Array.from({length: 12}, (_, i) => ({role: i % 2 ? "assistant" as const : "user" as const, content: `${i}:` + "x".repeat(800)}));
  const fake: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.messages.length, 10);
    assert.deepEqual(body.messages.slice(1, -1), history.slice(-8).map(m => ({...m, content: m.content.slice(0, 600)})));
    return body.stream
      ? new Response('data: {"choices":[{"delta":{"content":"Ready. "}}]}\n\ndata: [DONE]\n\n')
      : Response.json({choices:[{message:{content:"Ready."}}]});
  };
  try {
    await grokPhraseNotes("school", "packet", history, fake);
    const parts = [];
    for await (const part of grokStreamSentences("school", "packet", history, fake)) parts.push(part);
    assert.deepEqual(parts, ["Ready."]);
  } finally {
    if (originalKey === undefined) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = originalKey;
  }
});
test("streaming and non-streaming brain pass previous turns to completion", async () => {
  const root = await vault();
  const messages = [{role:"user" as const, content:"I said Friday."},{role:"assistant" as const, content:"Understood."},{role:"user" as const, content:"What did I just say about school?"}];
  const complete = async (_q: string, _packet: string, history?: typeof messages) => {
    assert.deepEqual(history, messages.slice(0,-1));
    return {ok:true as const,text:"Friday."};
  };
  await think(messages, {root, vaultPath:"vault", useModel:true, complete});
  for await (const event of streamTurn(messages, {root, vaultPath:"vault", useModel:true, complete})) assert.ok(event);
});

test("what did I just say reaches completion with the previous user turn", async () => {
  const messages = [{role:"user" as const,content:"The fictional codeword is marigold."},{role:"assistant" as const,content:"Understood."},{role:"user" as const,content:"What did I just say?"}];
  const answer = await think(messages, { vaultPath:path.resolve("tests/fixtures/vault"), useModel:true,
    complete:async (_q, _packet, history) => {
      assert.equal(history?.[0].content, messages[0].content);
      return {ok:true,text:"You said the fictional codeword is marigold."};
    },
  });
  assert.match(answer.reply, /marigold/);
});

test("unfinished, empty and failed turns never poison typed or microphone history", () => {
  const items = [
    { kind: "you" as const, text: "What is due Thursday?" },
    { kind: "jarvis" as const, text: "" },
    { kind: "jarvis" as const, text: "An unfinished reply", pending: true },
    { kind: "jarvis" as const, text: "Failed reply", failed: true },
    { kind: "jarvis" as const, text: "Stopped. I do not know if that finished." },
    { kind: "jarvis" as const, text: "Jarvis did not answer. Nothing was invented." },
    { kind: "jarvis" as const, text: "I couldn't reach Jarvis. Try again." },
    { kind: "jarvis" as const, text: "The map worksheet (School).\n\nNotes used: School.", sources: ["School"] },
  ];
  const history = finishedHistory(items);
  assert.deepEqual(history, [{role:"user",content:"What is due Thursday?"},{role:"assistant",content:"The map worksheet."}]);
  assert.ok(readMessages({messages:[...history,{role:"user",content:"and on Friday?"}]}));
  assert.deepEqual(finishedHistory([{kind:"you",text:"Notes used: is a label."}]), [{role:"user",content:"Notes used: is a label."}]);
});
test("speech keeps real capitalised parentheticals and strips only known source titles", () => {
  assert.equal(butlerSpeech("Practice is at 5 (Tuesday only)."), "Practice is at 5 (Tuesday only).");
  assert.equal(butlerSpeech("Study (AP World)."), "Study (AP World).");
  assert.equal(butlerSpeech("The answer (Long-note).", ["Long-note"]), "The answer.");
});
test("the first clause arrives before a long sentence ends, without dropped or repeated words", async () => {
  const before = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "fake-test-key";
  const full = "Joseph, the fictional map worksheet is due Thursday and the botany report follows on Friday. Second sentence. Third sentence. Fourth sentence. Fifth sentence.";
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({start(value) { controller = value; }});
  const frame = (content: string) => encoder.encode(`data: ${JSON.stringify({choices:[{delta:{content}}]})}\n\n`);
  let received!: () => void;
  const tokenReady = new Promise<void>(resolve => { received = resolve; });
  const tokens: string[] = [];
  const stream = grokStreamSentences("school", "packet", [], async () => new Response(body), text => { tokens.push(text); received(); });
  try {
    let clauseReady = false;
    const first = stream.next().then(value => { clauseReady = true; return value; });
    controller.enqueue(frame("Jo"));
    await tokenReady;
    assert.deepEqual(tokens, ["Jo"]);
    assert.equal(clauseReady, false, "text must arrive before the speech clause");
    controller.enqueue(frame("seph, "));
    assert.equal((await first).value, "Joseph,");
    controller.enqueue(frame(full.slice("Joseph, ".length)));
    controller.close();
    const parts = ["Joseph,"];
    for await (const part of stream) parts.push(part);
    assert.equal(parts.join(" "), full);
    assert.equal(tokens.join(""), full);
  } finally {
    if (before === undefined) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = before;
  }
});
