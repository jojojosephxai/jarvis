"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { OrbCanvas } from "@/components/orb-canvas";
import { OrbFallback } from "@/components/orb-fallback";
import { orbStatusWord, type OrbMode } from "@/lib/orb-mode";

const TICKS = 72;

export type OrbPlace = "center" | "dock" | "corner";

export function OrbStage({
  mode,
  levelRef,
  skill,
  place,
  onCornerClick,
}: {
  mode: OrbMode;
  levelRef: RefObject<number>;
  skill: string | null;
  place: OrbPlace;
  onCornerClick?: () => void;
}) {
  const dialRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const word = orbStatusWord(mode, skill);

  useEffect(() => {
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const level = Math.max(0, Math.min(1, levelRef.current ?? 0));
      const breath = reducedQuery.matches ? 0 : Math.sin((now - started) / 1000 * 1.04719755);
      const working = dialRef.current?.dataset.mode === "working";
      dialRef.current?.style.setProperty("--level", String(level));
      const glow = glowRef.current;
      if (glow) {
        if (working) {
          glow.style.opacity = String(0.82 + level * 0.14);
          glow.style.transform = "scale(1)";
        } else {
          glow.style.opacity = String(0.7 + breath * 0.06 + level * 0.22);
          glow.style.transform = `scale(${(1 + breath * 0.01 + level * 0.16).toFixed(4)})`;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [levelRef]);

  return (
    <div className="stage-orb" data-place={place}>
      <div
        ref={dialRef}
        className="orb-dial"
        data-place={place}
        data-mode={mode}
        onClick={place === "corner" ? onCornerClick : undefined}
        onKeyDown={
          place === "corner"
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onCornerClick?.();
                }
              }
            : undefined
        }
        role={place === "corner" ? "button" : undefined}
        tabIndex={place === "corner" ? 0 : undefined}
        aria-label={place === "corner" ? "Close the task panel" : undefined}
      >
        <div className="orb-dial-ring">
          <div ref={glowRef} className="orb-glow" />
          <OrbTicks listening={mode === "listening"} speaking={mode === "speaking"} />
          {glError ? (
            <OrbFallback mode={mode} levelRef={levelRef} />
          ) : (
            <OrbCanvas
              mode={mode}
              levelRef={levelRef}
              onFail={(reason) => {
                const message = "WebGL failed. The particle orb did not start.";
                console.error(message, reason);
                setGlError(reason);
              }}
            />
          )}
        </div>
        {word ? (
          <p className="orb-status">
            <span className="orb-status-dot" />
            {word}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function OrbTicks({ listening, speaking }: { listening: boolean; speaking: boolean }) {
  const ticks = [];
  for (let index = 0; index < TICKS; index += 1) {
    const angle = (index / TICKS) * Math.PI * 2 - Math.PI / 2;
    const long = index % 6 === 0;
    const inner = long ? 45.4 : 46.5;
    const outer = 47.3;
    const round = (value: number) => Math.round(value * 1000) / 1000;
    ticks.push(
      <line
        key={index}
        x1={round(50 + Math.cos(angle) * inner)}
        y1={round(50 + Math.sin(angle) * inner)}
        x2={round(50 + Math.cos(angle) * outer)}
        y2={round(50 + Math.sin(angle) * outer)}
      />,
    );
  }
  return (
    <svg
      className="orb-ticks"
      viewBox="0 0 100 100"
      data-listening={listening ? "true" : "false"}
      data-speaking={speaking ? "true" : "false"}
      aria-hidden="true"
    >
      {ticks}
    </svg>
  );
}
