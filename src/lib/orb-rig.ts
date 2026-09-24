export const ORB_YAW_START = -18;
export const ORB_PITCH_START = 14;
export const ORB_ZOOM_START = 1;
export const ORB_ZOOM_MIN = 0.55;
export const ORB_ZOOM_MAX = 2.15;
export const ORB_PITCH_MIN = -68;
export const ORB_PITCH_MAX = 68;
export const ORB_DRAG_DEG = 0.42;

export type OrbPose = {
  yaw: number;
  pitch: number;
  zoom: number;
};

export function restPose(): OrbPose {
  return { yaw: ORB_YAW_START, pitch: ORB_PITCH_START, zoom: ORB_ZOOM_START };
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ORB_ZOOM_START;
  return Math.min(ORB_ZOOM_MAX, Math.max(ORB_ZOOM_MIN, zoom));
}

export function clampPitch(pitch: number): number {
  if (!Number.isFinite(pitch)) return ORB_PITCH_START;
  return Math.min(ORB_PITCH_MAX, Math.max(ORB_PITCH_MIN, pitch));
}

export function dragOrbit(pose: OrbPose, dx: number, dy: number): OrbPose {
  const yaw = Number.isFinite(dx) ? pose.yaw + dx * ORB_DRAG_DEG : pose.yaw;
  const pitch = Number.isFinite(dy) ? clampPitch(pose.pitch - dy * ORB_DRAG_DEG) : pose.pitch;
  return { yaw, pitch, zoom: pose.zoom };
}

export function wheelZoom(zoom: number, deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return clampZoom(zoom);
  const factor = deltaY > 0 ? 0.92 : 1.08;
  return clampZoom(zoom * factor);
}

export function pinchZoom(zoom: number, startDistance: number, distance: number): number {
  if (!(startDistance > 0) || !Number.isFinite(distance) || distance <= 0) return clampZoom(zoom);
  return clampZoom(zoom * (distance / startDistance));
}

export function stepZoom(zoom: number, direction: "in" | "out"): number {
  switch (direction) {
    case "in":
      return clampZoom(zoom * 1.16);
    case "out":
      return clampZoom(zoom / 1.16);
    default: {
      const neverDirection: never = direction;
      return neverDirection;
    }
  }
}

export function poseTransform(pose: OrbPose): string {
  const zoom = clampZoom(pose.zoom);
  const pitch = clampPitch(pose.pitch);
  const yaw = Number.isFinite(pose.yaw) ? pose.yaw : ORB_YAW_START;
  return `rotateX(${pitch.toFixed(2)}deg) rotateY(${yaw.toFixed(2)}deg) scale(${zoom.toFixed(3)})`;
}

export function zoomLabel(zoom: number): string {
  return `${clampZoom(zoom).toFixed(1)}×`;
}
