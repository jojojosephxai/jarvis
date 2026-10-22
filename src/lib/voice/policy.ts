import { readySentences } from "../clock";
import { stripReplySources, stripReplyTiming } from "../reply-text";
import {
  DEFAULT_AZURE_VOICE,
  SPEAK_LIMIT,
  type EarsKind,
  type MouthKind,
  type ServerSpeakFailure,
  type VoiceCandidate,
  type VoicePublicStatus,
} from "./types";

export type AzureEnv = {
  AZURE_SPEECH_KEY?: string;
  AZURE_SPEECH_REGION?: string;
  AZURE_SPEECH_VOICE?: string;
};

export type AzureConfig =
  | { state: "off" }
  | { state: "bad-config"; detail: string }
  | { state: "ready"; key: string; region: string; voice: string; replacedVoice: boolean };

export type MouthPlan =
  | { action: "browser"; notice: string | null }
  | { action: "not-live"; notice: string };

export type VoiceSnapshot = {
  ears: EarsKind;
  mouth: MouthKind;
  line: string;
};

const BRITISH_NEURAL = /^en-GB-[A-Za-z]+Neural$/;
const REGION_NAME = /^[a-z0-9]+$/i;

const HARNESS_SENTENCE =
  /notes checked|not written down|demo calendar|did not call grok|grok was not called|this brief did not/i;

/** Speak the whole answer, excluding source and harness footers. */
export function butlerSpeech(text: string, sources: string[] = []): string {
  const clean = stripReplySources(stripReplyTiming(text), ["School", "School-schedule", "Swim", "Goals", "About", "Preferences", "Voice-and-tone", ...sources]).replace(/\[\[([^\]]+)\]\]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const split = readySentences(`${clean} `);
  const sentences = [...split.ready, split.rest];
  const kept = sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0 && !HARNESS_SENTENCE.test(sentence));
  return kept.join(" ");
}

export function clipSpeechText(text: string): { text: string; clipped: boolean } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= SPEAK_LIMIT) return { text: clean, clipped: false };
  const slice = clean.slice(0, SPEAK_LIMIT);
  const sentence = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
  const cut = sentence >= 80 ? slice.slice(0, sentence + 1) : slice;
  return { text: cut.trim(), clipped: true };
}

export function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildSsml(text: string, voice: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<speak version="1.0" xml:lang="en-GB" xmlns="http://www.w3.org/2001/10/synthesis">` +
    `<voice name="${escapeSsml(voice)}">${escapeSsml(text)}</voice>` +
    `</speak>`
  );
}

export function resolveAzureVoice(raw: string | undefined): { voice: string; replaced: boolean } {
  const name = raw?.trim() ?? "";
  if (BRITISH_NEURAL.test(name)) return { voice: name, replaced: false };
  return { voice: DEFAULT_AZURE_VOICE, replaced: name.length > 0 };
}

export function friendlyVoiceName(voice: string): string {
  switch (voice) {
    case "en-GB-SoniaNeural":
      return "Sonia";
    case "en-GB-RyanNeural":
      return "Ryan";
    case "en-GB-LibbyNeural":
      return "Libby";
    default:
      break;
  }
  if (BRITISH_NEURAL.test(voice)) return voice.slice("en-GB-".length, -"Neural".length);
  return voice;
}

export function azureEnvFromProcess(): AzureEnv {
  return {
    AZURE_SPEECH_KEY: process.env["AZURE_SPEECH_KEY"],
    AZURE_SPEECH_REGION: process.env["AZURE_SPEECH_REGION"],
    AZURE_SPEECH_VOICE: process.env["AZURE_SPEECH_VOICE"],
  };
}

export function readAzureConfig(env?: AzureEnv): AzureConfig {
  const source = env ?? azureEnvFromProcess();
  const key = source.AZURE_SPEECH_KEY?.trim() ?? "";
  const region = source.AZURE_SPEECH_REGION?.trim() ?? "";
  if (!key && !region) return { state: "off" };
  if (!key || !region) {
    return {
      state: "bad-config",
      detail: "Azure speech needs both AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.",
    };
  }
  if (!REGION_NAME.test(region)) {
    return {
      state: "bad-config",
      detail: "AZURE_SPEECH_REGION should be a short name like eastus, with no dots.",
    };
  }
  const resolved = resolveAzureVoice(source.AZURE_SPEECH_VOICE);
  return {
    state: "ready",
    key,
    region: region.toLowerCase(),
    voice: resolved.voice,
    replacedVoice: resolved.replaced,
  };
}

export function publicVoiceStatus(config: AzureConfig): VoicePublicStatus {
  switch (config.state) {
    case "off":
      return {
        provider: "none",
        live: false,
        voice: null,
        detail: "No Azure speech key is set. The browser voice is the free fallback.",
      };
    case "bad-config":
      return {
        provider: "none",
        live: false,
        voice: null,
        detail: config.detail,
      };
    case "ready":
      return {
        provider: "azure",
        live: true,
        voice: config.voice,
        detail: config.replacedVoice
          ? `AZURE_SPEECH_VOICE was not a British neural voice. Using ${config.voice}.`
          : `British neural voice ${config.voice} is configured.`,
      };
    default: {
      const neverConfig: never = config;
      return neverConfig;
    }
  }
}

export function azureEndpoint(region: string): string {
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

function britishScore(voice: VoiceCandidate): number {
  const code = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  let score = 0;
  if (code.startsWith("en-gb")) score += 100;
  else if (code === "en" || code.startsWith("en-")) score += 10;
  if (/british|uk english|united kingdom/.test(name)) score += 40;
  if (/google uk/.test(name)) score += 30;
  if (code.startsWith("en-gb") && /natural|neural|premium/.test(name)) score += 3;
  return score;
}

export function pickBrowserVoice<T extends VoiceCandidate>(voices: readonly T[]): T | null {
  if (voices.length === 0) return null;
  const ranked = [...voices].sort((a, b) => {
    const delta = britishScore(b) - britishScore(a);
    if (delta !== 0) return delta;
    return a.name.localeCompare(b.name);
  });
  return ranked[0] ?? null;
}

export function isBritishBrowserVoice(voice: VoiceCandidate | null): boolean {
  if (!voice) return false;
  const code = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  return code.startsWith("en-gb") || /british|uk english|united kingdom/.test(name);
}

export const MIC_BLOCKED_NOTICE = "Microphone blocked. Click the lock icon in the address bar, set Microphone to Allow, then reload.";

export function listenFailureMessage(code: string): string | null {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return MIC_BLOCKED_NOTICE;
    case "no-speech":
      return "No speech was heard. Try the mic again.";
    case "audio-capture":
      return "No microphone was found.";
    case "network":
      return "This browser's listener needed the network, and that failed.";
    case "language-not-supported":
      return "British English listening isn't available in this browser.";
    case "aborted":
      return null;
    default:
      return `Listening stopped (${code}).`;
  }
}

export const EARS_UNAVAILABLE = "This browser can't use the mic. Type instead. Chrome or Edge can listen.";

function speakerClause(input: {
  grokLive: boolean;
  grokVoice: string | null;
  azureLive: boolean;
  azureVoice: string | null;
  browserCanSpeak: boolean;
  browserVoice: { name: string; british: boolean } | null;
}): string {
  if (input.grokLive && input.grokVoice) {
    const name = input.grokVoice.toLowerCase() === "altair" ? "Altair" : input.grokVoice;
    return `Speaker: ${name}.`;
  }
  if (input.azureLive && input.azureVoice) {
    return `Speaker: ${friendlyVoiceName(input.azureVoice)}.`;
  }
  if (input.browserCanSpeak && input.browserVoice?.british) {
    return `Speaker: ${input.browserVoice.name}.`;
  }
  if (input.browserCanSpeak && input.browserVoice) {
    return `Speaker: ${input.browserVoice.name}.`;
  }
  if (input.browserCanSpeak) {
    return "Speaker: this computer.";
  }
  return "Speaker is not live.";
}

export function voiceSnapshot(input: {
  earsSupported: boolean;
  grokLive?: boolean;
  grokVoice?: string | null;
  azureLive: boolean;
  azureVoice: string | null;
  browserCanSpeak: boolean;
  browserVoice: { name: string; british: boolean } | null;
}): VoiceSnapshot {
  const grokLive = input.grokLive === true;
  const mouth: MouthKind = grokLive
    ? "grok"
    : input.azureLive
      ? "azure"
      : input.browserCanSpeak
        ? "browser"
        : "not-live";
  const ears: EarsKind = input.earsSupported ? "browser" : "unsupported";
  const speaker = speakerClause({
    grokLive,
    grokVoice: input.grokVoice ?? null,
    azureLive: input.azureLive,
    azureVoice: input.azureVoice,
    browserCanSpeak: input.browserCanSpeak,
    browserVoice: input.browserVoice,
  });
  const mic = ears === "browser" ? "Mic: British English." : "Mic: off — type instead.";
  return { ears, mouth, line: `${mic} ${speaker}` };
}

export function planAfterServer(input: {
  failure: ServerSpeakFailure;
  browserReady: boolean;
}): MouthPlan {
  switch (input.failure.reason) {
    case "unconfigured":
      if (!input.browserReady) {
        return {
          action: "not-live",
          notice: "Nothing was spoken. This browser can't speak, and no Grok voice is set.",
        };
      }
      return { action: "browser", notice: null };
    case "rejected":
    case "failed":
      if (!input.browserReady) {
        return { action: "not-live", notice: input.failure.detail };
      }
      return {
        action: "browser",
        notice: `${input.failure.detail} This computer's voice is speaking instead.`,
      };
    default: {
      const neverReason: never = input.failure.reason;
      return neverReason;
    }
  }
}
