import type { GalaxyLayoutOptions, LayoutEdge, LayoutNode, LayoutPoint } from "./graph-layout";

const SSOT_GAP = 12

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function shell(index: number, count: number): { x: number; y: number; z: number } {
  if (count <= 1) return { x: 0.2, y: 0.1, z: 0.4 };
  const y = 1 - (index / (count - 1)) * 2;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  return { x: Math.cos(theta) * ring, y: y * 0.72, z: Math.sin(theta) * ring };
}

type Body = {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  hub: boolean;
  home?: string;
};

/** Seeded 3D force layout. No node is pinned to the center. Same notes land in the same places. */
export function layoutForce(nodes: LayoutNode[], edges: LayoutEdge[], options: GalaxyLayoutOptions): LayoutPoint[] {
  if (nodes.length === 0) return [];
  const width = options.width;
  const height = options.height;
  const repel = clamp(options.repel, 20, 400);
  const link = clamp(options.link, 24, 480);
  const cx = width / 2;
  const cy = height / 2;
  const depth = Math.min(width, height) * 0.42;
  const folderIds = new Set(nodes.filter((node) => node.kind === "folder").map((node) => node.id));
  const homeOf = new Map<string, string | undefined>();
  for (const node of nodes) {
    if (node.kind === "folder") {
      homeOf.set(node.id, node.id);
      continue;
    }
    homeOf.set(node.id, node.hubId && folderIds.has(node.hubId) ? node.hubId : undefined);
  }

  const bodies = new Map<string, Body>();
  const hubIds = nodes
    .filter((node) => node.kind === "folder")
    .map((node) => node.id)
    .sort();
  const reach = Math.min(width, height) * (0.2 + repel / 780);
  hubIds.forEach((id, index) => {
    const point = shell(index, hubIds.length);
    const jitter = 0.86 + hashUnit(id, 4) * 0.28;
    const x = cx + point.x * reach * jitter;
    const y = cy + point.y * reach * jitter * 0.86;
    const z = point.z * reach * 0.72 * jitter;
    bodies.set(id, { id, x, y, z, vx: 0, vy: 0, vz: 0, hub: true });
  });

  const grouped = new Map<string, LayoutNode[]>();
  const loose: LayoutNode[] = [];
  for (const node of nodes) {
    if (node.kind === "folder") continue;
    const home = homeOf.get(node.id);
    if (!home || !bodies.has(home)) {
      loose.push(node);
      continue;
    }
    const list = grouped.get(home) ?? [];
    list.push(node);
    grouped.set(home, list);
  }
  for (const [homeId, members] of grouped) {
    const home = bodies.get(homeId);
    if (!home) continue;
    const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
    sorted.forEach((node, index) => {
      const point = shell(index, Math.max(sorted.length, 2));
      const radius = 16 + (index % 5) * 4;
      bodies.set(node.id, {
        id: node.id,
        x: home.x + point.x * radius,
        y: home.y + point.y * radius,
        z: home.z + point.z * 18,
        vx: 0,
        vy: 0,
        vz: 0,
        hub: false,
        home: homeId,
      });
    });
  }

  const free = [...loose].sort((a, b) => a.id.localeCompare(b.id));
  const parked = new Map<string, number>();
  for (const node of free) {
    let homeId = "";
    for (const edge of edges) {
      const other = edge.from === node.id ? edge.to : edge.to === node.id ? edge.from : "";
      if (!other) continue;
      if (folderIds.has(other) && bodies.has(other)) {
        homeId = other;
        break;
      }
      const via = homeOf.get(other);
      if (via && bodies.has(via)) {
        homeId = via;
        break;
      }
    }
    const home = homeId ? bodies.get(homeId) : undefined;
    if (!home) {
      const index = parked.get("*") ?? 0;
      parked.set("*", index + 1);
      const point = shell(index, Math.max(free.length, 2));
      const radius = Math.min(width, height) * 0.16 + link * 0.15;
      bodies.set(node.id, {
        id: node.id,
        x: cx + point.x * radius,
        y: cy + point.y * radius,
        z: point.z * 36,
        vx: 0,
        vy: 0,
        vz: 0,
        hub: false,
      });
      continue;
    }
    const index = parked.get(home.id) ?? 0;
    parked.set(home.id, index + 1);
    const point = shell(index + 1, 6);
    bodies.set(node.id, {
      id: node.id,
      x: home.x + point.x * 22,
      y: home.y + point.y * 22,
      z: home.z + point.z * 16,
      vx: 0,
      vy: 0,
      vz: 0,
      hub: false,
      home: home.id,
    });
    homeOf.set(node.id, home.id);
  }

  const list = [...bodies.values()];
  const springs = edges.filter((edge) => bodies.has(edge.from) && bodies.has(edge.to));
  const iterations = list.length > 220 ? 36 : 56;
  for (let step = 0; step < iterations; step += 1) {
    const cool = 1 - step / iterations;
    for (const body of list) {
      body.vx = 0;
      body.vy = 0;
      body.vz = 0;
    }
    const repelK = repel * (list.length > 80 ? 9 : 14) * cool;
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      if (!a) continue;
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (!b) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dz = a.z - b.z;
        let dist = Math.hypot(dx, dy, dz);
        if (dist < 8) {
          dist = 8;
          dx = dx || 1;
          dy = dy || 0.4;
          dz = dz || 0.2;
        }
        const same = Boolean(a.home && a.home === b.home);
        const bothHubs = a.hub && b.hub;
        const push = (repelK * (bothHubs ? 2.4 : same ? 0.12 : 0.45)) / (dist * dist);
        const ux = (dx / dist) * push;
        const uy = (dy / dist) * push;
        const uz = (dz / dist) * push;
        a.vx += ux;
        a.vy += uy;
        a.vz += uz;
        b.vx -= ux;
        b.vy -= uy;
        b.vz -= uz;
      }
    }
    const springK = 0.11 * cool;
    for (const edge of springs) {
      const a = bodies.get(edge.from);
      const b = bodies.get(edge.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.max(6, Math.hypot(dx, dy, dz));
      const homeA = a.hub ? a.id : a.home;
      const homeB = b.hub ? b.id : b.home;
      const cross = Boolean(homeA && homeB && homeA !== homeB);
      const same = Boolean(homeA && homeA === homeB);
      let rest = link * 0.55;
      let localK = springK;
      if (a.hub && b.hub) {
        rest = Math.max(link * 0.7, Math.min(width, height) * 0.16);
        localK = springK * 0.04;
      } else if (cross) {
        rest = link * 0.85;
        localK = springK * 0.03;
      } else if (same) {
        rest = Math.min(26, Math.max(12, link * 0.06));
      }
      const pull = (dist - rest) * localK;
      const ux = (dx / dist) * pull;
      const uy = (dy / dist) * pull;
      const uz = (dz / dist) * pull;
      a.vx += ux;
      a.vy += uy;
      a.vz += uz;
      b.vx -= ux;
      b.vy -= uy;
      b.vz -= uz;
    }
    for (const body of list) {
      if (body.home) {
        const home = bodies.get(body.home);
        if (home) {
          body.vx += (home.x - body.x) * 0.42 * cool;
          body.vy += (home.y - body.y) * 0.42 * cool;
          body.vz += (home.z - body.z) * 0.36 * cool;
        }
      }
      body.vx += (cx - body.x) * 0.004 * cool;
      body.vy += (cy - body.y) * 0.004 * cool;
      body.vz += -body.z * 0.002 * cool;
      const stepScale = body.hub ? 0.62 : 0.84;
      body.x += body.vx * stepScale;
      body.y += body.vy * stepScale;
      body.z += body.vz * stepScale;
    }
  }

  const clusterReach = 18 + repel / 28;
  let depthSlot = 0;
  for (const body of list) {
    if (!body.home) continue;
    const home = bodies.get(body.home);
    if (!home) continue;
    const dx = body.x - home.x;
    const dy = body.y - home.y;
    const dist = Math.hypot(dx, dy, body.z - home.z) || 1;
    const gap = Math.min(clusterReach - 2, 14 + repel / 50);
    const next = dist > clusterReach ? clusterReach : dist < gap ? gap : dist;
    body.x = home.x + (dx / dist) * next;
    body.y = home.y + (dy / dist) * next;
    body.z = home.z + ((depthSlot % 5) - 2) * 18;
    depthSlot += 1;
  }

  const points: LayoutPoint[] = nodes.map((node) => {
    const body = bodies.get(node.id);
    return {
      id: node.id,
      x: body ? body.x : cx,
      y: body ? body.y : cy,
      z: body ? body.z : 0,
    };
  });
  const index = new Map(points.map((point) => [point.id, point]));
  for (const node of nodes) {
    if (!node.anchorId) continue;
    const hub = index.get(node.anchorId);
    const point = index.get(node.id);
    if (!hub || !point) continue;
    const angle = hashUnit(node.id, 9) * Math.PI * 2;
    point.x = hub.x + Math.cos(angle) * SSOT_GAP;
    point.y = hub.y + Math.sin(angle) * SSOT_GAP;
    point.z = hub.z + 6;
  }
  const pad = 48;
  const reachLimit = Math.min(width, height) * 0.46;
  for (const point of points) {
    const dx = point.x - cx;
    const dy = point.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > reachLimit && dist > 0) {
      point.x = cx + (dx / dist) * reachLimit;
      point.y = cy + (dy / dist) * reachLimit;
    }
    point.x = Math.min(width - pad, Math.max(pad, point.x));
    point.y = Math.min(height - pad, Math.max(pad, point.y));
    point.z = clamp(point.z, -depth, depth);
  }
  return points;
}
