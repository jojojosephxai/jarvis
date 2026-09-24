export type OrbMode = "standby" | "ack";

export function Reactor({ mode }: { mode: OrbMode }) {
  return (
    <div className="reactor" data-mode={mode} aria-hidden="true">
      <span className="reactor-halo" />
      <span className="reactor-halo reactor-halo-late" />
      <div className="reactor-tumble">
        <div className="reactor-spin reactor-spin-slow">
          <span className="reactor-ring reactor-ring-outer" />
          <span className="reactor-ring reactor-ring-ticks" />
          <span className="reactor-arc reactor-arc-outer" />
        </div>
        <div className="reactor-spin reactor-spin-back">
          <span className="reactor-wire reactor-wire-lat" />
          <span className="reactor-wire reactor-wire-tilt" />
          <span className="reactor-arc reactor-arc-mid" />
          <span className="reactor-glint-arm reactor-glint-arm-a">
            <span className="reactor-glint" />
          </span>
        </div>
        <div className="reactor-spin reactor-spin-fast">
          <span className="reactor-wire reactor-wire-meridian" />
          <span className="reactor-wire reactor-wire-counter" />
          <span className="reactor-ring reactor-ring-mid" />
          <span className="reactor-arc reactor-arc-inner" />
          <span className="reactor-glint-arm reactor-glint-arm-b">
            <span className="reactor-glint reactor-glint-dim" />
          </span>
        </div>
        <span className="reactor-iris" />
        <span className="reactor-sweep" />
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
