"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";

import { orbModeIndex, type OrbMode } from "@/lib/orb-mode";
import type { OrbPose } from "@/lib/orb-rig";

const VERT = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uYaw;
uniform float uPitch;
uniform float uZoom;
uniform float uMode;
uniform float uLevel;
uniform float uFlash;
uniform float uReduced;
uniform float uParticleCount;

mat3 rotY(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}

mat3 rotX(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
}

vec3 shellPoint(float i) {
  float y = 1.0 - (2.0 * (i + 0.5) / 48.0);
  float ring = sqrt(max(0.0, 1.0 - y * y));
  float theta = 2.39996323 * i;
  return vec3(cos(theta) * ring, y, sin(theta) * ring);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / max(uResolution.y, 1.0);
  float zoom = max(uZoom, 0.35);
  float camDist = 2.85 / zoom;
  float radius = 0.8;
  float standby = step(uMode, 0.5);
  float listening = step(0.5, uMode) * step(uMode, 1.5);
  float speaking = step(1.5, uMode) * step(uMode, 2.5);
  float working = step(3.5, uMode);
  float motion = 1.0 - uReduced;
  radius += standby * motion * sin(uTime * 0.85) * 0.012;
  radius += listening * 0.035;
  float heard = clamp(uLevel, 0.0, 1.0);
  float envelope = 0.28 + 0.18 * sin(uTime * 7.5);
  float voice = speaking * (uReduced > 0.5 ? 0.55 : max(heard, envelope));
  radius += voice * 0.05;

  vec3 ro = vec3(0.0, 0.0, camDist);
  vec3 rd = normalize(vec3(p, -1.45));
  float b = dot(ro, rd);
  float c = dot(ro, ro) - radius * radius;
  float disc = b * b - c;
  vec3 color = vec3(0.0);
  vec3 cyan = vec3(0.286, 0.831, 1.0);

  if (disc > 0.0) {
    float t = -b - sqrt(disc);
    if (t > 0.0) {
      vec3 pos = ro + rd * t;
      vec3 n = normalize(pos);
      vec3 obj = normalize(rotY(-uYaw) * rotX(-uPitch) * pos);
      float facing = max(dot(n, -rd), 0.0);
      float fres = pow(1.0 - facing, listening > 0.5 ? 1.55 : 2.35);
      color = vec3(0.02, 0.1, 0.16) * (0.45 + facing * 1.05);
      color += cyan * fres * 0.95;
      color += vec3(0.82, 0.96, 1.0) * pow(facing, 7.0) * (0.28 + voice * 0.7 + standby * motion * 0.06 * (0.5 + 0.5 * sin(uTime * 0.9)));
      float lat = smoothstep(0.02, 0.0, abs(obj.y - 0.28)) + smoothstep(0.014, 0.0, abs(obj.y + 0.42));
      float mer = smoothstep(0.018, 0.0, abs(obj.x));
      color += cyan * (lat * 0.75 + mer * 0.28);
      float ang = atan(obj.z, obj.x);
      float sweep = uReduced > 0.5 ? 0.6 : uTime * 0.42;
      float wrapped = abs(mod(ang - sweep + 3.14159265, 6.2831853) - 3.14159265);
      float band = smoothstep(0.28, 0.0, wrapped) * smoothstep(0.09, 0.0, abs(obj.y));
      color += cyan * band * working;
      color += vec3(0.9, 0.98, 1.0) * uFlash * (0.35 + fres);
      color += cyan * voice * (0.18 + fres * 0.65);
    }
  } else {
    float halo = exp(max(disc, -3.5) * 2.4) * (0.34 + voice * 0.45 + uFlash * 0.25);
    color += cyan * halo;
  }

  if (uParticleCount > 0.5 && length(p) < 0.78) {
    mat3 spin = rotY(uYaw) * rotX(uPitch);
    for (int i = 0; i < 48; i++) {
      float fi = float(i);
      float alive = step(fi + 0.5, uParticleCount);
      vec3 world = spin * (shellPoint(fi) * (radius + 0.07));
      vec3 toCam = world - ro;
      float view = -1.45 / toCam.z;
      vec2 proj = toCam.xy * view;
      float spark = smoothstep(0.014, 0.0, length(p - proj)) * step(0.0, -toCam.z) * alive;
      color += cyan * spark * 0.85;
    }
  }

  color = clamp(color, 0.0, 1.0);
  float alpha = clamp(max(color.r, max(color.g, color.b)) * 1.2, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;

export function OrbCanvas({
  poseRef,
  mode,
  levelRef,
  onFail,
}: {
  poseRef: RefObject<OrbPose>;
  mode: OrbMode;
  levelRef: RefObject<number>;
  onFail: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  const failRef = useRef(onFail);
  modeRef.current = mode;
  failRef.current = onFail;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      failRef.current();
      return;
    }

    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const phoneQuery = window.matchMedia("(max-width: 800px)");
    let frame = 0;
    let dead = false;
    let renderer: Renderer | null = null;

    const fail = () => {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(frame);
      failRef.current();
    };

    try {
      const phone = phoneQuery.matches;
      const dpr = Math.min(phone ? 1 : 1.25, window.devicePixelRatio || 1);
      renderer = new Renderer({
        canvas,
        alpha: true,
        depth: false,
        antialias: !phone,
        dpr,
        webgl: 1,
      });
      const gl = renderer.gl;
      if (!gl) {
        fail();
        return;
      }
      gl.clearColor(0, 0, 0, 0);
      const program = new Program(gl, {
        vertex: VERT,
        fragment: FRAG,
        depthTest: false,
        transparent: true,
        cullFace: false,
        uniforms: {
          uResolution: { value: [1, 1] },
          uTime: { value: 0 },
          uYaw: { value: 0 },
          uPitch: { value: 0 },
          uZoom: { value: 1 },
          uMode: { value: 0 },
          uLevel: { value: 0 },
          uFlash: { value: 0 },
          uReduced: { value: 0 },
          uParticleCount: { value: 0 },
        },
      });
      if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
        fail();
        return;
      }
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

      const resize = () => {
        if (!renderer) return;
        const parent = canvas.parentElement;
        const width = Math.max(parent?.clientWidth || canvas.clientWidth || 1, 1);
        const height = Math.max(parent?.clientHeight || canvas.clientHeight || 1, 1);
        const nextDpr = Math.min(phoneQuery.matches ? 1 : 1.25, window.devicePixelRatio || 1);
        renderer.dpr = nextDpr;
        renderer.setSize(width, height);
        program.uniforms.uResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight];
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
          fail();
          return;
        }
        const pose = poseRef.current;
        const modeNow = modeRef.current;
        const modeId = orbModeIndex(modeNow);
        if (modeId !== lastMode) {
          if (modeNow === "ack") ackStart = now;
          lastMode = modeId;
        }
        const reduced = reducedQuery.matches;
        program.uniforms.uTime.value = reduced ? 0 : (now - started) / 1000;
        program.uniforms.uYaw.value = ((pose?.yaw ?? -18) * Math.PI) / 180;
        program.uniforms.uPitch.value = ((pose?.pitch ?? 14) * Math.PI) / 180;
        program.uniforms.uZoom.value = pose?.zoom ?? 1;
        program.uniforms.uMode.value = modeId;
        program.uniforms.uLevel.value = levelRef.current ?? 0;
        program.uniforms.uFlash.value = modeNow === "ack" ? Math.max(0, 1 - (now - ackStart) / 900) : 0;
        program.uniforms.uReduced.value = reduced ? 1 : 0;
        program.uniforms.uParticleCount.value = reduced ? 0 : phoneQuery.matches ? 16 : 48;
        renderer.render({ scene: mesh, frustumCull: false });
      };
      frame = requestAnimationFrame(tick);

      const onLost = (event: Event) => {
        event.preventDefault();
        fail();
      };
      canvas.addEventListener("webglcontextlost", onLost);

      return () => {
        dead = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        canvas.removeEventListener("webglcontextlost", onLost);
        const lose = gl.getExtension("WEBGL_lose_context");
        lose?.loseContext();
      };
    } catch {
      fail();
      return;
    }
  }, [levelRef, poseRef]);

  return <canvas ref={canvasRef} className="orb-canvas" aria-hidden="true" />;
}
