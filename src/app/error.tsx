"use client";

import { Button } from "@/components/ui/button";

type HudErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function HudError({ error, reset }: HudErrorProps) {
  return (
    <div className="grid min-h-dvh place-items-center bg-[#05080d] px-6 text-center text-[#e7fbff]">
      <div className="max-w-md">
        <p className="font-mono text-xs tracking-[0.22em] text-[#3ee0ff] uppercase">Link lost</p>
        <h1 className="mt-3 text-2xl">The HUD dropped its link.</h1>
        <p className="mt-2 text-sm text-[#9eb4bd]">
          {error.digest
            ? `The local link reported ${error.digest}. Bring the board back when you are ready.`
            : "Nothing left the machine. Bring the board back when you are ready."}
        </p>
        <Button
          type="button"
          onClick={reset}
          className="mt-6 border border-[#3ee0ff] bg-[#3ee0ff]/15 text-[#3ee0ff] hover:bg-[#3ee0ff]/30"
        >
          Bring it back
        </Button>
      </div>
    </div>
  );
}
