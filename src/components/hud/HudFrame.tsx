"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ClockPosition, HudColor } from "@/lib/commands";
import { reactorCore, reactorLabel, type ReactorModel } from "@/lib/reactor";

const ACCENT: Record<HudColor, string> = {
  cyan: "#3ee0ff",
  gold: "#e6c15a",
  red: "#ff5a6a",
};

const CLOCK_CLASS: Record<ClockPosition, string> = {
  top: "top-4 left-1/2 -translate-x-1/2 text-center",
  bottom: "bottom-44 left-1/2 -translate-x-1/2 text-center md:bottom-40",
  left: "left-4 top-16 text-left md:top-1/3",
  right: "right-4 top-16 text-right md:top-1/3",
};

type HudFrameProps = {
  color: HudColor;
  clockPosition: ClockPosition;
  model: ReactorModel;
  children: ReactNode;
};

export function accentHex(color: HudColor): string {
  switch (color) {
    case "cyan":
      return ACCENT.cyan;
    case "gold":
      return ACCENT.gold;
    case "red":
      return ACCENT.red;
    default: {
      const exhaustive: never = color;
      return exhaustive;
    }
  }
}

export function HudFrame({ color, clockPosition, model, children }: HudFrameProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const kick = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(id);
    };
  }, []);

  const time = now
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(now)
    : "Syncing\u2026";
  const date = now
    ? new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      }).format(now)
    : "";

  return (
    <div
      data-testid="hud-root"
      data-hud-color={color}
      data-clock-side={clockPosition}
      data-reactor={model}
      className="hud-root relative h-dvh w-full overflow-hidden"
      style={{ "--hud": accentHex(color) } as CSSProperties}
    >
      <div className="pointer-events-none absolute inset-0">
        <span className="absolute top-3 left-3 h-8 w-8 border-t border-l border-[color:var(--hud)]" />
        <span className="absolute top-3 right-3 h-8 w-8 border-t border-r border-[color:var(--hud)]" />
        <span className="absolute bottom-3 left-3 h-8 w-8 border-b border-l border-[color:var(--hud)]" />
        <span className="absolute right-3 bottom-3 h-8 w-8 border-r border-b border-[color:var(--hud)]" />
        <JarvisOrb model={model} />
      </div>
      <div
        data-testid="clock"
        data-position={clockPosition}
        className={cn("absolute z-30 font-mono leading-tight", CLOCK_CLASS[clockPosition])}
      >
        <p className="text-[10px] tracking-[0.22em] text-[var(--hud-dim)] uppercase">Local</p>
        <p className="text-lg text-[var(--hud)] tabular-nums sm:text-xl">{time}</p>
        <p className="text-[10px] tracking-wide text-[var(--hud-dim)] uppercase">{date}</p>
      </div>
      {children}
    </div>
  );
}

function JarvisOrb({ model }: { model: ReactorModel }) {
  return (
    <div
      data-testid="jarvis-orb"
      className="absolute top-1/2 left-1/2 z-[1] size-[min(46vw,22rem)] -translate-x-1/2 -translate-y-[58%] text-[var(--hud)] md:-translate-y-1/2"
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 200" className="size-full">
        <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeOpacity="0.28" />
        <g className="motion-safe:animate-spin motion-safe:[animation-duration:18s]" style={{ transformOrigin: "100px 100px" }}>
          <circle cx="100" cy="100" r="78" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeDasharray="4 6" />
        </g>
        <g className="motion-safe:animate-spin motion-safe:[animation-duration:11s] motion-safe:[animation-direction:reverse]" style={{ transformOrigin: "100px 100px" }}>
          <circle cx="100" cy="100" r="58" fill="none" stroke="currentColor" strokeOpacity="0.8" strokeDasharray="10 8" />
        </g>
        <circle cx="100" cy="100" r="36" fill="none" stroke="currentColor" strokeOpacity="0.9" />
        <circle className="reactor-core" cx="100" cy="100" r="14" fill={reactorCore(model)} fillOpacity="0.9" />
        <circle cx="100" cy="100" r="6" fill="white" fillOpacity="0.9" />
        <path d="M100 8 L106 28 L100 24 L94 28 Z" fill="currentColor" />
        <path d="M100 192 L106 172 L100 176 L94 172 Z" fill="currentColor" />
        <path d="M8 100 L28 94 L24 100 L28 106 Z" fill="currentColor" />
        <path d="M192 100 L172 94 L176 100 L172 106 Z" fill="currentColor" />
      </svg>
      <p className="absolute inset-x-0 -bottom-1 text-center font-mono text-[10px] tracking-[0.16em] text-[var(--hud)] uppercase">
        {reactorLabel(model)}
      </p>
    </div>
  );
}
