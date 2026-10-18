import { layoutForce } from "./graph-force";

export type LayoutNode = {
  id: string;
  kind: "note" | "folder";
  /** When set, the settled layout parks this note beside that hub. */
  anchorId?: string;
  /** Cluster this note is pulled toward. Folder nodes are their own hub. */
  hubId?: string;
  /** The single center note. Hubs are seeded around it. */
  root?: boolean;
};

export type LayoutEdge = {
  from: string;
  to: string;
};

export type GalaxyLayoutOptions = {
  repel: number;
  link: number;
  width: number;
  height: number;
};

export type LayoutPoint = {
  id: string;
  x: number;
  y: number;
  z: number;
};

export type Frame = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Pan = {
  x: number;
  y: number;
};

export type Camera = {
  yaw: number;
  pitch: number;
};

export type SpacePoint = {
  x: number;
  y: number;
  z: number;
};

export type ProjectedPoint = {
  x: number;
  y: number;
  depth: number;
  scale: number;
};

const CAMERA_DISTANCE = 4.4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shellPoint(index: number, count: number): SpacePoint {
  if (count <= 1) return { x: 0, y: 0, z: 0 };
  const y = 1 - (index / (count - 1)) * 2;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  return { x: Math.cos(theta) * ring, y, z: Math.sin(theta) * ring };
}

export function layoutGalaxy(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: GalaxyLayoutOptions,
): LayoutPoint[] {
  return layoutForce(nodes, edges, options);
}

export function frameAroundPoints(points: { x: number; y: number }[], padX: number, padY: number): Frame {
  if (points.length === 0) return { x: 0, y: 0, w: 1000, h: 640 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    x: minX - padX,
    y: minY - padY,
    w: Math.max(120, maxX - minX + padX * 2),
    h: Math.max(90, maxY - minY + padY * 2),
  };
}

export function frameAroundPoint(point: { x: number; y: number }, width: number, height: number): Frame {
  return {
    x: point.x - width / 2,
    y: point.y - height / 2,
    w: width,
    h: height,
  };
}

export function shiftFrame(frame: Frame, pan: Pan): Frame {
  return {
    x: frame.x - pan.x,
    y: frame.y - pan.y,
    w: frame.w,
    h: frame.h,
  };
}

export function grabDelta(
  movementX: number,
  movementY: number,
  frame: Frame,
  viewWidth: number,
  viewHeight: number,
): Pan {
  const width = Math.max(viewWidth, 1);
  const height = Math.max(viewHeight, 1);
  const scale = Math.min(width / Math.max(frame.w, 1), height / Math.max(frame.h, 1));
  const safe = scale === 0 ? 1 : scale;
  return {
    x: movementX / safe,
    y: movementY / safe,
  };
}

export function meanDistance(points: LayoutPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  let count = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      if (!a || !b) continue;
      total += Math.hypot(a.x - b.x, a.y - b.y);
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

export function cageRadius(width: number, height: number): number {
  return Math.min(width, height) * 0.4;
}

export function cageFrame(width: number, height: number): Frame {
  const reach = cageRadius(width, height) * 1.42;
  const cx = width / 2;
  const cy = height / 2;
  return {
    x: cx - reach,
    y: cy - reach * 0.86,
    w: reach * 2,
    h: reach * 1.72,
  };
}

export const REST_YAW = 0.72;
export const REST_PITCH = 0.52;

/** Fixed graph camera. User drag adds spin on top. Time does not move it. */
export function restCamera(): Camera {
  return { yaw: REST_YAW, pitch: REST_PITCH };
}

export type LabelCandidate = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  priority: number;
  protected: boolean;
};

export type PlacedLabel = {
  id: string;
  opacity: number;
  x: number;
  y: number;
};

export function labelRank(flags: {
  selected: boolean;
  hover: boolean;
  hub: boolean;
  ssot?: boolean;
  onPath: boolean;
  neighbor: boolean;
  folder: boolean;
  match: boolean;
}): { priority: number; protected: boolean } {
  if (flags.selected) return { priority: 100, protected: true };
  if (flags.hover) return { priority: 90, protected: true };
  if (flags.hub) return { priority: 80, protected: true };
  if (flags.ssot) return { priority: 75, protected: true };
  if (flags.onPath) return { priority: 60, protected: false };
  if (flags.neighbor) return { priority: 55, protected: false };
  if (flags.folder) return { priority: 50, protected: false };
  if (flags.match) return { priority: 40, protected: false };
  return { priority: 10, protected: false };
}

export function labelEligible(
  flags: {
    selected: boolean;
    hover: boolean;
    hub: boolean;
    ssot?: boolean;
    onPath: boolean;
    neighbor: boolean;
    folder: boolean;
    match: boolean;
    depth: number;
    big?: boolean;
  },
  zoom: number,
  showAll: boolean,
): boolean {
  void showAll;
  if (flags.hub || flags.big || flags.hover || flags.selected || flags.onPath) return true;
  return zoom >= 1.6;
}

/** CSS cubic-bezier(.22, 1, .36, 1) sampled over 0–1. Focus, zoom, and re-form use this. */
export function easeFrame(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return cubicBezierY(t, 0.22, 1, 0.36, 1);
}

function cubicBezierY(t: number, x1: number, y1: number, x2: number, y2: number): number {
  let u = t;
  for (let step = 0; step < 8; step += 1) {
    const x = bezierSample(u, x1, x2) - t;
    const slope = bezierSlope(u, x1, x2);
    if (Math.abs(slope) < 1e-6) break;
    u = Math.min(1, Math.max(0, u - x / slope));
  }
  return bezierSample(u, y1, y2);
}

function bezierSample(u: number, p1: number, p2: number): number {
  const c = 1 - u;
  return 3 * c * c * u * p1 + 3 * c * u * u * p2 + u * u * u;
}

function bezierSlope(u: number, p1: number, p2: number): number {
  const c = 1 - u;
  return 3 * c * c * p1 + 6 * c * u * (p2 - p1) + 3 * u * u * (1 - p2);
}

function labelBoxesOverlap(a: LabelCandidate, b: LabelCandidate): boolean {
  const pad = 10;
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad;
}

export function pickLabels(candidates: LabelCandidate[]): PlacedLabel[] {
  const ordered = [...candidates].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  const placed: LabelCandidate[] = [];
  const out: PlacedLabel[] = [];
  for (const label of ordered) {
    const parked = label.protected ? nudgeLabel(label, placed) : label;
    const hits = placed.some((other) => labelBoxesOverlap(parked, other));
    if (hits && label.priority < 100) continue;
    const opacity = parked.protected ? 1 : Math.max(0.86, Math.min(1, 0.86 + parked.depth * 0.14));
    placed.push(parked);
    out.push({ id: parked.id, opacity, x: parked.x, y: parked.y });
  }
  return out;
}

function nudgeLabel(label: LabelCandidate, placed: LabelCandidate[]): LabelCandidate {
  const shifts: Array<[number, number]> = [
    [0, 0],
    [0, 36],
    [0, -36],
    [0, 54],
    [0, -54],
    [Math.round(label.w * 0.7), 28],
    [-Math.round(label.w * 0.7), 28],
    [Math.round(label.w), 0],
    [-Math.round(label.w), 0],
  ];
  for (const [dx, dy] of shifts) {
    const trial = { ...label, x: label.x + dx, y: label.y + dy };
    if (!placed.some((other) => labelBoxesOverlap(trial, other))) return trial;
  }
  return label;
}

export function projectSpace(
  point: SpacePoint,
  camera: Camera,
  origin: SpacePoint,
  unit: number,
): ProjectedPoint {
  const safeUnit = unit === 0 ? 1 : unit;
  const x = (point.x - origin.x) / safeUnit;
  const y = (point.y - origin.y) / safeUnit;
  const z = (point.z - origin.z) / safeUnit;
  const cosY = Math.cos(camera.yaw);
  const sinY = Math.sin(camera.yaw);
  const x1 = x * cosY + z * sinY;
  const z1 = -x * sinY + z * cosY;
  const cosP = Math.cos(camera.pitch);
  const sinP = Math.sin(camera.pitch);
  const y2 = y * cosP - z1 * sinP;
  const z2 = y * sinP + z1 * cosP;
  const denom = CAMERA_DISTANCE - z2;
  const scale = CAMERA_DISTANCE / (Math.abs(denom) < 0.05 ? (denom < 0 ? -0.05 : 0.05) : denom);
  return {
    x: origin.x + x1 * scale * safeUnit,
    y: origin.y + y2 * scale * safeUnit * 0.92,
    depth: clamp(0.5 + z2 * 0.62, 0.05, 1),
    scale,
  };
}

export function layoutOrigin(width: number, height: number): SpacePoint {
  return { x: width / 2, y: height / 2, z: 0 };
}

export function cageRings(): SpacePoint[][] {
  const rings: SpacePoint[][] = [];
  const latitudes = [-0.35, 0.28];
  for (const y of latitudes) {
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const ring: SpacePoint[] = [];
    for (let step = 0; step <= 36; step += 1) {
      const angle = (step / 36) * Math.PI * 2;
      ring.push({ x: Math.cos(angle) * ringRadius, y, z: Math.sin(angle) * ringRadius });
    }
    rings.push(ring);
  }
  for (let meridian = 0; meridian < 3; meridian += 1) {
    const angle = (meridian / 3) * Math.PI;
    const ring: SpacePoint[] = [];
    for (let step = 0; step <= 36; step += 1) {
      const theta = (step / 36) * Math.PI * 2;
      ring.push({
        x: Math.cos(angle) * Math.cos(theta),
        y: Math.sin(theta),
        z: Math.sin(angle) * Math.cos(theta),
      });
    }
    rings.push(ring);
  }
  return rings;
}

export function starField(): SpacePoint[] {
  const stars: SpacePoint[] = [];
  const count = 32;
  for (let index = 0; index < count; index += 1) {
    const shell = shellPoint(index, count);
    const distance = 1.28 + (index % 4) * 0.12;
    stars.push({ x: shell.x * distance, y: shell.y * distance, z: shell.z * distance });
  }
  return stars;
}

export function projectUnit(point: SpacePoint, camera: Camera, width: number, height: number): ProjectedPoint {
  const unit = cageRadius(width, height);
  const origin = layoutOrigin(width, height);
  return projectSpace(
    { x: origin.x + point.x * unit, y: origin.y + point.y * unit, z: point.z * unit },
    camera,
    origin,
    unit,
  );
}
