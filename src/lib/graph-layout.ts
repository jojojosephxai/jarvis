export type LayoutNode = {
  id: string;
  kind: "note" | "folder";
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
  if (nodes.length === 0) return [];

  const width = options.width;
  const height = options.height;
  const cx = width / 2;
  const cy = height / 2;
  const repel = clamp(options.repel, 20, 400);
  const link = clamp(options.link, 24, 480);
  const density = edges.length / Math.max(nodes.length, 1);
  const crowd = clamp(density / 4, 1, 2.4);
  const shellScale = 1.15 + Math.min(nodes.length, 28) * 0.012;
  const points: LayoutPoint[] = nodes.map((node, index) => {
    const shell = shellPoint(index, nodes.length);
    const radius =
      (node.kind === "folder" ? link * 0.12 : link * (0.92 + (index % 5) * 0.06)) * shellScale;
    return {
      id: node.id,
      x: cx + shell.x * radius,
      y: cy + shell.y * radius * 0.88,
      z: shell.z * radius,
    };
  });
  const index = new Map(points.map((point) => [point.id, point]));
  const kinds = new Map(nodes.map((node) => [node.id, node.kind]));
  const steps = 110;

  for (let step = 0; step < steps; step += 1) {
    const cooling = 1 - step / steps;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];
        if (!a || !b) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dz = a.z - b.z;
        let dist = Math.hypot(dx, dy, dz);
        if (dist < 0.8) {
          dx = 0.8 + (i % 3) * 0.1;
          dy = 0.4 + (j % 3) * 0.1;
          dz = 0.3;
          dist = Math.hypot(dx, dy, dz);
        }
        const push = (repel * repel * crowd) / dist;
        const scale = (push / dist) * 0.014 * (0.45 + cooling);
        a.x += dx * scale;
        a.y += dy * scale;
        a.z += dz * scale;
        b.x -= dx * scale;
        b.y -= dy * scale;
        b.z -= dz * scale;
      }
    }

    for (const edge of edges) {
      const a = index.get(edge.from);
      const b = index.get(edge.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dy, dz) || 0.8;
      const target = link * (0.85 + Math.min(crowd, 1.6) * 0.12);
      const delta = (dist - target) * 0.032 * (0.4 + cooling);
      const ux = dx / dist;
      const uy = dy / dist;
      const uz = dz / dist;
      a.x += ux * delta;
      a.y += uy * delta;
      a.z += uz * delta;
      b.x -= ux * delta;
      b.y -= uy * delta;
      b.z -= uz * delta;
    }

    for (const point of points) {
      const hold = kinds.get(point.id) === "folder" ? 0.028 : 0.006;
      point.x += (cx - point.x) * hold;
      point.y += (cy - point.y) * hold;
      point.z += (0 - point.z) * (kinds.get(point.id) === "folder" ? 0.022 : 0.003);
    }
  }

  const pad = 40;
  const zLimit = Math.min(width, height) * 0.48;
  for (const point of points) {
    point.x = Math.min(width - pad, Math.max(pad, point.x));
    point.y = Math.min(height - pad, Math.max(pad, point.y));
    point.z = clamp(point.z, -zLimit, zLimit);
  }
  return points;
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
};

export function labelRank(flags: {
  selected: boolean;
  hover: boolean;
  hub: boolean;
  onPath: boolean;
  neighbor: boolean;
  folder: boolean;
  match: boolean;
}): { priority: number; protected: boolean } {
  if (flags.selected) return { priority: 100, protected: true };
  if (flags.hover) return { priority: 90, protected: true };
  if (flags.hub) return { priority: 80, protected: true };
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
    onPath: boolean;
    neighbor: boolean;
    folder: boolean;
    match: boolean;
    depth: number;
  },
  zoom: number,
  showAll: boolean,
): boolean {
  if (flags.hub || flags.selected || flags.hover || flags.folder || flags.neighbor || flags.onPath || flags.match) {
    return true;
  }
  if (showAll) return true;
  return zoom >= 1.35 && flags.depth >= 0.42;
}

function labelBoxesOverlap(a: LabelCandidate, b: LabelCandidate): boolean {
  const pad = 6;
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad;
}

/**
 * Hubs, the hovered note, and the selected note are protected: a collision
 * never hides them. Other titles drop when they overlap a label already kept.
 */
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
    const hits = placed.some((other) => labelBoxesOverlap(label, other));
    if (!label.protected && hits) continue;
    if (!label.protected && label.depth < 0.32 && label.priority < 50) continue;
    const opacity = label.protected ? 1 : label.depth < 0.32 ? 0.45 : Math.min(1, 0.55 + label.depth * 0.45);
    placed.push(label);
    out.push({ id: label.id, opacity });
  }
  return out;
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
