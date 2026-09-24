import { clipSpeechText } from "./policy";
import type { ServerSpeakFailure, VoicePublicStatus } from "./types";

const TTS_URL = "https://api.x.ai/v1/tts";
const MIN_SPEED = 0.7;
const MAX_SPEED = 1.5;

export type GrokTtsEnv = {
  XAI_API_KEY?: string;
  XAI_TTS_VOICE_ID?: string;
  XAI_TTS_SPEED?: string;
};

export type GrokTtsConfig =
  | { state: "off"; detail: string }
  | { state: "ready"; key: string; voiceId: string; speed: number };

export type GrokSynthResult =
  | { ok: true; bytes: Uint8Array; contentType: "audio/mpeg"; voice: string; clipped: boolean; speed: number }
  | (ServerSpeakFailure & { ok: false; httpStatus: number });

const MISSING = "No Grok voice is set. This computer's voice is the fallback.";

export function clampTtsSpeed(raw: string | undefined): number {
  const text = raw?.trim() ?? "";
  if (!text) return 1;
  const value = Number(text);
  if (!Number.isFinite(value)) return 1;
  if (value < MIN_SPEED) return MIN_SPEED;
  if (value > MAX_SPEED) return MAX_SPEED;
  return value;
}

export function grokTtsEnvFromProcess(): GrokTtsEnv {
  return {
    XAI_API_KEY: process.env.XAI_API_KEY,
    XAI_TTS_VOICE_ID: process.env.XAI_TTS_VOICE_ID,
    XAI_TTS_SPEED: process.env.XAI_TTS_SPEED,
  };
}

export function readGrokTtsConfig(env?: GrokTtsEnv): GrokTtsConfig {
  const source = env ?? grokTtsEnvFromProcess();
  const key = source.XAI_API_KEY?.trim() ?? "";
  const voiceId = source.XAI_TTS_VOICE_ID?.trim() ?? "";
  if (!key || !voiceId) return { state: "off", detail: MISSING };
  return { state: "ready", key, voiceId, speed: clampTtsSpeed(source.XAI_TTS_SPEED) };
}

export function grokTtsConfigured(env?: GrokTtsEnv): boolean {
  return readGrokTtsConfig(env).state === "ready";
}

export function grokTtsPublicStatus(env?: GrokTtsEnv): VoicePublicStatus {
  const config = readGrokTtsConfig(env);
  switch (config.state) {
    case "off":
      return { provider: "none", live: false, voice: null, detail: config.detail };
    case "ready":
      return {
        provider: "grok",
        live: true,
        voice: config.voiceId,
        detail: `Grok voice ${config.voiceId} is configured. The key stays on the server.`,
      };
    default: {
      const neverConfig: never = config;
      return neverConfig;
    }
  }
}

function upstreamFailure(status: number): ServerSpeakFailure & { ok: false; httpStatus: number } {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      httpStatus: 502,
      live: false,
      reason: "rejected",
      detail: "xAI rejected the speech key.",
    };
  }
  if (status === 429) {
    return {
      ok: false,
      httpStatus: 502,
      live: false,
      reason: "failed",
      detail: "xAI's voice limit was hit.",
    };
  }
  return {
    ok: false,
    httpStatus: 502,
    live: false,
    reason: "failed",
    detail: `xAI did not return audio (${status}).`,
  };
}

function looksLikeAudio(contentType: string): boolean {
  if (!contentType) return true;
  const type = contentType.toLowerCase();
  if (type.includes("json") || type.includes("text/") || type.includes("html")) return false;
  return type.includes("audio") || type.includes("octet-stream") || type.includes("mpeg");
}

export async function synthesizeGrok(
  text: string,
  env?: GrokTtsEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<GrokSynthResult> {
  const clipped = clipSpeechText(text);
  if (!clipped.text) {
    return { ok: false, httpStatus: 400, live: false, reason: "failed", detail: "There is nothing to say." };
  }

  const config = readGrokTtsConfig(env);
  if (config.state === "off") {
    return { ok: false, httpStatus: 503, live: false, reason: "unconfigured", detail: config.detail };
  }

  let response: Response;
  try {
    response = await fetchImpl(TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: clipped.text,
        voice_id: config.voiceId,
        language: "en",
        speed: config.speed,
      }),
    });
  } catch {
    return {
      ok: false,
      httpStatus: 502,
      live: false,
      reason: "failed",
      detail: "xAI speech did not answer.",
    };
  }

  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !looksLikeAudio(type)) {
    return upstreamFailure(response.status);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    return {
      ok: false,
      httpStatus: 502,
      live: false,
      reason: "failed",
      detail: "xAI returned empty audio.",
    };
  }

  return {
    ok: true,
    bytes,
    contentType: "audio/mpeg",
    voice: config.voiceId,
    clipped: clipped.clipped,
    speed: config.speed,
  };
}
