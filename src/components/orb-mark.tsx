"use client";

import type { OrbMode } from "@/lib/orb-mode";

const CX = 60;
const CY = 60;

function polar(radius: number, degrees: number): { x: number; y: number } {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return {
    x: Math.round((CX + Math.cos(rad) * radius) * 1000) / 1000,
    y: Math.round((CY + Math.sin(rad) * radius) * 1000) / 1000,
  };
}

function arcPath(radius: number, start: number, end: number): string {
  const from = polar(radius, start);
  const to = polar(radius, end);
  const sweep = ((end - start) % 360 + 360) % 360;
  const large = sweep > 180 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${large} 1 ${to.x} ${to.y}`;
}

const INNER = [
  [18, 108],
  [140, 228],
  [258, 342],
] as const;

const MIDDLE = [
  [8, 78],
  [112, 196],
  [228, 312],
] as const;

const OUTER = [
  [24, 96],
  [132, 204],
  [236, 308],
  [332, 12],
] as const;

function Ring({ radius, arcs }: { radius: number; arcs: readonly (readonly [number, number])[] }) {
  return (
    <>
      {arcs.map(([start, end]) => (
        <path key={`${radius}-${start}`} d={arcPath(radius, start, end)} />
      ))}
    </>
  );
}

function TickRing() {
  const ticks = [];
  for (let index = 0; index < 72; index += 1) {
    const angle = (index / 72) * Math.PI * 2 - Math.PI / 2;
    const long = index % 6 === 0;
    const inner = long ? 44.2 : 45.4;
    const outer = 46.6;
    const round = (value: number) => Math.round(value * 1000) / 1000;
    ticks.push(
      <line
        key={index}
        data-long={long ? "true" : "false"}
        x1={round(CX + Math.cos(angle) * inner)}
        y1={round(CY + Math.sin(angle) * inner)}
        x2={round(CX + Math.cos(angle) * outer)}
        y2={round(CY + Math.sin(angle) * outer)}
      />,
    );
  }
  return <svg className="orb-mark orb-ticks-fine" viewBox="0 0 120 120" aria-hidden="true">{ticks}</svg>;
}

/** Movie-logo rings: three broken arcs plus one tick ring. One cyan, low opacity. */
export function OrbMark({ mode }: { mode: OrbMode }) {
  return (
    <>
      <svg className="orb-mark orb-arc orb-arc-c" viewBox="0 0 120 120" data-mode={mode} aria-hidden="true">
        <Ring radius={50} arcs={OUTER} />
      </svg>
      <svg className="orb-mark orb-arc orb-arc-b" viewBox="0 0 120 120" aria-hidden="true">
        <Ring radius={42} arcs={MIDDLE} />
      </svg>
      <svg className="orb-mark orb-arc orb-arc-a" viewBox="0 0 120 120" aria-hidden="true">
        <Ring radius={33} arcs={INNER} />
      </svg>
      <TickRing />
      <span className="orb-core" />
    </>
  );
}
