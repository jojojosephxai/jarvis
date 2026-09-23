export type OrbMode = "standby" | "ack";

export function Reactor({ mode }: { mode: OrbMode }) {
  return (
    <div className="reactor" data-mode={mode} aria-hidden="true">
      <span className="reactor-halo" />
      <div className="reactor-spin">
        <span className="reactor-ring reactor-ring-outer" />
        <span className="reactor-wire reactor-wire-lat" />
        <span className="reactor-wire reactor-wire-meridian" />
        <span className="reactor-wire reactor-wire-tilt" />
        <span className="reactor-ring reactor-ring-ticks" />
        <span className="reactor-ring reactor-ring-mid" />
        <span className="reactor-iris" />
      </div>
      <span className="reactor-core" />
    </div>
  );
}

export function orbLabel(mode: OrbMode): string {
  switch (mode) {
    case "standby":
      return "Standby";
    case "ack":
      return "Heard";
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}
