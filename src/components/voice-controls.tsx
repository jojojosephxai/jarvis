"use client";

import { Button } from "@/components/ui/button";

export function VoiceButtons({
  listening,
  pending,
  onMic,
  onSpeak,
}: {
  listening: boolean;
  pending: boolean;
  onMic: () => void;
  onSpeak: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant={listening ? "default" : "outline"}
        className="h-8 shrink-0 rounded-none px-2.5 text-sm"
        aria-pressed={listening}
        disabled={pending}
        onClick={onMic}
      >
        {listening ? "Stop" : "Mic"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-8 shrink-0 rounded-none px-2.5 text-sm"
        disabled={pending || listening}
        onClick={onSpeak}
      >
        Speak
      </Button>
    </>
  );
}

export function VoiceStatus({ line, notice, mouth }: { line: string; notice: string | null; mouth: string }) {
  return (
    <>
      {line ? (
        <p
          className="text-xs leading-snug text-muted-foreground"
          style={{ flexBasis: "100%" }}
          data-voice-mouth={mouth}
          aria-live="polite"
        >
          {line}
        </p>
      ) : null}
      {notice ? (
        <p className="text-xs leading-snug text-destructive" style={{ flexBasis: "100%" }} role="status">
          {notice}
        </p>
      ) : null}
    </>
  );
}
