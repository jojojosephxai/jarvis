export type OrbMode = "standby" | "listening" | "speaking" | "ack" | "thinking" | "working";

export function resolveOrbMode(input: {
  speaking: boolean;
  working: boolean;
  listening: boolean;
  thinking?: boolean;
  ack: boolean;
}): OrbMode {
  if (input.speaking) return "speaking";
  if (input.working) return "working";
  if (input.listening) return "listening";
  if (input.thinking) return "thinking";
  if (input.ack) return "ack";
  return "standby";
}

function statusWord(mode: OrbMode): string {
  switch (mode) {
    case "listening":
      return "Listening";
    case "speaking":
      return "Speaking";
    case "working":
      return "Working";
    case "thinking":
    case "ack":
      return "Thinking";
    case "standby":
      return "Idle";
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

/** One line under the orb. Same mode that drives the animation, plus a skill when one is running. */
export function orbStatusWord(mode: OrbMode, skill: string | null): string {
  const word = statusWord(mode);
  const name = skill?.trim();
  if (name && (mode === "working" || mode === "thinking" || mode === "ack")) return `${word} · ${name}`;
  return word;
}

export function orbModeIndex(mode: OrbMode): number {
  switch (mode) {
    case "standby":
      return 0;
    case "listening":
      return 1;
    case "speaking":
      return 2;
    case "ack":
      return 3;
    case "working":
      return 4;
    case "thinking":
      return 5;
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}
