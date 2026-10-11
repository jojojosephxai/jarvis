"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { OrbCanvas } from "@/components/orb-canvas";
import { orbStatusWord, type OrbMode } from "@/lib/orb-mode";

const TICKS = 72;

export function OrbStage({
  mode,
  levelRef,
  skill,
  place,
}: {
  mode: OrbMode;
  levelRef: RefObject<number>;
  skill: string | null;
  place: "center" | "dock";
}) {
  const ringRef = useRef<SVGSVGElement>(null);
  const [glFailed, setGlFailed] = useState(false);
  const word = orbStatusWord(mode, skill);
  const dev = process.env.NODE_ENV === "development";

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
      <div className="orb-dial" data-place={place} data-mode={mode}>
        <div className="orb-dial-ring">
          <OrbTicks ringRef={ringRef} listening={mode === "listening"} />
          {glFailed ? (
            <p className="orb-gl-error" role="alert">
              {dev
                ? "WebGL failed. The particle orb did not start."
                : "The orb did not start."}
            </p>
          ) : (
            <OrbCanvas mode={mode} levelRef={levelRef} onFail={() => setGlFailed(true)} />
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
}: {
  ringRef: RefObject<SVGSVGElement | null>;
  listening: boolean;
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
      aria-hidden="true"
    >
      {ticks}
      <circle className="orb-listen-arc" cx="50" cy="50" r="47.5" />
    </svg>
  );
}
