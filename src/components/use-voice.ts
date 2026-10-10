"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { browserEarsSupported, browserMouthSupported, startBrowserListen } from "@/lib/voice/browser";
import { EARS_UNAVAILABLE, voiceSnapshot, type VoiceSnapshot } from "@/lib/voice/policy";
import { browserVoiceSummary, speakAloud, stopSpeaking } from "@/lib/voice/session";
import type { EarsKind, MouthKind, VoicePublicStatus } from "@/lib/voice/types";

const CHECKING_LINE = "Checking the microphone and speaker.";

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
  speak: (text: string) => Promise<boolean>;
  pressMic: (onText: (text: string, isFinal: boolean) => void) => void;
  stop: () => void;
  levelRef: RefObject<number>;
} {
  const onSpeakingChangeRef = useRef(onSpeakingChange);
  const levelRef = useRef(0);
  const listenStop = useRef<(() => void) | null>(null);
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
      stopSpeaking();
    };
  }, []);

  const stop = useCallback(() => {
    listenStop.current?.();
    listenStop.current = null;
    setListening(false);
    levelRef.current = 0;
    stopSpeaking();
    onSpeakingChangeRef.current(false);
  }, []);

  const speak = useCallback(async (text: string): Promise<boolean> => {
    setNotice(null);
    try {
      const result = await speakAloud(text, {
        onStart: () => {
          levelRef.current = 1;
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
      if (result.notice) setNotice(result.notice);
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
      return result.played;
    } catch {
      setNotice("Speaking hit a problem. Nothing was played.");
      levelRef.current = 0;
      onSpeakingChangeRef.current(false);
      return false;
    }
  }, []);

  const toggleListen = useCallback((onText: (text: string, isFinal: boolean) => void) => {
    if (listenStop.current) {
      listenStop.current();
      listenStop.current = null;
      setListening(false);
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
  }, []);

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
