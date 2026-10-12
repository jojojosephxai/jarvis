"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Geometry, Mesh, Program, Renderer, type OGLRenderingContext } from "ogl";

import { orbModeIndex, type OrbMode } from "@/lib/orb-mode";

const PARTICLE_COUNT = 6400;

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
varying float vBright;
void main() {
  float standby = step(uMode, 0.5);
  float listening = step(0.5, uMode) * step(uMode, 1.5);
  float speaking = step(1.5, uMode) * step(uMode, 2.5);
  float level = clamp(uLevel, 0.0, 1.0);
  float motion = 1.0 - uReduced;
  float breath = sin(uTime * 1.04719755) * 0.01 * motion * standby;
  float wobble = fract(sin(aSeed * 91.7) * 43758.5453);
  float voice = speaking * level;
  float listen = listening * level;
  vec3 p = position * aRadial;
  p *= (1.0 + breath + voice * (wobble - 0.5) * 0.28 + listen * (0.05 + wobble * 0.08));
  float fit = 0.78;
  vec2 aspect = vec2(uResolution.y / max(uResolution.x, 1.0), 1.0);
  gl_Position = vec4(p.xy * fit * aspect, 0.0, 1.0);
  float facing = 0.72 + p.z * 0.38;
  gl_PointSize = max(1.0, uPoint * (0.65 + aSeed * 0.95) * facing * (1.0 + voice * 0.7 + listen * 0.28));
  float idleBright = 1.0 + sin(uTime * 1.04719755) * 0.06 * motion * standby;
  float loud = 0.62 + voice * 0.95 + listen * 0.5 + uFlash * 0.85;
  vBright = loud * idleBright * (0.42 + aRadial * 0.75) * facing;
}
`;

const FRAG = `
precision mediump float;
varying float vBright;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float glow = smoothstep(0.5, 0.04, d);
  float core = smoothstep(0.2, 0.0, d);
  vec3 cyan = vec3(0.286, 0.831, 1.0);
  vec3 hot = vec3(0.85, 0.96, 1.0);
  vec3 color = mix(cyan, hot, core) * vBright;
  float alpha = glow * (0.22 + core * 0.62) * clamp(vBright, 0.15, 1.35);
  gl_FragColor = vec4(color, alpha);
}
`;

function shellPoint(index: number, count: number): [number, number, number] {
  const y = 1 - (index / Math.max(count - 1, 1)) * 2;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  return [Math.cos(theta) * ring, y, Math.sin(theta) * ring];
}

function particleGeometry(gl: OGLRenderingContext): Geometry {
  const position = new Float32Array(PARTICLE_COUNT * 3);
  const seed = new Float32Array(PARTICLE_COUNT);
  const radial = new Float32Array(PARTICLE_COUNT);
  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const point = shellPoint(index, PARTICLE_COUNT);
    position[index * 3] = point[0];
    position[index * 3 + 1] = point[1];
    position[index * 3 + 2] = point[2];
    seed[index] = (index % 97) / 97;
    const unit = index / PARTICLE_COUNT;
    radial[index] = unit < 0.62 ? 0.9 + (index % 7) * 0.014 : 0.16 + ((index * 17) % 100) / 100 * 0.7;
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
        premultipliedAlpha: false,
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
          uPoint: { value: 2 },
        },
      });
      program.setBlendFunc(gl.SRC_ALPHA, gl.ONE);
      const linked = gl.getProgramParameter(program.program, gl.LINK_STATUS);
      if (!linked) {
        const vert = program.vertexShader ? shaderLog(gl, program.vertexShader, "vertex") : "";
        const frag = program.fragmentShader ? shaderLog(gl, program.fragmentShader, "fragment") : "";
        const link = (gl.getProgramInfoLog(program.program) ?? "").trim();
        fail(["Particle program did not link.", vert, frag, link].filter(Boolean).join(" "));
        return;
      }
      const mesh = new Mesh(gl, { geometry: particleGeometry(gl), program, mode: gl.POINTS });

      const resize = () => {
        if (!renderer || dead) return;
        const parent = canvas.parentElement;
        const width = Math.max(parent?.clientWidth || canvas.clientWidth || 1, 1);
        const height = Math.max(parent?.clientHeight || canvas.clientHeight || 1, 1);
        renderer.dpr = Math.min(1.5, window.devicePixelRatio || 1);
        renderer.setSize(width, height);
        program.uniforms.uResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight];
        program.uniforms.uPoint.value = Math.max(1.5, Math.min(width, height) / 78);
      };
      resize();
      const observer = new ResizeObserver(resize);
      if (canvas.parentElement) observer.observe(canvas.parentElement);

      let ackStart = 0;
      let lastMode = -1;
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
          lastMode = modeId;
        }
        const reduced = reducedQuery.matches;
        program.uniforms.uTime.value = reduced ? 0 : (now - started) / 1000;
        program.uniforms.uMode.value = modeId;
        program.uniforms.uLevel.value = levelRef.current ?? 0;
        program.uniforms.uFlash.value = modeNow === "ack" ? Math.max(0, 1 - (now - ackStart) / 300) : 0;
        program.uniforms.uReduced.value = reduced ? 1 : 0;
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
