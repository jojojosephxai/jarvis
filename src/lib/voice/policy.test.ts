import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSsml,
  butlerSpeech,
  clipSpeechText,
  escapeSsml,
  isBritishBrowserVoice,
  listenFailureMessage,
  pickBrowserVoice,
  planAfterServer,
  publicVoiceStatus,
  readAzureConfig,
  resolveAzureVoice,
  voiceSnapshot,
} from "./policy";

describe("butlerSpeech", () => {
  it("keeps two short sentences and drops harness lines", () => {
    const spoken = butlerSpeech(
      "Saved the library return for Friday. No calendar is connected. Notes checked: Goals. This brief did not call Grok.",
    );
    assert.equal(spoken, "Saved the library return for Friday. No calendar is connected.");
  });
});

describe("clipSpeechText", () => {
  it("keeps a short reply whole", () => {
    const clipped = clipSpeechText("  Soccer   is tomorrow.  ");
    assert.equal(clipped.text, "Soccer is tomorrow.");
    assert.equal(clipped.clipped, false);
  });

  it("cuts a long reply on a sentence", () => {
    const sentence = "This is a full sentence about the science fair. ";
    const text = sentence.repeat(30);
    const clipped = clipSpeechText(text);
    assert.equal(clipped.clipped, true);
    assert.ok(clipped.text.length <= 600);
    assert.ok(clipped.text.endsWith("."));
  });
});

describe("escapeSsml", () => {
  it("escapes characters that would break the voice markup", () => {
    assert.equal(escapeSsml(`Tom & Jerry <3 "ok"`), "Tom &amp; Jerry &lt;3 &quot;ok&quot;");
  });

  it("puts the British voice name in the markup", () => {
    const ssml = buildSsml("Hello & welcome", "en-GB-SoniaNeural");
    assert.match(ssml, /xml:lang="en-GB"/);
    assert.match(ssml, /en-GB-SoniaNeural/);
    assert.match(ssml, /Hello &amp; welcome/);
  });
});

describe("resolveAzureVoice", () => {
  it("defaults to Sonia", () => {
    assert.deepEqual(resolveAzureVoice(undefined), { voice: "en-GB-SoniaNeural", replaced: false });
    assert.deepEqual(resolveAzureVoice("  "), { voice: "en-GB-SoniaNeural", replaced: false });
  });

  it("keeps another British neural voice", () => {
    assert.deepEqual(resolveAzureVoice("en-GB-RyanNeural"), { voice: "en-GB-RyanNeural", replaced: false });
  });

  it("refuses a non-British voice", () => {
    assert.deepEqual(resolveAzureVoice("en-US-JennyNeural"), { voice: "en-GB-SoniaNeural", replaced: true });
  });
});

describe("readAzureConfig", () => {
  it("stays off when no key is set", () => {
    const config = readAzureConfig({});
    assert.equal(config.state, "off");
    const status = publicVoiceStatus(config);
    assert.equal(status.live, false);
    assert.equal(status.provider, "none");
    assert.match(status.detail, /No Azure speech key/);
  });

  it("asks for both key and region", () => {
    const config = readAzureConfig({ AZURE_SPEECH_KEY: "secret" });
    assert.equal(config.state, "bad-config");
    if (config.state !== "bad-config") return;
    assert.match(config.detail, /both AZURE_SPEECH_KEY and AZURE_SPEECH_REGION/);
  });

  it("rejects a region that could point off Azure", () => {
    const config = readAzureConfig({
      AZURE_SPEECH_KEY: "secret",
      AZURE_SPEECH_REGION: "eastus.evil.example",
    });
    assert.equal(config.state, "bad-config");
  });

  it("is ready for a normal region", () => {
    const config = readAzureConfig({
      AZURE_SPEECH_KEY: " secret ",
      AZURE_SPEECH_REGION: "UKSouth",
      AZURE_SPEECH_VOICE: "en-GB-LibbyNeural",
    });
    assert.equal(config.state, "ready");
    if (config.state !== "ready") return;
    assert.equal(config.region, "uksouth");
    assert.equal(config.voice, "en-GB-LibbyNeural");
    assert.equal(config.key, "secret");
    const status = publicVoiceStatus(config);
    assert.equal(status.live, true);
    assert.equal(status.voice, "en-GB-LibbyNeural");
    assert.equal(status.detail.includes("secret"), false);
  });
});

describe("pickBrowserVoice", () => {
  it("prefers a British voice over a US one", () => {
    const picked = pickBrowserVoice([
      { name: "Samantha", lang: "en-US" },
      { name: "Google UK English Female", lang: "en-GB" },
      { name: "Daniel", lang: "en-GB" },
    ]);
    assert.equal(picked?.lang, "en-GB");
    assert.equal(isBritishBrowserVoice(picked), true);
  });

  it("uses an English voice when nothing British is installed", () => {
    const picked = pickBrowserVoice([
      { name: "Amelie", lang: "fr-FR" },
      { name: "Samantha", lang: "en-US" },
    ]);
    assert.equal(picked?.name, "Samantha");
    assert.equal(isBritishBrowserVoice(picked), false);
  });

  it("returns null when the computer has no voices", () => {
    assert.equal(pickBrowserVoice([]), null);
  });
});

describe("listenFailureMessage", () => {
  it("explains a blocked microphone", () => {
    assert.match(listenFailureMessage("not-allowed") ?? "", /blocked/);
  });

  it("stays quiet when the user pressed stop", () => {
    assert.equal(listenFailureMessage("aborted"), null);
  });
});

describe("voiceSnapshot", () => {
  it("says the mic is missing and the speaker is not live", () => {
    const snapshot = voiceSnapshot({
      earsSupported: false,
      azureLive: false,
      azureVoice: null,
      browserCanSpeak: false,
      browserVoice: null,
    });
    assert.equal(snapshot.ears, "unsupported");
    assert.equal(snapshot.mouth, "not-live");
    assert.match(snapshot.line, /Mic: off/);
    assert.match(snapshot.line, /Speaker is not live/);
  });

  it("names Altair when Grok speech is configured", () => {
    const snapshot = voiceSnapshot({
      earsSupported: true,
      grokLive: true,
      grokVoice: "altair",
      azureLive: false,
      azureVoice: null,
      browserCanSpeak: true,
      browserVoice: { name: "Google UK English Female", british: true },
    });
    assert.equal(snapshot.mouth, "grok");
    assert.match(snapshot.line, /Mic: British English/);
    assert.doesNotMatch(snapshot.line, /key stays on the server/i);
  });

  it("names Sonia when Azure is configured", () => {
    const snapshot = voiceSnapshot({
      earsSupported: true,
      azureLive: true,
      azureVoice: "en-GB-SoniaNeural",
      browserCanSpeak: true,
      browserVoice: { name: "Samantha", british: false },
    });
    assert.equal(snapshot.mouth, "azure");
    assert.match(snapshot.line, /Sonia/);
    assert.match(snapshot.line, /Mic: British English/);
  });
});

describe("planAfterServer", () => {
  it("uses the browser voice when Azure is not configured", () => {
    const plan = planAfterServer({
      failure: { live: false, reason: "unconfigured", detail: "No Azure speech key is set." },
      browserReady: true,
    });
    assert.equal(plan.action, "browser");
    if (plan.action !== "browser") return;
    assert.equal(plan.notice, null);
  });

  it("does not pretend to speak when nothing can", () => {
    const plan = planAfterServer({
      failure: { live: false, reason: "unconfigured", detail: "No Azure speech key is set." },
      browserReady: false,
    });
    assert.equal(plan.action, "not-live");
    if (plan.action !== "not-live") return;
    assert.match(plan.notice, /Nothing was spoken/);
  });

  it("tells the truth when Azure fails and the computer speaks instead", () => {
    const plan = planAfterServer({
      failure: { live: false, reason: "rejected", detail: "Azure rejected the speech key." },
      browserReady: true,
    });
    assert.equal(plan.action, "browser");
    if (plan.action !== "browser") return;
    assert.match(plan.notice ?? "", /speaking instead/);
  });
});
