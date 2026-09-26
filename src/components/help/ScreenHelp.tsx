"use client";

import { PHRASES } from "@/lib/commands";
import { Button } from "@/components/ui/button";

type ScreenHelpProps = {
  onClose: () => void;
};

export function ScreenHelp({ onClose }: ScreenHelpProps) {
  return (
    <section
      data-testid="screen-help"
      data-help="shown"
      className="max-h-72 overflow-auto rounded-xl border border-[color:var(--hud)]/40 bg-black/80 p-4"
      aria-label="Screen help"
    >
      <h2 className="font-mono text-xs tracking-[0.22em] text-[var(--hud)] uppercase">Screen help</h2>
      <p className="mt-2 text-sm text-[var(--hud-ink)]">
        Say a phrase. For the clock, the color, and the graph, I ask one question. Then say ok or change. Say be quiet to stop my voice.
      </p>
      <ul className="mt-3 grid gap-1 font-mono text-sm text-[var(--hud)]">
        {PHRASES.map((item) => (
          <li key={item.phrase}>{item.phrase}</li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        onClick={onClose}
        className="mt-3 border-[color:var(--hud)]/50 text-[var(--hud)]"
      >
        Hide
      </Button>
    </section>
  );
}
