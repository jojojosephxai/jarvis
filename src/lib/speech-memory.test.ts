import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { streamAnswerFromVault } from "./grounded-answer";
import { grokPhraseNotes, grokStreamSentences } from "./grok";
import { think, streamTurn } from "./brain";
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
