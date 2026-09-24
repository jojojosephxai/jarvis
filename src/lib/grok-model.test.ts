import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { BUTLER_PROMPT, grokModel, grokPhraseNotes, LOCKED_XAI_MODEL } from "./grok";

const previousModel = process.env.XAI_MODEL;
const previousGrok = process.env.GROK_MODEL;
const previousKey = process.env.XAI_API_KEY;

afterEach(() => {
  if (previousModel === undefined) delete process.env.XAI_MODEL;
  else process.env.XAI_MODEL = previousModel;
  if (previousGrok === undefined) delete process.env.GROK_MODEL;
  else process.env.GROK_MODEL = previousGrok;
  if (previousKey === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = previousKey;
});

describe("grok model lock", () => {
  it("calls grok-4.7 even when another model is named", () => {
    process.env.XAI_MODEL = "grok-4.3";
    process.env.GROK_MODEL = "claude-sonnet";
    assert.equal(grokModel(), "grok-4.7");
    assert.equal(LOCKED_XAI_MODEL, "grok-4.7");
    delete process.env.XAI_MODEL;
    delete process.env.GROK_MODEL;
    assert.equal(grokModel(), "grok-4.7");
    process.env.GROK_MODEL = "grok-4.7";
    assert.equal(grokModel(), "grok-4.7");
  });

  it("posts chat to grok-4.7 and keeps the key out of the body", async () => {
    process.env.XAI_API_KEY = "secret-key";
    process.env.GROK_MODEL = "claude-sonnet";
    process.env.XAI_MODEL = "grok-4.3";
    const original = globalThis.fetch;
    let seenUrl = "";
    let seenAuth = "";
    let seenBody = "";
    globalThis.fetch = async (input, init) => {
      seenUrl = String(input);
      seenAuth = new Headers(init?.headers).get("authorization") ?? "";
      seenBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "Hello. How can I help?" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    try {
      const result = await grokPhraseNotes(
        "hello",
        "Question:\nhello\n\nNotes:\nNo vault note matched. Answer anyway.",
      );
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.match(result.text, /Hello/);
      const body = JSON.parse(seenBody) as { model: string; messages: Array<{ content: string }> };
      assert.equal(seenUrl, "https://api.x.ai/v1/chat/completions");
      assert.equal(body.model, "grok-4.7");
      assert.equal(seenAuth, "Bearer secret-key");
      assert.equal(seenBody.includes("secret-key"), false);
      assert.match(body.messages[0]?.content ?? "", /butler/i);
      assert.match(seenBody, /No vault note matched/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("treats vault notes as context and still answers without a hit", () => {
    assert.match(BUTLER_PROMPT, /butler/i);
    assert.match(BUTLER_PROMPT, /cite the note title/i);
    assert.match(BUTLER_PROMPT, /still answer/i);
    assert.doesNotMatch(BUTLER_PROMPT, /reply exactly/);
  });
});
