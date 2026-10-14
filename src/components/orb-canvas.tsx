"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Geometry, Mesh, Program, Renderer, type OGLRenderingContext } from "ogl";

import { easeFrame } from "@/lib/graph-layout";
import { orbModeIndex, type OrbMode } from "@/lib/orb-mode";
import { hash01, ORB_PARTICLE_KEEP, shellPoint, shellRadius } from "@/lib/orb-shell";

/** About a fifth of the old filled sphere, so the shell can stay near 60fps. */
function particleBudget(): number {
  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 8;
  let count = dpr >= 1.75 ? 32000 : dpr >= 1.25 ? 42000 : 56000;
  if (cores <= 4) count = Math.round(count * 0.65);
  return Math.round(count * ORB_PARTICLE_KEEP);
}

const VERT = `
precision mediump float;
attribute vec3 position;
attribute float aSeed;
attribute float aRadial;
uniform vec2 uResolution;
uniform float uTime;
uniform float uMode;
uniform float uLevel;
uniform float uFlash;
uniform float uReduced;
uniform float uPoint;
uniform float uMorph;
varying float vBright;
void main() {
  float listening = step(0.5, uMode) * step(uMode, 1.5);
  float speaking = step(1.5, uMode) * step(uMode, 2.5);
  float level = clamp(uLevel, 0.0, 1.0);
  float motion = 1.0 - uReduced;
  float morph = clamp(uMorph, 0.0, 1.0);
  float breath = sin(uTime * 1.04719755) * 0.01 * motion * (1.0 - morph);
  float voice = speaking * level;
  float listen = listening * level;

  vec3 sphere = position * aRadial;
  float drift = uTime * 0.045 * motion * (1.0 - morph);
  float cy = cos(drift);
  float sy = sin(drift);
  sphere = vec3(sphere.x * cy + sphere.z * sy, sphere.y, -sphere.x * sy + sphere.z * cy);

  float theta = atan(position.y, position.x) + aSeed * 0.15;
  float tube = (aSeed - 0.5) * 0.03;
  float major = 0.76;
  vec3 ring = vec3(cos(theta) * (major + tube), sin(theta) * (major + tube), (aSeed - 0.5) * 0.018);
  vec3 p = mix(sphere, ring, morph);
  p *= 1.0 + breath + voice * 0.035 + listen * 0.02;

  float fit = 0.78;
  vec2 aspect = vec2(uResolution.y / max(uResolution.x, 1.0), 1.0);
  gl_Position = vec4(p.xy * fit * aspect, 0.0, 1.0);

  float facing = 0.55 + clamp(p.z, 0.0, 1.0) * 0.45;
  float shell = smoothstep(0.7, 0.96, aRadial);
  gl_PointSize = max(1.0, uPoint * (0.45 + aSeed * 0.35) * (0.85 + facing * 0.25) * (1.0 + voice * 0.15));
  float idleBright = 1.0 + sin(uTime * 1.04719755 + aSeed) * 0.06 * motion;
  float loud = 1.0 + voice * 0.45 + listen * 0.28 + uFlash * 0.35;
  vBright = loud * idleBright * (0.28 + shell * 0.72) * facing * mix(1.0, 0.85, morph);
}
`;

const FRAG = `
precision mediump float;
varying float vBright;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float glow = smoothstep(0.5, 0.05, d);
  vec3 cyan = vec3(0.286, 0.831, 1.0);
  float alpha = glow * 0.055 * clamp(vBright, 0.0, 1.15);
  gl_FragColor = vec4(cyan * alpha, alpha);
}
`;

function particleGeometry(gl: OGLRenderingContext, count: number): Geometry {
  const position = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const radial = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const point = shellPoint(index, count);
    position[index * 3] = point[0];
    position[index * 3 + 1] = point[1];
    position[index * 3 + 2] = point[2];
    const unit = hash01(index);
    seed[index] = unit;
    radial[index] = shellRadius(unit);
  }
  return new Geometry(gl, {
    position: { size: 3, data: position },
    aSeed: { size: 1, data: seed },
    aRadial: { size: 1, data: radial },
  });
}

function shaderLog(gl: OGLRenderingContext, shader: WebGLShader, label: string): string {
  const log = gl.getShaderInfoLog(shader) ?? "";
  return log.trim() ? `${label}: ${log.trim()}` : "";
}

export function OrbCanvas({
  mode,
  levelRef,
  onFail,
}: {
  mode: OrbMode;
  levelRef: RefObject<number>;
  onFail: (reason: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  const failRef = useRef(onFail);
  modeRef.current = mode;
  failRef.current = onFail;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      const reason = "Orb canvas was not in the document.";
      console.error(reason);
      failRef.current(reason);
      return;
    }

    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let dead = false;
    let renderer: Renderer | null = null;

    const fail = (reason: string) => {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(frame);
      console.error(reason);
      failRef.current(reason);
    };

    try {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      renderer = new Renderer({
        canvas,
        alpha: true,
        depth: false,
        stencil: false,
        antialias: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: "default",
        dpr,
        webgl: 2,
      });
      const gl = renderer.gl;
      if (!gl || gl.isContextLost()) {
        fail("WebGL context was missing or already lost after Renderer setup.");
        return;
      }
      gl.clearColor(0, 0, 0, 0);
      const program = new Program(gl, {
        vertex: VERT,
        fragment: FRAG,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        cullFace: false,
        uniforms: {
          uResolution: { value: [1, 1] },
          uTime: { value: 0 },
          uMode: { value: 0 },
          uLevel: { value: 0 },
          uFlash: { value: 0 },
          uReduced: { value: 0 },
          uPoint: { value: 1.6 },
          uMorph: { value: 0 },
        },
      });
      program.setBlendFunc(gl.ONE, gl.ONE);
      const linked = gl.getProgramParameter(program.program, gl.LINK_STATUS);
      if (!linked) {
        const vert = program.vertexShader ? shaderLog(gl, program.vertexShader, "vertex") : "";
        const frag = program.fragmentShader ? shaderLog(gl, program.fragmentShader, "fragment") : "";
        const link = (gl.getProgramInfoLog(program.program) ?? "").trim();
        fail(["Particle program did not link.", vert, frag, link].filter(Boolean).join(" "));
        return;
      }
      const mesh = new Mesh(gl, { geometry: particleGeometry(gl, particleBudget()), program, mode: gl.POINTS });

      const resize = () => {
        if (!renderer || dead) return;
        const parent = canvas.parentElement;
        const width = Math.max(parent?.clientWidth || canvas.clientWidth || 1, 1);
        const height = Math.max(parent?.clientHeight || canvas.clientHeight || 1, 1);
        const nextDpr = Math.min(1.5, window.devicePixelRatio || 1);
        renderer.dpr = nextDpr;
        renderer.setSize(width, height);
        program.uniforms.uResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight];
        const minSide = Math.min(gl.drawingBufferWidth, gl.drawingBufferHeight);
        program.uniforms.uPoint.value = Math.max(1.05, minSide / 150);
      };
      resize();
      const observer = new ResizeObserver(resize);
      if (canvas.parentElement) observer.observe(canvas.parentElement);

      let ackStart = 0;
      let lastMode = -1;
      let smoothLevel = 0;
      let morph = 0;
      let morphFrom = 0;
      let morphTo = 0;
      let morphStart = 0;
      let lastNow = performance.now();
      const started = performance.now();
      const tick = (now: number) => {
        if (dead || !renderer) return;
        frame = requestAnimationFrame(tick);
        if (gl.isContextLost()) {
          fail("WebGL context lost.");
          return;
        }
        const modeNow = modeRef.current;
        const modeId = orbModeIndex(modeNow);
        if (modeId !== lastMode) {
          if (modeNow === "ack") ackStart = now;
          const nextMorph = modeNow === "working" ? 1 : 0;
          if (nextMorph !== morphTo) {
            morphFrom = morph;
            morphTo = nextMorph;
            morphStart = now;
          }
          lastMode = modeId;
        }
        const reduced = reducedQuery.matches;
        const span = reduced ? 1 : Math.min(1, (now - morphStart) / 600);
        morph = morphFrom + (morphTo - morphFrom) * easeFrame(span);
        const target = levelRef.current ?? 0;
        const dt = Math.min(0.05, (now - lastNow) / 1000);
        lastNow = now;
        smoothLevel += (target - smoothLevel) * Math.min(1, dt * 12);
        if (Math.abs(target - smoothLevel) < 0.002) smoothLevel = target;
        program.uniforms.uTime.value = reduced ? 0 : (now - started) / 1000;
        program.uniforms.uMode.value = modeId;
        program.uniforms.uLevel.value = smoothLevel;
        program.uniforms.uFlash.value = modeNow === "ack" ? Math.max(0, 1 - (now - ackStart) / 300) : 0;
        program.uniforms.uReduced.value = reduced ? 1 : 0;
        program.uniforms.uMorph.value = morph;
        renderer.render({ scene: mesh });
      };
      frame = requestAnimationFrame(tick);

      const onLost = () => {
        fail("WebGL context lost.");
      };
      canvas.addEventListener("webglcontextlost", onLost);

      return () => {
        dead = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        canvas.removeEventListener("webglcontextlost", onLost);
      };
    } catch (error) {
      const reason = error instanceof Error ? error.stack ?? error.message : String(error);
      fail(`Orb renderer threw. ${reason}`);
    }
  }, [levelRef]);

  return <canvas ref={canvasRef} className="orb-canvas" aria-hidden="true" />;
}
