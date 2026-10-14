"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { OrbCanvas } from "@/components/orb-canvas";
import { OrbFallback } from "@/components/orb-fallback";
import { OrbMark } from "@/components/orb-mark";
import { orbStatusWord, type OrbMode } from "@/lib/orb-mode";

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
          <OrbMark mode={mode} />
        </div>
        <p className="orb-status" key={word}>
          <span className="orb-status-dot" />
          {word}
        </p>
      </div>
    </div>
  );
}
