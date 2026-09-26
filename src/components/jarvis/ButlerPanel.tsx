"use client";

import type { FormEvent } from "react";
import { Ear, EarOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReflexScores } from "@/lib/reflex";

export type ButlerPhase = "idle" | "listening" | "thinking" | "speaking";

export type KeptCard = {
  title: string;
  file: string;
  folder: string;
  body: string;
  links: { id: string; title: string }[];
};

type ButlerPanelProps = {
  phase: ButlerPhase;
  line: string;
  draft: string;
  handsFree: boolean;
  card: KeptCard | null;
  reflex: ReflexScores | null;
  status: string;
  onDraft: (value: string) => void;
  onSubmit: () => void;
  onToggleEar: () => void;
  onDismissCard: () => void;
  onOpenLink: (id: string) => void;
  onReadAloud: () => void;
};

export function ButlerPanel({
  phase,
  line,
  draft,
  handsFree,
  card,
  reflex,
  status,
  onDraft,
  onSubmit,
  onToggleEar,
  onDismissCard,
  onOpenLink,
  onReadAloud,
}: ButlerPanelProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  const live = phase === "listening" || phase === "speaking";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col items-center px-3 pb-3 md:px-6 md:pb-5">
      {card ? (
        <section
          data-testid="note-card"
          className="pointer-events-auto mb-3 max-h-36 w-full max-w-3xl overflow-auto rounded-2xl border border-white/10 bg-[#070b10]/92 p-4 text-[var(--hud-ink)] shadow-[0_12px_40px_rgba(0,0,0,0.45)] md:max-h-52"
        >
          <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--hud-dim)] uppercase">{card.folder}</p>
          <h2 className="text-base text-[var(--hud)]">{card.title}</h2>
          <p className="mt-2 text-sm leading-6">{card.body}</p>
          <p className="mt-2 text-sm text-[var(--hud-dim)]">Read it yourself, or say read it out loud.</p>
          {card.links.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {card.links.map((link) => (
                <li key={link.id}>
                  <button
                    type="button"
                    className="font-mono text-xs text-[var(--hud)] underline-offset-2 hover:underline"
                    onClick={() => onOpenLink(link.id)}
                  >
                    {link.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onReadAloud}
              className="h-8 border-[color:var(--hud)]/50 text-[var(--hud)]"
            >
              Read aloud
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onDismissCard}
              className="h-8 border-[color:var(--hud)]/50 text-[var(--hud)]"
            >
              Got it
            </Button>
          </div>
        </section>
      ) : null}
      <section
        data-testid="jarvis-bubble"
        className="pointer-events-auto relative w-full max-w-3xl rounded-2xl border border-white/10 bg-[#070b10]/92 px-5 pt-4 pb-5 shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] tracking-[0.28em] text-[var(--hud-dim)] uppercase">Jarvis</p>
          <Badge variant="outline" data-phase={phase} className="border-[color:var(--hud)]/40 text-[var(--hud)]">
            {phaseLabel(phase)}
          </Badge>
        </div>
        {reflex ? <ReflexStrip scores={reflex} /> : null}
        <p className="mt-2 max-h-36 overflow-auto text-[15px] leading-7 text-[var(--hud-ink)] md:max-h-none" data-jarvis-line role="status">
          {line}
        </p>
        {status ? (
          <p data-status className="mt-2 font-mono text-[10px] tracking-wide text-[var(--hud-dim)] uppercase">
            {status}
          </p>
        ) : null}
        <form onSubmit={submit} className="mt-3 flex gap-2">
          <label htmlFor="jarvis-command" className="sr-only">
            Ask Jarvis
          </label>
          <Input
            id="jarvis-command"
            name="command"
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            placeholder="Tell me, sir"
            autoComplete="off"
            className="h-10 border-white/10 bg-black/40 text-[var(--hud-ink)] placeholder:text-[var(--hud-dim)]"
          />
          <Button
            type="submit"
            className="h-10 border border-[color:var(--hud)] bg-[color:var(--hud)]/15 text-[var(--hud)] hover:bg-[color:var(--hud)]/30"
          >
            Send
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-pressed={handsFree}
            aria-label={handsFree ? "Turn the ear off" : "Turn the ear on"}
            onClick={onToggleEar}
            className="h-10 border-[color:var(--hud)]/50 text-[var(--hud)]"
          >
            {handsFree ? <Ear aria-hidden="true" /> : <EarOff aria-hidden="true" />}
            Ear
          </Button>
        </form>
        <p className="mt-2 font-mono text-[10px] tracking-wide text-[var(--hud-dim)] uppercase md:hidden">
          click fly \u00b7 double open \u00b7 drag pan
        </p>
        <span
          data-listening={live ? "live" : "idle"}
          className="listen-dot absolute bottom-4 -left-1 size-3 rounded-full"
          aria-hidden="true"
        />
      </section>
    </div>
  );
}

function ReflexStrip({ scores }: { scores: ReflexScores }) {
  const rows = [
    ["vault", scores.vault],
    ["finished", scores.finished],
    ["address", scores.addressing],
    ["action", scores.action],
    ["inside", scores.inside],
  ] as const;
  return (
    <p data-reflex className="mt-2 font-mono text-[10px] tracking-wide text-[var(--hud-dim)]">
      {rows.map(([name, value], index) => (
        <span key={name}>
          {index > 0 ? " \u00b7 " : ""}
          {name} {Math.round(value * 100)}
        </span>
      ))}
    </p>
  );
}

function phaseLabel(phase: ButlerPhase): string {
  switch (phase) {
    case "idle":
      return "Standing by";
    case "listening":
      return "Listening";
    case "thinking":
      return "Thinking";
    case "speaking":
      return "Speaking";
    default: {
      const exhaustive: never = phase;
      return exhaustive;
    }
  }
}
