import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clampTtsSpeed, grokTtsPublicStatus, synthesizeGrok } from "./grok-tts";

describe("clampTtsSpeed", () => {
  it("defaults to normal speed and stays inside 0.7 to 1.5", () => {
    assert.equal(clampTtsSpeed(undefined), 1);
    assert.equal(clampTtsSpeed("  "), 1);
    assert.equal(clampTtsSpeed("nope"), 1);
    assert.equal(clampTtsSpeed("0.2"), 0.7);
    assert.equal(clampTtsSpeed("1.2"), 1.2);
    assert.equal(clampTtsSpeed("9"), 1.5);
  });
});

describe("synthesizeGrok", () => {
  it("does not call xAI when the key or voice id is missing", async () => {
    let called = false;
    const missingVoice = await synthesizeGrok(
      "Hello",
      { XAI_API_KEY: "secret-key", XAI_TTS_VOICE_ID: "  " },
      async () => {
        called = true;
        return new Response(null, { status: 500 });
      },
    );
    assert.equal(called, false);
    assert.equal(missingVoice.ok, false);
    if (missingVoice.ok) return;
    assert.equal(missingVoice.reason, "unconfigured");
    assert.equal(missingVoice.detail.includes("secret-key"), false);

    const status = grokTtsPublicStatus({});
    assert.equal(status.live, false);
    assert.equal(status.provider, "none");
    assert.equal(status.voice, null);
  });

  it("sends Altair and the clamped speed, and keeps the key in the header", async () => {
    let seenUrl = "";
    let seenAuth = "";
    let seenBody = "";
    const result = await synthesizeGrok(
      "Hello & welcome",
      { XAI_API_KEY: "secret-key", XAI_TTS_VOICE_ID: "altair", XAI_TTS_SPEED: "0.2" },
      async (input, init) => {
        seenUrl = String(input);
        seenAuth = new Headers(init?.headers).get("Authorization") ?? "";
        seenBody = String(init?.body ?? "");
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        });
      },
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(seenUrl, "https://api.x.ai/v1/tts");
    assert.equal(seenUrl.includes("secret-key"), false);
    assert.equal(seenBody.includes("secret-key"), false);
    assert.equal(seenAuth, "Bearer secret-key");
    const body = JSON.parse(seenBody) as { text: string; voice_id: string; language: string; speed: number };
    assert.equal(body.voice_id, "altair");
    assert.equal(body.language, "en");
    assert.equal(body.speed, 0.7);
    assert.equal(body.text, "Hello & welcome");
    assert.equal(result.voice, "altair");
    assert.equal(result.speed, 0.7);

    const status = grokTtsPublicStatus({
      XAI_API_KEY: "secret-key",
      XAI_TTS_VOICE_ID: "altair",
    });
    assert.equal(status.provider, "grok");
    assert.equal(status.live, true);
    assert.equal(status.voice, "altair");
    assert.equal(status.detail.includes("secret-key"), false);
  });

  it("says the key was rejected without repeating the key", async () => {
    const result = await synthesizeGrok(
      "Hello",
      { XAI_API_KEY: "secret-key", XAI_TTS_VOICE_ID: "altair" },
      async () => new Response("secret-key invalid", { status: 401, headers: { "content-type": "application/json" } }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "rejected");
    assert.equal(result.detail.includes("secret-key"), false);
  });
});
