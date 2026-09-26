import type { Camera, Frame } from "./graph-layout";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function spinCamera(camera: Camera, deltaX: number, deltaY: number): Camera {
  return {
    yaw: camera.yaw + deltaX * 0.0052,
    pitch: clamp(camera.pitch - deltaY * 0.0042, -1.15, 1.15),
  };
}

export function nextZoom(current: number, wheelDeltaY: number): number {
  if (wheelDeltaY === 0) return clamp(current, 0.55, 3.4);
  const factor = wheelDeltaY > 0 ? 0.9 : 1.1;
  return clamp(current * factor, 0.55, 3.4);
}

export function frameAtZoom(frame: Frame, zoom: number): Frame {
  const safe = zoom > 0 ? zoom : 1;
  const width = frame.w / safe;
  const height = frame.h / safe;
  const centerX = frame.x + frame.w / 2;
  const centerY = frame.y + frame.h / 2;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    w: width,
    h: height,
  };
}

export function turnedCamera(base: Camera, spin: Camera): Camera {
  return {
    yaw: base.yaw + spin.yaw,
    pitch: clamp(base.pitch + spin.pitch, -1.15, 1.15),
  };
}
