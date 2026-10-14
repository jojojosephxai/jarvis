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

const RINGS: { radius: number; className: string; arcs: readonly (readonly [number, number])[] }[] = [
  {
    radius: 54,
    className: "orb-arc orb-arc-d",
    arcs: [
      [12, 68],
      [96, 154],
      [176, 236],
      [258, 318],
      [336, 8],
    ],
  },
  {
    radius: 48,
    className: "orb-arc orb-arc-c",
    arcs: [
      [24, 96],
      [132, 204],
      [236, 308],
      [332, 12],
    ],
  },
  {
    radius: 41,
    className: "orb-arc orb-arc-b",
    arcs: [
      [8, 78],
      [112, 196],
      [228, 312],
    ],
  },
  {
    radius: 33,
    className: "orb-arc orb-arc-a",
    arcs: [
      [18, 108],
      [140, 228],
      [258, 342],
    ],
  },
  {
    radius: 26,
    className: "orb-arc orb-arc-e",
    arcs: [
      [40, 110],
      [160, 230],
      [280, 350],
    ],
  },
];

function TickRing() {
  const ticks = [];
  for (let index = 0; index < 120; index += 1) {
    const angle = (index / 120) * Math.PI * 2 - Math.PI / 2;
    const major = index % 10 === 0;
    const mid = index % 5 === 0;
    const inner = major ? 49.2 : mid ? 50.2 : 51;
    const outer = 52.4;
    const round = (value: number) => Math.round(value * 1000) / 1000;
    ticks.push(
      <line
        key={index}
        data-long={major ? "true" : "false"}
        x1={round(CX + Math.cos(angle) * inner)}
        y1={round(CY + Math.sin(angle) * inner)}
        x2={round(CX + Math.cos(angle) * outer)}
        y2={round(CY + Math.sin(angle) * outer)}
      />,
    );
  }
  return (
    <svg className="orb-mark orb-ticks-fine" viewBox="0 0 120 120" aria-hidden="true">
      {ticks}
    </svg>
  );
}

function DegreeMarks() {
  const marks = [];
  for (let deg = 0; deg < 360; deg += 30) {
    const point = polar(46.2, deg);
    marks.push(
      <text key={deg} x={point.x} y={point.y} textAnchor="middle" dominantBaseline="middle">
        {deg}
      </text>,
    );
  }
  return (
    <svg className="orb-mark orb-degrees" viewBox="0 0 120 120" aria-hidden="true">
      {marks}
    </svg>
  );
}

function Spokes() {
  const lines = [];
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
    const round = (value: number) => Math.round(value * 1000) / 1000;
    lines.push(
      <line
        key={index}
        x1={round(CX + Math.cos(angle) * 18)}
        y1={round(CY + Math.sin(angle) * 18)}
        x2={round(CX + Math.cos(angle) * 24)}
        y2={round(CY + Math.sin(angle) * 24)}
      />,
    );
  }
  return (
    <svg className="orb-mark orb-spokes" viewBox="0 0 120 120" aria-hidden="true">
      {lines}
    </svg>
  );
}

function Brackets() {
  const paths = [20, 110, 200, 290].map((angle) => {
    const left = polar(22, angle - 8);
    const mid = polar(22, angle);
    const right = polar(22, angle + 8);
    const tip = polar(19.5, angle);
    return `M ${left.x} ${left.y} L ${mid.x} ${mid.y} L ${right.x} ${right.y} M ${mid.x} ${mid.y} L ${tip.x} ${tip.y}`;
  });
  return (
    <svg className="orb-mark orb-brackets" viewBox="0 0 120 120" aria-hidden="true">
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function hexPoint(radius: number, index: number): string {
  const angle = ((index * 60 - 90) * Math.PI) / 180;
  return `${Math.round((CX + Math.cos(angle) * radius) * 100) / 100},${Math.round((CY + Math.sin(angle) * radius) * 100) / 100}`;
}

function HexCore() {
  return (
    <svg className="orb-mark orb-hex" viewBox="0 0 120 120" aria-hidden="true">
      <polygon points={[0, 1, 2, 3, 4, 5].map((index) => hexPoint(14, index)).join(" ")} />
      <polygon points={[0, 1, 2, 3, 4, 5].map((index) => hexPoint(9, index)).join(" ")} />
      <polygon points={[0, 1, 2, 3, 4, 5].map((index) => hexPoint(5, index)).join(" ")} />
    </svg>
  );
}

/** HUD rings shared by the WebGL orb and the flat fallback. */
export function OrbMark({ mode }: { mode: OrbMode }) {
  return (
    <>
      <span className="orb-bloom" />
      <span className="orb-scan" />
      {RINGS.map((ring) => (
        <svg key={ring.className} className={`orb-mark ${ring.className}`} viewBox="0 0 120 120" data-mode={mode} aria-hidden="true">
          {ring.arcs.map(([start, end]) => (
            <path key={`${ring.radius}-${start}`} d={arcPath(ring.radius, start, end)} />
          ))}
        </svg>
      ))}
      <TickRing />
      <DegreeMarks />
      <Spokes />
      <Brackets />
      <HexCore />
      <span className="orb-core" />
    </>
  );
}
