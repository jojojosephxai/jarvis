import { EARS_UNAVAILABLE, isBritishBrowserVoice, listenFailureMessage, pickBrowserVoice } from "./policy";
import type { VoiceCandidate } from "./types";

type RecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type RecognitionEvent = {
  results: ArrayLike<RecognitionResult>;
};

type RecognitionErrorEvent = {
  error: string;
};

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function browserEarsSupported(): boolean {
  return recognitionCtor() !== null;
}

export function browserMouthSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis != null;
}

function waitForVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const existing = synth.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const finish = () => {
      synth.removeEventListener("voiceschanged", finish);
      window.clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = window.setTimeout(finish, 800);
    synth.addEventListener("voiceschanged", finish);
  });
}

export async function loadBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!browserMouthSupported()) return [];
  return waitForVoices(window.speechSynthesis);
}

export function preferredBrowserVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const picked = pickBrowserVoice(voices.map((voice) => ({ name: voice.name, lang: voice.lang, voice })));
  return picked?.voice ?? null;
}

export function describeBrowserVoice(voice: VoiceCandidate | null): { name: string; british: boolean } | null {
  if (!voice) return null;
  return { name: voice.name, british: isBritishBrowserVoice(voice) };
}

export function startBrowserListen(handlers: {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (message: string | null) => void;
  onEnd: () => void;
}): { stop: () => void } | { error: string } {
  const Ctor = recognitionCtor();
  if (!Ctor) return { error: EARS_UNAVAILABLE };

  const recognition = new Ctor();
  recognition.lang = "en-GB";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let ignore = false;
  let ended = false;
  let sentFinal = false;

  const finish = () => {
    if (ended) return;
    ended = true;
    handlers.onEnd();
  };

  recognition.onresult = (event) => {
    if (ignore) return;
    let text = "";
    let isFinal = false;
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result) continue;
      text += result[0]?.transcript ?? "";
      if (result.isFinal) isFinal = true;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    handlers.onTranscript(trimmed, false);
    if (isFinal && !sentFinal) {
      sentFinal = true;
      handlers.onTranscript(trimmed, true);
    }
  };

  recognition.onerror = (event) => {
    if (ignore) return;
    handlers.onError(listenFailureMessage(event.error));
  };

  recognition.onend = () => {
    finish();
  };

  try {
    recognition.start();
  } catch {
    return { error: "The microphone didn't start. Try again, or type instead." };
  }

  return {
    stop: () => {
      ignore = true;
      try {
        recognition.abort();
      } catch {
        finish();
      }
    },
  };
}

export function startBrowserSpeak(
  text: string,
  voice: SpeechSynthesisVoice | null,
  hooks: { onStart: () => void; onEnd: () => void; onLevel?: (level: number) => void },
): { cancel: () => void; started: Promise<boolean> } {
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice?.lang || "en-GB";
  utterance.rate = 1;
  utterance.pitch = 1;

  let settled = false;
  let heardStart = false;
  let resolveStarted: (played: boolean) => void = () => {};
  const started = new Promise<boolean>((resolve) => {
    resolveStarted = resolve;
  });
  let raf = 0;
  let attackStart = 0;
  let releasing = false;
  let releaseStart = 0;
  let releaseFrom = 0;
  let level = 0;
  let ended = false;

  const emit = (next: number) => {
    level = next;
    hooks.onLevel?.(next);
  };

  const stopEnvelope = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    emit(0);
  };

  const frame = (now: number) => {
    if (releasing) {
      const t = Math.min(1, (now - releaseStart) / 180);
      emit(releaseFrom * (1 - t));
      if (t < 1) {
        raf = requestAnimationFrame(frame);
        return;
      }
      emit(0);
      raf = 0;
      if (!ended) {
        ended = true;
        hooks.onEnd();
      }
      return;
    }
    const t = Math.min(1, (now - attackStart) / 180);
    emit(0.55 * t);
    raf = requestAnimationFrame(frame);
  };

  const beginEnvelope = () => {
    if (!hooks.onLevel || raf || releasing) return;
    attackStart = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const releaseEnvelope = () => {
    if (!hooks.onLevel) {
      if (!ended) {
        ended = true;
        hooks.onEnd();
      }
      return;
    }
    if (releasing) return;
    releasing = true;
    releaseFrom = level;
    releaseStart = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const settle = (played: boolean) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(backup);
    resolveStarted(played);
  };

  const backup = window.setTimeout(() => {
    if (heardStart || synth.speaking) {
      if (!heardStart) {
        heardStart = true;
        hooks.onStart();
        beginEnvelope();
      }
      settle(true);
      return;
    }
    settle(false);
  }, 1600);

  utterance.onstart = () => {
    if (heardStart) return;
    heardStart = true;
    hooks.onStart();
    beginEnvelope();
    settle(true);
  };

  utterance.onend = () => {
    if (!heardStart) {
      settle(false);
      return;
    }
    releaseEnvelope();
  };

  utterance.onerror = () => {
    stopEnvelope();
    if (heardStart) {
      if (!ended) {
        ended = true;
        hooks.onEnd();
      }
      return;
    }
    settle(false);
  };

  window.setTimeout(() => {
    if (settled) return;
    try {
      synth.speak(utterance);
    } catch {
      settle(false);
    }
  }, 40);

  return {
    started,
    cancel: () => {
      stopEnvelope();
      ended = true;
      try {
        synth.cancel();
      } catch {
        settle(false);
      }
    },
  };
}
