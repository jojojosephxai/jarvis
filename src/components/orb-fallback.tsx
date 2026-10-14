"use client";

import { useEffect, useRef, type RefObject } from "react";

import { easeFrame } from "@/lib/graph-layout";
import type { OrbMode } from "@/lib/orb-mode";

const COUNT = 8000;

function shell(index: number, count: number): [number, number, number] {
  const y = 1 - (index / Math.max(count - 1, 1)) * 2;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  return [Math.cos(theta) * ring, y, Math.sin(theta) * ring];
}

function hash01(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

const POINTS = Array.from({ length: COUNT }, (_, index) => {
  const point = shell(index, COUNT);
  const seed = hash01(index);
  return {
    x: point[0],
    y: point[1],
    z: point[2],
    seed,
    radial: Math.pow(0.015 + seed * 0.985, 0.34),
  };
});

/** Dense particle sphere used only when WebGL cannot start. */
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
    let morph = 0;
    let morphFrom = 0;
    let morphTo = 0;
    let morphStart = 0;
    let smoothLevel = 0;
    let lastNow = started;

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
      const nextMorph = modeNow === "working" ? 1 : 0;
      if (nextMorph !== morphTo) {
        morphFrom = morph;
        morphTo = nextMorph;
        morphStart = now;
      }
      const span = reduced ? 1 : Math.min(1, (now - morphStart) / 600);
      morph = morphFrom + (morphTo - morphFrom) * easeFrame(span);
      const target = Math.max(0, Math.min(1, levelRef.current ?? 0));
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;
      smoothLevel += (target - smoothLevel) * Math.min(1, dt * 12);
      const listening = modeNow === "listening";
      const speaking = modeNow === "speaking";
      const breath = !reduced ? Math.sin(time * 1.04719755) * 0.01 * (1 - morph) : 0;
      const bright = !reduced ? 1 + Math.sin(time * 1.04719755) * 0.06 : 1;
      const voice = speaking ? smoothLevel : 0;
      const listen = listening ? smoothLevel : 0;
      const yaw = time * 0.16 * (reduced ? 0 : 1);
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const spin = time * 0.1 * (reduced ? 0 : 1);
      const scale = Math.min(width, height) * 0.4 * (1 + breath + voice * 0.05 + listen * 0.03);
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      for (const point of POINTS) {
        const theta = Math.atan2(point.y, point.x) + spin;
        const tube = (point.seed - 0.5) * 0.22;
        const sphereX = point.x * point.radial;
        const sphereY = point.y * point.radial;
        const sphereZ = point.z * point.radial;
        const spunX = sphereX * cy + sphereZ * sy;
        const spunZ = -sphereX * sy + sphereZ * cy;
        const donutX = Math.cos(theta) * (0.62 + tube);
        const donutY = Math.sin(theta) * (0.62 + tube);
        const donutZ = (point.radial - 0.5) * 0.18;
        const x1 = spunX + (donutX - spunX) * morph;
        const y0 = sphereY + (donutY - sphereY) * morph;
        const z1 = spunZ + (donutZ - spunZ) * morph;
        const pulse = speaking || listening ? 0.35 + (Math.sin(time * 7.4 + point.seed * 6.2831853) * 0.5 + 0.5) * 0.65 : 0;
        const core = Math.pow(1 - point.radial, 0.5);
        const facing = 0.5 + Math.max(0, z1) * 0.65;
        const x = width / 2 + x1 * scale;
        const y = height / 2 - y0 * scale;
        const radius = Math.max(0.7, (width / 240) * (0.65 + point.seed * 0.7) * (0.8 + facing) * (1 + core * 0.25) * (1 + voice * 0.4));
        const energy = bright * (0.42 + core * 0.9) * (0.55 + facing) * (1 + voice * 0.65 + listen * 0.4 + pulse * (voice + listen) * 0.3) * (1 - morph * 0.42);
        const alpha = Math.max(0.04, Math.min(0.42, 0.1 * energy));
        const hot = Math.round(40 + core * 160);
        context.fillStyle = `rgba(${hot}, ${Math.round(184 + core * 55)}, 255, ${alpha})`;
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
