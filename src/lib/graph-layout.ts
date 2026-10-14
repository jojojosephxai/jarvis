export type LayoutNode = {
  id: string;
  kind: "note" | "folder";
  /** When set, the settled layout parks this note beside that hub. */
  anchorId?: string;
  /** Cluster this note is pulled toward. Folder nodes are their own hub. */
  hubId?: string;
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

function clusterId(node: LayoutNode, edges: LayoutEdge[], folderIds: Set<string>): string | undefined {
  if (node.kind === "folder") return node.id;
  if (node.hubId && folderIds.has(node.hubId)) return node.hubId;
  for (const edge of edges) {
    if (edge.from === node.id && folderIds.has(edge.to)) return edge.to;
    if (edge.to === node.id && folderIds.has(edge.from)) return edge.from;
  }
  return node.hubId;
}

function hashUnit(id: string, salt: number): number {
  let hash = 2166136261;
  const text = `${salt}:${id}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

/** Even grid. Same ids always land on the same cells. */
function gridHomes(ids: string[], width: number, height: number): { homes: Map<string, SpacePoint>; cell: number } {
  const sorted = [...ids].sort();
  const homes = new Map<string, SpacePoint>();
  const count = sorted.length;
  if (count === 0) return { homes, cell: Math.min(width, height) * 0.24 };
  const cols = count === 1 ? 1 : Math.max(1, Math.ceil(Math.sqrt(count * (width / Math.max(height, 1)))));
  const rows = Math.ceil(count / cols);
  const marginX = width * 0.08;
  const marginY = height * 0.1;
  const innerW = Math.max(width - marginX * 2, 1);
  const innerH = Math.max(height - marginY * 2, 1);
  const cell = Math.min(innerW / cols, innerH / rows);
  sorted.forEach((id, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const rowCount = Math.min(cols, count - row * cols);
    const rowOffset = ((cols - rowCount) * (innerW / cols)) / 2;
    homes.set(id, {
      x: marginX + rowOffset + (col + 0.5) * (innerW / cols),
      y: marginY + (row + 0.5) * (innerH / rows),
      z: (hashUnit(id, 4) - 0.5) * Math.min(40, cell * 0.18),
    });
  });
  return { homes, cell };
}

export function layoutGalaxy(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: GalaxyLayoutOptions,
): LayoutPoint[] {
  if (nodes.length === 0) return [];

  const width = options.width;
  const height = options.height;
  const repel = clamp(options.repel, 20, 400);
  const link = clamp(options.link, 24, 480);
  const folders = nodes.filter((node) => node.kind === "folder");
  const folderIds = new Set(folders.map((node) => node.id));
  const membership = new Map(nodes.map((node) => [node.id, clusterId(node, edges, folderIds)]));
  const touched = new Set<string>();
  for (const edge of edges) {
    touched.add(edge.from);
    touched.add(edge.to);
  }
  const anchorIds = new Set<string>();
  for (const node of nodes) {
    if (node.kind === "folder") continue;
    const home = membership.get(node.id);
    if (home && folderIds.has(home)) anchorIds.add(home);
  }
  for (const folder of folders) {
    if (!touched.has(folder.id)) anchorIds.add(folder.id);
  }
  if (anchorIds.size === 0) {
    for (const folder of folders) anchorIds.add(folder.id);
  }

  if (anchorIds.size === 0) {
    const free = placeLoose(nodes, repel, link, width, height);
    pinAnchors(free, nodes, 36, width, height);
    return free;
  }

  const { homes, cell } = gridHomes([...anchorIds], width, height);
  const placed = new Map<string, LayoutPoint>();
  for (const [id, home] of homes) {
    placed.set(id, { id, x: home.x, y: home.y, z: home.z });
  }

  const secondary = folders
    .filter((node) => !anchorIds.has(node.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const hub of secondary) {
    const hosts = new Map<string, number>();
    for (const edge of edges) {
      const other = edge.from === hub.id ? edge.to : edge.to === hub.id ? edge.from : "";
      if (!other) continue;
      const host = membership.get(other);
      if (!host || !homes.has(host)) continue;
      hosts.set(host, (hosts.get(host) ?? 0) + 1);
    }
    const hostId =
      [...hosts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? [...homes.keys()][0];
    const home = hostId ? homes.get(hostId) : undefined;
    if (!home) continue;
    const angle = hashAngle(hub.id);
    const radius = cell * 0.22;
    placed.set(hub.id, {
      id: hub.id,
      x: home.x + Math.cos(angle) * radius,
      y: home.y + Math.sin(angle) * radius * 0.86,
      z: home.z + 8,
    });
  }

  const grouped = new Map<string, LayoutNode[]>();
  for (const node of nodes) {
    if (node.kind === "folder") continue;
    const home = membership.get(node.id);
    const key = home && homes.has(home) ? home : [...homes.keys()][0];
    if (!key) continue;
    const list = grouped.get(key) ?? [];
    list.push(node);
    grouped.set(key, list);
  }
  for (const [homeId, members] of grouped) {
    const home = homes.get(homeId);
    if (!home) continue;
    const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
    sorted.forEach((node, index) => {
      const angle = index * Math.PI * (3 - Math.sqrt(5)) + hashAngle(node.id) * 0.15;
      const radius = cell * (0.16 + repel / 1600 + link / 4800) + index * cell * (0.012 + repel / 20000);
      const z = ((index % 5) - 2) * 14 + (hashUnit(node.id, 3) - 0.5) * 10;
      placed.set(node.id, {
        id: node.id,
        x: home.x + Math.cos(angle) * radius,
        y: home.y + Math.sin(angle) * radius * 0.84,
        z: home.z + z,
      });
    });
  }

  const pad = 36;
  const zLimit = Math.min(width, height) * 0.48;
  const points = nodes.map((node) => {
    const point = placed.get(node.id) ?? { id: node.id, x: width / 2, y: height / 2, z: 0 };
    point.x = Math.min(width - pad, Math.max(pad, point.x));
    point.y = Math.min(height - pad, Math.max(pad, point.y));
    point.z = clamp(point.z, -zLimit, zLimit);
    return point;
  });
  pinAnchors(points, nodes, pad, width, height);
  return points;
}

function placeLoose(nodes: LayoutNode[], repel: number, link: number, width: number, height: number): LayoutPoint[] {
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const gap = link * 0.55 + repel * 0.15;
  const span = gap * Math.max(sorted.length - 1, 1);
  const start = width / 2 - span / 2;
  const byId = new Map<string, LayoutPoint>();
  sorted.forEach((node, index) => {
    byId.set(node.id, {
      id: node.id,
      x: start + index * gap,
      y: height / 2 + ((index % 2) - 0.5) * gap * 0.12,
      z: (index - (sorted.length - 1) / 2) * 28,
    });
  });
  return nodes.map((node) => byId.get(node.id) ?? { id: node.id, x: width / 2, y: height / 2, z: 0 });
}

const SSOT_GAP = 48;

function hashAngle(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 33 + id.charCodeAt(index)) >>> 0;
  return ((hash % 360) * Math.PI) / 180;
}

/** Source-of-truth notes sit beside their hub, on the side that stays inside the frame. */
function pinAnchors(points: LayoutPoint[], nodes: LayoutNode[], pad: number, width: number, height: number) {
  const index = new Map(points.map((point) => [point.id, point]));
  for (const node of nodes) {
    if (!node.anchorId) continue;
    const hub = index.get(node.anchorId);
    const point = index.get(node.id);
    if (!hub || !point) continue;
    const angle = hashAngle(node.id);
    const dx = Math.cos(angle) * SSOT_GAP;
    const dy = Math.sin(angle) * SSOT_GAP;
    let x = hub.x + dx;
    let y = hub.y + dy;
    if (x < pad || x > width - pad || y < pad || y > height - pad) {
      x = hub.x - dx;
      y = hub.y - dy;
    }
    point.x = x;
    point.y = y;
    point.z = hub.z;
  }
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
  },
  zoom: number,
  showAll: boolean,
): boolean {
  if (showAll) return true;
  if (flags.hub || flags.ssot || flags.hover || flags.selected || flags.onPath || flags.neighbor || flags.match) return true;
  if (flags.depth < 0.4) return false;
  return zoom >= 1.2;
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
  const pad = 6;
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
    if (!parked.protected && hits) continue;
    const opacity = parked.protected ? 1 : parked.depth < 0.32 ? 0.45 : Math.min(1, 0.55 + parked.depth * 0.45);
    placed.push(parked);
    out.push({ id: parked.id, opacity, y: parked.y });
  }
  return out;
}

function nudgeLabel(label: LabelCandidate, placed: LabelCandidate[]): LabelCandidate {
  let y = label.y;
  for (let step = 0; step < 6; step += 1) {
    const trial = { ...label, y };
    if (!placed.some((other) => labelBoxesOverlap(trial, other))) return trial;
    y += label.h + 8;
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
