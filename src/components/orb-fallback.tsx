"use client";

import { useEffect, useRef, type RefObject } from "react";

import type { OrbMode } from "@/lib/orb-mode";

const COUNT = 900;

function shell(index: number, count: number): [number, number, number] {
  const y = 1 - (index / Math.max(count - 1, 1)) * 2;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  return [Math.cos(theta) * ring, y, Math.sin(theta) * ring];
}

const POINTS = Array.from({ length: COUNT }, (_, index) => {
  const point = shell(index, COUNT);
  const unit = index / COUNT;
  const radial = unit < 0.62 ? 0.9 + (index % 7) * 0.014 : 0.2 + ((index * 17) % 100) / 100 * 0.7;
  return { x: point[0], y: point[1], z: point[2], seed: (index % 97) / 97, radial };
});

/** Flat particle sphere used only when WebGL cannot start. No spin. */
export function OrbFallback({ mode, levelRef }: { mode: OrbMode; levelRef: RefObject<number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let dead = false;
    const started = performance.now();

    const resize = () => {
      const parent = canvas.parentElement;
      const width = Math.max(parent?.clientWidth || 1, 1);
      const height = Math.max(parent?.clientHeight || 1, 1);
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const draw = (now: number) => {
      if (dead) return;
      frame = requestAnimationFrame(draw);
      const width = canvas.width;
      const height = canvas.height;
      const modeNow = modeRef.current;
      const reduced = reducedQuery.matches;
      const time = reduced ? 0 : (now - started) / 1000;
      const level = Math.max(0, Math.min(1, levelRef.current ?? 0));
      const standby = modeNow === "standby" || modeNow === "working" || modeNow === "ack";
      const listening = modeNow === "listening";
      const speaking = modeNow === "speaking";
      const breath = standby && !reduced ? Math.sin(time * 1.04719755) * 0.01 : 0;
      const bright = standby && !reduced ? 1 + Math.sin(time * 1.04719755) * 0.06 : 1;
      const voice = speaking ? level : 0;
      const listen = listening ? level : 0;
      const scale = (Math.min(width, height) * 0.36) * (1 + breath + voice * 0.08 + listen * 0.04);
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      for (const point of POINTS) {
        const wobble = point.seed;
        const displace = 1 + voice * (wobble - 0.5) * 0.28 + listen * (0.05 + wobble * 0.08);
        const x = width / 2 + point.x * point.radial * scale * displace;
        const y = height / 2 - point.y * point.radial * scale * displace;
        const facing = 0.55 + point.z * 0.45;
        const radius = Math.max(0.6, (width / 420) * (0.7 + point.seed) * facing * (1 + voice * 0.5));
        const alpha = Math.max(0.05, Math.min(0.85, (0.18 + point.radial * 0.35) * facing * bright * (0.7 + voice * 0.8 + listen * 0.35)));
        context.fillStyle = `rgba(73, 212, 255, ${alpha})`;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalCompositeOperation = "source-over";
    };
    frame = requestAnimationFrame(draw);
    return () => {
      dead = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [levelRef]);

  return <canvas ref={canvasRef} className="orb-canvas" aria-hidden="true" />;
}
