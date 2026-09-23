type PresenceMode = "idle" | "thinking" | "speaking";

const LABEL: Record<PresenceMode, string> = {
  idle: "Here",
  thinking: "Thinking",
  speaking: "Speaking",
};

export function Presence({ mode }: { mode: PresenceMode }) {
  return (
    <div className="presence" data-mode={mode}>
      <div className="wick-glow" />
      <div className="wick" />
      <p className="sr-only">Jarvis is {LABEL[mode].toLowerCase()}</p>
    </div>
  );
}

export function presenceLabel(mode: PresenceMode): string {
  return LABEL[mode];
}
