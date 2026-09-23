"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { browserEarsSupported, browserMouthSupported, startBrowserListen } from "@/lib/voice/browser";
import { EARS_UNAVAILABLE, voiceSnapshot, type VoiceSnapshot } from "@/lib/voice/policy";
import { browserVoiceSummary, speakAloud, stopSpeaking } from "@/lib/voice/session";
import type { VoicePublicStatus } from "@/lib/voice/types";

const CHECKING_LINE = "Checking the microphone and speaker.";

function isVoiceStatus(value: unknown): value is VoicePublicStatus {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<VoicePublicStatus>;
  return (
    (record.provider === "azure" || record.provider === "none") &&
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
    detail: "No Azure speech key is set. The browser voice is the free fallback.",
  };
}

export function useVoice(onSpeakingChange: (active: boolean) => void) {
  const onSpeakingChangeRef = useRef(onSpeakingChange);
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
          azureLive: status.live && status.provider === "azure",
          azureVoice: status.voice,
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
    stopSpeaking();
  }, []);

  const speak = useCallback(async (text: string): Promise<boolean> => {
    setNotice(null);
    try {
      const result = await speakAloud(text, {
        onStart: () => onSpeakingChangeRef.current(true),
        onEnd: () => onSpeakingChangeRef.current(false),
      });
      if (result.notice) setNotice(result.notice);
      if (!result.played && result.notice && /did not speak|can't speak|Speaker is not live/.test(result.notice)) {
        setSnapshot(
          voiceSnapshot({
            earsSupported: browserEarsSupported(),
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
  };
}
