import { Reactor } from "@/components/reactor";
import { Button } from "@/components/ui/button";
import type { MouthKind } from "@/lib/voice/types";

type BrainLabel = "Vault" | "grok-4.7" | "Brain wiring";

function bootLine(brain: BrainLabel, mouth: MouthKind | "unknown"): string {
  const brainPart =
    brain === "Brain wiring" ? "Brain not wired" : brain === "grok-4.7" ? "Brain grok-4.7" : "Brain on vault";
  switch (mouth) {
    case "unknown":
      return `Online. ${brainPart}. Voice checking.`;
    case "not-live":
      return `Online. ${brainPart}. Voice not live.`;
    case "grok":
      return `Online. ${brainPart}. Voice Altair.`;
    case "azure":
      return `Online. ${brainPart}. Voice British.`;
    case "browser":
      return `Online. ${brainPart}. Voice this computer.`;
    default: {
      const neverMouth: never = mouth;
      return neverMouth;
    }
  }
}

export function BootScreen({
  onSkip,
  brainLabel,
  mouth,
}: {
  onSkip: () => void;
  brainLabel: BrainLabel;
  mouth: MouthKind | "unknown";
}) {
  return (
    <div className="boot-screen" role="dialog" aria-label="Jarvis face is coming online">
      <div className="boot-logo" aria-hidden="true">
        <Reactor mode="standby" />
      </div>
      <p className="boot-kicker">Face</p>
      <h1 className="boot-title">Jarvis</h1>
      <p className="boot-line">{bootLine(brainLabel, mouth)}</p>
      <Button type="button" variant="ghost" className="boot-skip" onClick={onSkip}>
        Skip
      </Button>
    </div>
  );
}
