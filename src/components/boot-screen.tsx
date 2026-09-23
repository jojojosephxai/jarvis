import { Button } from "@/components/ui/button";

export function BootScreen({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="boot-screen" role="dialog" aria-label="Jarvis is lighting the room">
      <div className="presence" data-mode="idle">
        <div className="wick-glow" />
        <div className="wick" />
      </div>
      <h1 className="boot-title">Jarvis</h1>
      <p className="boot-line">The room is lit.</p>
      <Button type="button" variant="ghost" className="boot-skip" onClick={onSkip}>
        Skip
      </Button>
    </div>
  );
}
