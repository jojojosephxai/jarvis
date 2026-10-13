"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { OrbCanvas } from "@/components/orb-canvas";
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
  const ringRef = useRef<SVGSVGElement>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const word = orbStatusWord(mode, skill);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      ringRef.current?.style.setProperty("--level", String(levelRef.current ?? 0));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [levelRef]);

  return (
    <div className="stage-orb" data-place={place}>
      <div
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
          <OrbTicks ringRef={ringRef} listening={mode === "listening"} speaking={mode === "speaking"} />
          {glError ? (
            <p className="orb-gl-error">WebGL failed. The particle orb did not start.</p>
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

function OrbTicks({
  ringRef,
  listening,
  speaking,
}: {
  ringRef: RefObject<SVGSVGElement | null>;
  listening: boolean;
  speaking: boolean;
}) {
  const ticks = [];
  for (let index = 0; index < TICKS; index += 1) {
    const angle = (index / TICKS) * Math.PI * 2 - Math.PI / 2;
    const long = index % 6 === 0;
    const inner = long ? 40 : 43.5;
    const outer = 47.5;
    ticks.push(
      <line
        key={index}
        x1={50 + Math.cos(angle) * inner}
        y1={50 + Math.sin(angle) * inner}
        x2={50 + Math.cos(angle) * outer}
        y2={50 + Math.sin(angle) * outer}
      />,
    );
  }
  return (
    <svg
      ref={ringRef}
      className="orb-ticks"
      viewBox="0 0 100 100"
      data-listening={listening ? "true" : "false"}
      data-speaking={speaking ? "true" : "false"}
      aria-hidden="true"
    >
      {ticks}
      <circle className="orb-listen-arc" cx="50" cy="50" r="47.5" />
    </svg>
  );
}
