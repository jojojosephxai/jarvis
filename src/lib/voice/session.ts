import {
  browserMouthSupported,
  describeBrowserVoice,
  loadBrowserVoices,
  preferredBrowserVoice,
  startBrowserSpeak,
} from "./browser";
import { clipSpeechText, planAfterServer } from "./policy";
import type { ServerSpeakFailure, SpeakOutcome } from "./types";

export type SpeakHooks = {
  onStart: () => void;
  onEnd: () => void;
  onLevel?: (level: number) => void;
};

let token = 0;
let speakAbort: AbortController | null = null;
let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let cancelBrowser: (() => void) | null = null;
let audioContext: AudioContext | null = null;
let mediaSource: MediaElementAudioSourceNode | null = null;
let levelAnalyser: AnalyserNode | null = null;
let levelFrame = 0;
let levelEmit: ((level: number) => void) | null = null;
let endAzure: (() => void) | null = null;

function stopLevelMonitor() {
  if (levelFrame) cancelAnimationFrame(levelFrame);
  levelFrame = 0;
  levelEmit?.(0);
  levelEmit = null;
  try {
    mediaSource?.disconnect();
  } catch {
    // The source may already be disconnected.
  }
  try {
    levelAnalyser?.disconnect();
  } catch {
    // The analyser may already be disconnected.
  }
  mediaSource = null;
  levelAnalyser = null;
}

function releaseAudio() {
  stopLevelMonitor();
  if (audio) {
    audio.pause();
    audio.src = "";
    audio = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

async function wireAnalyser(element: HTMLAudioElement, emit: (level: number) => void): Promise<boolean> {
  const Ctx = window.AudioContext;
  if (!Ctx) return false;
  try {
    if (!audioContext) audioContext = new Ctx();
    if (audioContext.state === "suspended") {
      const pending = audioContext;
      void pending.resume().then(() => {
        if (audio !== element || pending.state !== "running" || mediaSource) return;
        void wireAnalyser(element, emit);
      });
      return false;
    }
    if (audioContext.state !== "running") return false;
    const source = audioContext.createMediaElementSource(element);
    mediaSource = source;
    const analyser = audioContext.createAnalyser();
    levelAnalyser = analyser;
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    const bins = new Uint8Array(analyser.fftSize);
    levelEmit = emit;
    const tick = () => {
      if (!levelAnalyser) return;
      levelAnalyser.getByteTimeDomainData(bins);
      let sum = 0;
      for (let index = 0; index < bins.length; index += 1) {
        const sample = ((bins[index] ?? 128) - 128) / 128;
        sum += sample * sample;
      }
      const level = Math.max(0, Math.min(1, Math.sqrt(sum / bins.length) * 3.4));
      levelEmit?.(level);
      levelFrame = requestAnimationFrame(tick);
    };
    levelFrame = requestAnimationFrame(tick);
    return true;
  } catch {
    if (mediaSource && audioContext) {
      try {
        mediaSource.disconnect();
        mediaSource.connect(audioContext.destination);
      } catch {
        // The element stays owned by the source until release drops it.
      }
    }
    if (levelFrame) cancelAnimationFrame(levelFrame);
    levelFrame = 0;
    levelEmit = null;
    try {
      levelAnalyser?.disconnect();
    } catch {
      // The analyser may already be disconnected.
    }
    levelAnalyser = null;
    return false;
  }
}

export function stopSpeaking() {
  token += 1;
  speakAbort?.abort();
  speakAbort = null;
  cancelBrowser?.();
  cancelBrowser = null;
  endAzure?.();
  endAzure = null;
  releaseAudio();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function parseFailure(value: unknown): ServerSpeakFailure | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { live?: unknown; reason?: unknown; detail?: unknown };
  if (record.live !== false) return null;
  if (record.reason !== "unconfigured" && record.reason !== "rejected" && record.reason !== "failed") {
    return null;
  }
  const detail = typeof record.detail === "string" ? record.detail : "The voice service did not answer.";
  return { live: false, reason: record.reason, detail };
}

async function playAzure(blob: Blob, still: () => boolean, hooks: SpeakHooks): Promise<"played" | "blocked" | "cancelled"> {
  releaseAudio();
  const url = URL.createObjectURL(blob);
  objectUrl = url;
  const element = new Audio(url);
  audio = element;

  return new Promise((resolve) => {
    let opened = false;
    let settled = false;
    const finish = (result: "played" | "blocked" | "cancelled") => {
      if (settled) return;
      settled = true;
      endAzure = null;
      window.clearTimeout(timer);
      if (result !== "played") releaseAudio();
      resolve(result);
    };
    endAzure = () => finish("cancelled");
    const timer = window.setTimeout(() => {
      if (!opened) finish(still() ? "blocked" : "cancelled");
    }, 4000);

    element.onended = () => {
      if (settled) return;
      const alive = still();
      if (!opened && !alive) {
        finish("cancelled");
        return;
      }
      opened = true;
      releaseAudio();
      if (alive) hooks.onEnd();
      finish(alive ? "played" : "cancelled");
    };

    element.onerror = () => {
      if (!opened) finish(still() ? "blocked" : "cancelled");
    };

    void element
      .play()
      .then(() => {
        if (!still()) {
          finish("cancelled");
          return;
        }
        opened = true;
        hooks.onStart();
        if (hooks.onLevel) void wireAnalyser(element, hooks.onLevel);
      })
      .catch(() => {
        finish(still() ? "blocked" : "cancelled");
      });
  });
}

async function playBrowser(text: string, still: () => boolean, hooks: SpeakHooks): Promise<boolean> {
  if (!browserMouthSupported()) return false;
  const voices = window.speechSynthesis.getVoices();
  const voice = preferredBrowserVoice(voices);
  let markFinished = () => {};
  const finished = new Promise<void>((resolve) => {
    markFinished = () => {
      markFinished = () => {};
      resolve();
    };
  });
  const handle = startBrowserSpeak(text, voice, {
    onStart: () => {
      if (still()) hooks.onStart();
    },
    onEnd: () => {
      if (still()) hooks.onEnd();
      markFinished();
    },
    onLevel: hooks.onLevel
      ? (level) => {
          if (still()) hooks.onLevel?.(level);
        }
      : undefined,
  });
  cancelBrowser = () => {
    handle.cancel();
    markFinished();
  };
  const played = await handle.started;
  if (!still() || !played) {
    markFinished();
    return false;
  }
  await finished;
  return still();
}

export type PreparedSpeech = {
  failure: ServerSpeakFailure | null;
  audioBlob: Blob | null;
  serverMouth: "grok" | "azure";
  clipped: boolean;
};

/** Fetching the next sentence is independent of the currently playing audio. */
export async function prepareSpeech(text: string, signal: AbortSignal, turnId?: string): Promise<PreparedSpeech> {
  const clipped = clipSpeechText(text);
  try {
    const response = await fetch("/api/voice/speak", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clipped.text, turnId }), signal,
    });
    if (response.ok && (response.headers.get("content-type") ?? "").includes("audio")) {
      return { failure: null, audioBlob: await response.blob(),
        serverMouth: response.headers.get("x-voice-mouth") === "azure" ? "azure" : "grok",
        clipped: clipped.clipped || response.headers.get("x-voice-clipped") === "true" };
    }
    const payload: unknown = await response.json().catch(() => null);
    return { failure: parseFailure(payload) ?? { live: false, reason: "failed", detail: "The voice service did not return audio." }, audioBlob: null, serverMouth: "grok", clipped: clipped.clipped };
  } catch {
    return { failure: { live: false, reason: "failed", detail: "The voice server could not be reached." }, audioBlob: null, serverMouth: "grok", clipped: clipped.clipped };
  }
}

export async function speakAloud(text: string, hooks: SpeakHooks, prepared?: Promise<PreparedSpeech>): Promise<SpeakOutcome> {
  stopSpeaking();
  const mine = token;
  const still = () => token === mine;
  const clipped = clipSpeechText(text);
  if (!clipped.text) {
    return { played: false, mouth: "not-live", notice: "There is nothing to say." };
  }

  if (browserMouthSupported()) {
    await loadBrowserVoices();
  }
  if (!still()) return { played: false, mouth: "not-live", notice: null };

  const browserReady = browserMouthSupported();
  const abort = new AbortController();
  speakAbort = abort;

  const result = await (prepared ?? prepareSpeech(clipped.text, abort.signal));
  const { failure, audioBlob, serverMouth } = result;
  const azureClipped = result.clipped;

  if (!still()) return { played: false, mouth: "not-live", notice: null };

  if (audioBlob && audioBlob.size > 0) {
    const played = await playAzure(audioBlob, still, hooks);
    if (!still() || played === "cancelled") return { played: false, mouth: "not-live", notice: null };
    if (played === "played") {
      return {
        played: true,
        mouth: serverMouth,
        notice: azureClipped ? "Only the first part was spoken." : null,
      };
    }
    return {
      played: false,
      mouth: "not-live",
      notice: "Press Speak to hear the reply. The browser blocked the sound.",
    };
  }

  const plan = planAfterServer({
    failure: failure ?? { live: false, reason: "failed", detail: "The voice service did not return audio." },
    browserReady,
  });

  if (plan.action === "not-live") {
    return { played: false, mouth: "not-live", notice: plan.notice };
  }

  const played = await playBrowser(clipped.text, still, hooks);
  if (!still()) return { played: false, mouth: "not-live", notice: null };
  if (!played) {
    const extra = plan.notice ? `${plan.notice} ` : "";
    return {
      played: false,
      mouth: "not-live",
      notice: `${extra}This browser did not speak. Nothing was played.`.trim(),
    };
  }

  const notes = [plan.notice, clipped.clipped ? "Only the first part was spoken." : null].filter(
    (note): note is string => Boolean(note),
  );
  return { played: true, mouth: "browser", notice: notes.length > 0 ? notes.join(" ") : null };
}

export async function browserVoiceSummary(): Promise<{ name: string; british: boolean } | null> {
  const voices = await loadBrowserVoices();
  const picked = preferredBrowserVoice(voices);
  if (!picked) return null;
  return describeBrowserVoice({ name: picked.name, lang: picked.lang });
}
