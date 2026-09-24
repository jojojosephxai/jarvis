export type OrbMode = "standby" | "ack";

/** Rotating wire cage — lives inside the drag spin wrapper. */
export function ReactorCage({ mode }: { mode: OrbMode }) {
  return (
    <div className="reactor-cage" data-mode={mode} aria-hidden="true">
      <div className="reactor-tumble">
        <div className="reactor-spin reactor-spin-y-slow">
          <span className="reactor-band reactor-band-eq" />
          <span className="reactor-band reactor-band-lat-n" />
          <span className="reactor-band reactor-band-lat-s" />
          <span className="reactor-band reactor-band-ticks" />
          <span className="reactor-glint-arm reactor-glint-arm-a">
            <span className="reactor-glint" />
          </span>
        </div>
        <div className="reactor-spin reactor-spin-y-back">
          <span className="reactor-band reactor-band-mer" />
          <span className="reactor-band reactor-band-tilt-a" />
          <span className="reactor-band reactor-band-arc" />
          <span className="reactor-glint-arm reactor-glint-arm-b">
            <span className="reactor-glint reactor-glint-dim" />
          </span>
        </div>
        <div className="reactor-spin reactor-spin-y-fast">
          <span className="reactor-band reactor-band-tilt-b" />
          <span className="reactor-band reactor-band-tilt-c" />
          <span className="reactor-band reactor-band-inner" />
          <span className="reactor-sweep" />
        </div>
      </div>
    </div>
  );
}

/** Screen-facing core — stays upright so the heart never pancakes. */
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

/** Combined cage + heart for boot / static frames (not drag-spun). */
export function Reactor({ mode }: { mode: OrbMode }) {
  return (
    <div className="reactor" data-mode={mode} aria-hidden="true">
      <ReactorCage mode={mode} />
      <ReactorHeart mode={mode} />
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
