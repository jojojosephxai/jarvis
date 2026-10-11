export type OrbMode = "standby" | "listening" | "speaking" | "ack" | "working";

export function resolveOrbMode(input: {
  speaking: boolean;
  working: boolean;
  listening: boolean;
  ack: boolean;
}): OrbMode {
  if (input.speaking) return "speaking";
  if (input.working) return "working";
  if (input.listening) return "listening";
  if (input.ack) return "ack";
  return "standby";
}

/** One word under the orb. Hidden while exploring unless a skill is already running. */
export function orbStatusWord(mode: OrbMode, skill: string | null): string | null {
  if (mode === "listening") return "LISTENING";
  if (mode === "speaking") return "SPEAKING";
  const name = skill?.trim();
  if (name) return name;
  if (mode === "working") return "WORKING";
  return null;
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
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}
