import { Reactor } from "@/components/reactor";
import { Button } from "@/components/ui/button";

export function BootScreen({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="boot-screen" role="dialog" aria-label="Jarvis face is coming online">
      <div className="optic-frame boot-frame">
        <span className="tick tick-tl" />
        <span className="tick tick-tr" />
        <span className="tick tick-bl" />
        <span className="tick tick-br" />
        <Reactor mode="standby" />
      </div>
      <p className="boot-kicker">Face</p>
      <h1 className="boot-title">Jarvis</h1>
      <p className="boot-line">Online. Brain not wired. Voice not live.</p>
      <Button type="button" variant="ghost" className="boot-skip" onClick={onSkip}>
        Skip
      </Button>
    </div>
  );
}
