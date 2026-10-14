"use client";

import { useEffect, useRef, type RefObject } from "react";

import { easeFrame } from "@/lib/graph-layout";
import type { OrbMode } from "@/lib/orb-mode";
import { hash01, ORB_PARTICLE_KEEP, shellPoint, shellRadius } from "@/lib/orb-shell";

const COUNT = Math.round(8000 * ORB_PARTICLE_KEEP);

const POINTS = Array.from({ length: COUNT }, (_, index) => {
  const point = shellPoint(index, COUNT);
  const seed = hash01(index);
  return {
    x: point[0],
    y: point[1],
    z: point[2],
    seed,
    radial: shellRadius(seed),
  };
});

/** Same thin shell as the WebGL orb, used only when WebGL cannot start. */
export function OrbFallback({ mode, levelRef }: { mode: OrbMode; levelRef: RefObject<number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  });

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
      const voice = speaking ? smoothLevel : 0;
      const listen = listening ? smoothLevel : 0;
      const yaw = time * 0.045 * (reduced ? 0 : 1) * (1 - morph);
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const scale = Math.min(width, height) * 0.36 * (1 + breath + voice * 0.035 + listen * 0.02);
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      for (const point of POINTS) {
        const theta = Math.atan2(point.y, point.x) + point.seed * 0.15;
        const tube = (point.seed - 0.5) * 0.03;
        const sphereX = point.x * point.radial;
        const sphereY = point.y * point.radial;
        const sphereZ = point.z * point.radial;
        const spunX = sphereX * cy + sphereZ * sy;
        const spunZ = -sphereX * sy + sphereZ * cy;
        const ringX = Math.cos(theta) * (0.76 + tube);
        const ringY = Math.sin(theta) * (0.76 + tube);
        const ringZ = (point.seed - 0.5) * 0.018;
        const x1 = spunX + (ringX - spunX) * morph;
        const y0 = sphereY + (ringY - sphereY) * morph;
        const z1 = spunZ + (ringZ - spunZ) * morph;
        const shell = point.radial > 0.9 ? 1 : 0.45;
        const facing = 0.55 + Math.max(0, z1) * 0.45;
        const x = width / 2 + x1 * scale;
        const y = height / 2 - y0 * scale;
        const radius = Math.max(0.4, (width / 420) * (0.55 + point.seed * 0.4) * facing);
        const alpha = Math.max(0.02, Math.min(0.16, 0.045 * shell * facing * (1 + voice * 0.4 + listen * 0.25)));
        context.fillStyle = `rgba(73, 212, 255, ${alpha.toFixed(3)})`;
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
