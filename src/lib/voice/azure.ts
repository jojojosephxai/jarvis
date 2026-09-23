import {
  azureEndpoint,
  buildSsml,
  clipSpeechText,
  publicVoiceStatus,
  readAzureConfig,
  type AzureEnv,
} from "./policy";
import type { ServerSpeakFailure, VoicePublicStatus } from "./types";

export type AzureSynthResult =
  | { ok: true; bytes: Uint8Array; contentType: "audio/mpeg"; voice: string; clipped: boolean }
  | (ServerSpeakFailure & { ok: false; httpStatus: number });

function upstreamFailure(status: number): ServerSpeakFailure & { ok: false; httpStatus: number } {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      httpStatus: 502,
      live: false,
      reason: "rejected",
      detail: "Azure rejected the speech key.",
    };
  }
  if (status === 429) {
    return {
      ok: false,
      httpStatus: 502,
      live: false,
      reason: "failed",
      detail: "Azure's free voice limit was hit.",
    };
  }
  return {
    ok: false,
    httpStatus: 502,
    live: false,
    reason: "failed",
    detail: `Azure did not return audio (${status}).`,
  };
}

export function voiceStatus(env?: AzureEnv): VoicePublicStatus {
  return publicVoiceStatus(readAzureConfig(env));
}

export async function synthesizeAzure(
  text: string,
  env?: AzureEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<AzureSynthResult> {
  const clipped = clipSpeechText(text);
  if (!clipped.text) {
    return { ok: false, httpStatus: 400, live: false, reason: "failed", detail: "There is nothing to say." };
  }

  const config = readAzureConfig(env);
  switch (config.state) {
    case "off":
      return {
        ok: false,
        httpStatus: 503,
        live: false,
        reason: "unconfigured",
        detail: "No Azure speech key is set. The browser voice is the free fallback.",
      };
    case "bad-config":
      return { ok: false, httpStatus: 503, live: false, reason: "failed", detail: config.detail };
    case "ready":
      break;
    default: {
      const neverConfig: never = config;
      return neverConfig;
    }
  }

  const ssml = buildSsml(clipped.text, config.voice);
  let response: Response;
  try {
    response = await fetchImpl(azureEndpoint(config.region), {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": config.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
        "User-Agent": "jarvis-voice",
      },
      body: ssml,
    });
  } catch {
    return {
      ok: false,
      httpStatus: 502,
      live: false,
      reason: "failed",
      detail: "Azure speech did not answer.",
    };
  }

  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes("audio")) {
    return upstreamFailure(response.status);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    return {
      ok: false,
      httpStatus: 502,
      live: false,
      reason: "failed",
      detail: "Azure returned empty audio.",
    };
  }

  return {
    ok: true,
    bytes,
    contentType: "audio/mpeg",
    voice: config.voice,
    clipped: clipped.clipped,
  };
}
