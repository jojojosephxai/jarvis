import { Reactor, type OrbMode } from "@/components/reactor";

/** Same reactor as the center orb, with the nameplate from the side mark. */
export function JarvisBadge({
  mode,
  brainTag,
  size = "mark",
}: {
  mode: OrbMode;
  brainTag: string;
  size?: "mark" | "hero";
}) {
  return (
    <div
      className={size === "hero" ? "jarvis-badge jarvis-badge-hero" : "jarvis-badge"}
      data-mode={mode}
      aria-label="Jarvis"
    >
      <div className="jarvis-badge-core">
        <Reactor mode={mode} />
        <p className="jarvis-badge-title">J.A.R.V.I.S.</p>
      </div>
      <p className="jarvis-badge-model">{brainTag}</p>
    </div>
  );
}
