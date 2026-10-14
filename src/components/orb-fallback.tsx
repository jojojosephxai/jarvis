"use client";

import { useEffect, useRef, type RefObject } from "react";

import { easeFrame } from "@/lib/graph-layout";
import type { OrbMode } from "@/lib/orb-mode";

/** Flat stand-in used only when WebGL cannot start. The HUD rings sit on top of this glow. */
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
      const scale = Math.min(width, height) * 0.34 * (1 + breath + voice * 0.04 + listen * 0.025);
      const centerX = width / 2;
      const centerY = height / 2;
      context.clearRect(0, 0, width, height);
      const glow = context.createRadialGradient(centerX, centerY, scale * 0.05, centerX, centerY, scale);
      glow.addColorStop(0, `rgba(186, 236, 255, ${0.35 + voice * 0.25 + listen * 0.15})`);
      glow.addColorStop(0.35, "rgba(73, 212, 255, 0.12)");
      glow.addColorStop(1, "rgba(73, 212, 255, 0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(centerX, centerY, scale, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = `rgba(73, 212, 255, ${(0.25 + morph * 0.55).toFixed(3)})`;
      context.lineWidth = Math.max(1, scale * (0.015 + morph * 0.02));
      context.beginPath();
      context.arc(centerX, centerY, scale * (0.72 + morph * 0.04), 0, Math.PI * 2);
      context.stroke();
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
