import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { synthesizeAzure } from "./azure";

describe("synthesizeAzure", () => {
  it("does not pretend Azure is live without a key", async () => {
    let called = false;
    const result = await synthesizeAzure("Hello", {}, async () => {
      called = true;
      return new Response(null, { status: 500 });
    });
    assert.equal(called, false);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "unconfigured");
    assert.equal(result.httpStatus, 503);
    assert.match(result.detail, /No Azure speech key/);
  });

  it("sends the key as a header to the region's speech host", async () => {
    let seenUrl = "";
    let seenKey = "";
    let seenBody = "";
    const result = await synthesizeAzure(
      "Hello & welcome",
      {
        AZURE_SPEECH_KEY: "secret-key",
        AZURE_SPEECH_REGION: "uksouth",
        AZURE_SPEECH_VOICE: "en-GB-RyanNeural",
      },
      async (input, init) => {
        seenUrl = String(input);
        seenKey = new Headers(init?.headers).get("Ocp-Apim-Subscription-Key") ?? "";
        seenBody = String(init?.body ?? "");
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        });
      },
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(seenUrl, "https://uksouth.tts.speech.microsoft.com/cognitiveservices/v1");
    assert.equal(seenUrl.includes("secret-key"), false);
    assert.equal(seenKey, "secret-key");
    assert.match(seenBody, /en-GB-RyanNeural/);
    assert.match(seenBody, /Hello &amp; welcome/);
    assert.equal(result.voice, "en-GB-RyanNeural");
    assert.equal(result.clipped, false);
  });

  it("says the key was rejected without repeating the key", async () => {
    const result = await synthesizeAzure(
      "Hello",
      { AZURE_SPEECH_KEY: "secret-key", AZURE_SPEECH_REGION: "eastus" },
      async () => new Response("secret-key invalid", { status: 401, headers: { "content-type": "text/plain" } }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "rejected");
    assert.equal(result.detail.includes("secret-key"), false);
  });
});
