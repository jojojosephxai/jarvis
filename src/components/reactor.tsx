import type { OrbMode } from "@/lib/orb-mode";

export type { OrbMode };

export function ReactorHeart({ mode }: { mode: OrbMode }) {
  return (
    <div className="reactor-heart" data-mode={mode} aria-hidden="true">
      <span className="reactor-halo" />
      <span className="reactor-halo reactor-halo-late" />
      <span className="reactor-iris" />
      <span className="reactor-core" />
    </div>
  );
}

export function Reactor({ mode }: { mode: OrbMode }) {
  return (
    <div className="reactor" data-mode={mode} aria-hidden="true">
      <ReactorHeart mode={mode} />
    </div>
  );
}

export function orbLabel(mode: OrbMode): string {
  switch (mode) {
    case "standby":
      return "Standby";
    case "listening":
      return "Listening";
    case "speaking":
      return "Speaking";
    case "ack":
      return "Heard";
    case "thinking":
      return "Thinking";
    case "working":
      return "Working";
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}
