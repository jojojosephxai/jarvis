"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { browserEarsSupported, browserMouthSupported, startBrowserListen } from "@/lib/voice/browser";
import { EARS_UNAVAILABLE, voiceSnapshot, type VoiceSnapshot } from "@/lib/voice/policy";
import { browserVoiceSummary, speakAloud, stopSpeaking } from "@/lib/voice/session";
import type { EarsKind, MouthKind, VoicePublicStatus } from "@/lib/voice/types";

const CHECKING_LINE = "Checking the microphone and speaker.";

function startMicLevel(onLevel: (level: number) => void): Promise<() => void> {
  return (async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return () => {};
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const sample = ((samples[index] ?? 128) - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / samples.length);
      onLevel(Math.max(0, Math.min(1, (rms - 0.015) / 0.16)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      onLevel(0);
      source.disconnect();
      for (const track of stream.getTracks()) track.stop();
      void context.close();
    };
  })();
}

function isVoiceStatus(value: unknown): value is VoicePublicStatus {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<VoicePublicStatus>;
  return (
    (record.provider === "grok" || record.provider === "azure" || record.provider === "none") &&
    typeof record.live === "boolean" &&
    (record.voice === null || typeof record.voice === "string") &&
    typeof record.detail === "string"
  );
}

async function fetchVoiceStatus(): Promise<VoicePublicStatus> {
  try {
    const response = await fetch("/api/voice");
    const payload: unknown = await response.json();
    if (isVoiceStatus(payload)) return payload;
  } catch {
    // The page still shows the browser voice, if there is one.
  }
  return {
    provider: "none",
    live: false,
    voice: null,
    detail: "No Grok voice is set. This computer's voice is the fallback.",
  };
}

export function useVoice(onSpeakingChange: (active: boolean) => void): {
  listening: boolean;
  line: string;
  mouth: MouthKind | "unknown";
  ears: EarsKind | "unknown";
  notice: string | null;
  speak: (text: string, hooks?: { onStart?: () => void }) => Promise<{ played: boolean; blocked: boolean }>;
  pressMic: (onText: (text: string, isFinal: boolean) => void) => void;
  stop: () => void;
  levelRef: RefObject<number>;
} {
  const onSpeakingChangeRef = useRef(onSpeakingChange);
  const levelRef = useRef(0);
  const listenStop = useRef<(() => void) | null>(null);
  const meterStop = useRef<(() => void) | null>(null);
  const meterGen = useRef(0);
  const [listening, setListening] = useState(false);
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>({
    ears: "unsupported",
    mouth: "not-live",
    line: CHECKING_LINE,
  });
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    onSpeakingChangeRef.current = onSpeakingChange;
  }, [onSpeakingChange]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [status, browserVoice] = await Promise.all([fetchVoiceStatus(), browserVoiceSummary()]);
      if (cancelled) return;
      setSnapshot(
        voiceSnapshot({
          earsSupported: browserEarsSupported(),
          grokLive: status.live && status.provider === "grok",
          grokVoice: status.provider === "grok" ? status.voice : null,
          azureLive: status.live && status.provider === "azure",
          azureVoice: status.provider === "azure" ? status.voice : null,
          browserCanSpeak: browserMouthSupported(),
          browserVoice,
        }),
      );
      if (
        status.detail.startsWith("Azure speech needs") ||
        status.detail.startsWith("AZURE_SPEECH_REGION") ||
        status.detail.startsWith("AZURE_SPEECH_VOICE")
      ) {
        setNotice(status.detail);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
      listenStop.current?.();
      listenStop.current = null;
      meterGen.current += 1;
      meterStop.current?.();
      meterStop.current = null;
      stopSpeaking();
    };
  }, []);

  const disarmMeter = useCallback(() => {
    meterGen.current += 1;
    meterStop.current?.();
    meterStop.current = null;
    levelRef.current = 0;
  }, []);

  const armMeter = useCallback(() => {
    const generation = meterGen.current + 1;
    meterGen.current = generation;
    void startMicLevel((level) => {
      if (meterGen.current !== generation) return;
      levelRef.current = level;
    })
      .then((stopMeter) => {
        if (meterGen.current !== generation) {
          stopMeter();
          return;
        }
        meterStop.current = stopMeter;
      })
      .catch(() => {
        // Speech recognition can still hear him. The shell stays quiet if the meter cannot open.
      });
  }, []);

  const stop = useCallback(() => {
    listenStop.current?.();
    listenStop.current = null;
    setListening(false);
    disarmMeter();
    stopSpeaking();
    onSpeakingChangeRef.current(false);
  }, [disarmMeter]);

  const speak = useCallback(async (text: string, hooks?: { onStart?: () => void }): Promise<{ played: boolean; blocked: boolean }> => {
    setNotice(null);
    levelRef.current = 0;
    try {
      const result = await speakAloud(text, {
        onStart: () => {
          hooks?.onStart?.();
          onSpeakingChangeRef.current(true);
        },
        onLevel: (level) => {
          levelRef.current = level;
        },
        onEnd: () => {
          levelRef.current = 0;
          onSpeakingChangeRef.current(false);
        },
      });
      const blocked = !result.played && /blocked the sound/i.test(result.notice ?? "");
      if (result.notice && !blocked) setNotice(result.notice);
      if (!result.played && result.notice && /did not speak|can't speak|Speaker is not live/.test(result.notice)) {
        setSnapshot(
          voiceSnapshot({
            earsSupported: browserEarsSupported(),
            grokLive: false,
            grokVoice: null,
            azureLive: false,
            azureVoice: null,
            browserCanSpeak: false,
            browserVoice: null,
          }),
        );
      }
      return { played: result.played, blocked };
    } catch {
      setNotice("Speaking hit a problem. Nothing was played.");
      levelRef.current = 0;
      onSpeakingChangeRef.current(false);
      return { played: false, blocked: false };
    }
  }, []);

  const toggleListen = useCallback((onText: (text: string, isFinal: boolean) => void) => {
    if (listenStop.current) {
      listenStop.current();
      listenStop.current = null;
      setListening(false);
      disarmMeter();
      return;
    }

    const started = startBrowserListen({
      onTranscript: onText,
      onError: (message) => {
        if (message) setNotice(message);
      },
      onEnd: () => {
        listenStop.current = null;
        setListening(false);
        disarmMeter();
      },
    });

    if ("error" in started) {
      setNotice(started.error);
      setSnapshot((current) => ({ ...current, ears: "unsupported" }));
      return;
    }

    listenStop.current = started.stop;
    setListening(true);
    setNotice(null);
    armMeter();
  }, [armMeter, disarmMeter]);

  const pressMic = useCallback(
    (onText: (text: string, isFinal: boolean) => void) => {
      if (!browserEarsSupported()) {
        setNotice(EARS_UNAVAILABLE);
        return;
      }
      toggleListen(onText);
    },
    [toggleListen],
  );

  return {
    listening,
    line: ready ? snapshot.line : CHECKING_LINE,
    mouth: ready ? snapshot.mouth : "unknown",
    ears: ready ? snapshot.ears : "unknown",
    notice,
    speak,
    pressMic,
    stop,
    levelRef,
  };
}
