import type { GalaxyLayoutOptions, LayoutEdge, LayoutNode, LayoutPoint } from "./graph-layout";

const SSOT_GAP = 26;

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

function hashAngle(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 33 + id.charCodeAt(index)) >>> 0;
  return ((hash % 360) * Math.PI) / 180;
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
  root: boolean;
  home?: string;
  ox: number;
  oy: number;
  oz: number;
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function orderHubs(ids: string[], edges: LayoutEdge[], homeOf: Map<string, string | undefined>): string[] {
  const sorted = [...ids].sort();
  if (sorted.length <= 2) return sorted;
  const weight = new Map<string, number>();
  for (const edge of edges) {
    const left = homeOf.get(edge.from) ?? (ids.includes(edge.from) ? edge.from : undefined);
    const right = homeOf.get(edge.to) ?? (ids.includes(edge.to) ? edge.to : undefined);
    if (!left || !right || left === right) continue;
    const key = pairKey(left, right);
    weight.set(key, (weight.get(key) ?? 0) + 1);
  }
  const remaining = new Set(sorted);
  const first = sorted[0];
  if (!first) return [];
  const order = [first];
  remaining.delete(first);
  while (remaining.size > 0) {
    const prev = order[order.length - 1] ?? first;
    let best = "";
    let bestWeight = -1;
    for (const id of [...remaining].sort()) {
      const nextWeight = weight.get(pairKey(prev, id)) ?? 0;
      if (nextWeight > bestWeight || (nextWeight === bestWeight && (best === "" || id < best))) {
        bestWeight = nextWeight;
        best = id;
      }
    }
    if (!best) break;
    order.push(best);
    remaining.delete(best);
  }
  return order;
}

/** Seeded 3D force layout. Same notes land in the same places. It runs to rest and stops. */
export function layoutForce(nodes: LayoutNode[], edges: LayoutEdge[], options: GalaxyLayoutOptions): LayoutPoint[] {
  if (nodes.length === 0) return [];
  const width = options.width;
  const height = options.height;
  const repel = clamp(options.repel, 20, 400);
  const link = clamp(options.link, 24, 480);
  const cx = width / 2;
  const cy = height / 2;
  const depth = Math.min(width, height) * 0.62;
  const folderIds = new Set(nodes.filter((node) => node.kind === "folder").map((node) => node.id));
  const root = nodes.find((node) => node.root);
  const homeOf = new Map<string, string | undefined>();
  for (const node of nodes) {
    if (node.kind === "folder") {
      homeOf.set(node.id, node.id);
      continue;
    }
    const home =
      node.hubId && (folderIds.has(node.hubId) || node.hubId === root?.id) ? node.hubId : undefined;
    homeOf.set(node.id, home);
  }

  const bodies = new Map<string, Body>();
  if (root) {
    bodies.set(root.id, {
      id: root.id,
      x: cx,
      y: cy,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      hub: true,
      root: true,
      ox: cx,
      oy: cy,
      oz: 0,
    });
  }
  const hubIds = nodes.filter((node) => node.kind === "folder").map((node) => node.id);
  const ordered = orderHubs(hubIds, edges, homeOf);
  const hubScale = 0.62;
  const hubRadiusX = (width * 0.5 - 72) * (0.72 + repel / 900) * hubScale;
  const hubRadiusY = (height * 0.5 - 64) * (0.78 + repel / 900) * hubScale;
  ordered.forEach((id, index) => {
    const count = Math.max(ordered.length, 1);
    const jitter = (hashUnit(id, 2) - 0.5) * ((Math.PI * 2) / count) * 0.32;
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2 + jitter;
    const reach = 0.74 + hashUnit(id, 4) * 0.26;
    const x = cx + Math.cos(angle) * hubRadiusX * reach;
    const y = cy + Math.sin(angle) * hubRadiusY * reach;
    const z = (hashUnit(id, 6) - 0.5) * 110;
    bodies.set(id, {
      id,
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      hub: true,
      root: false,
      ox: x,
      oy: y,
      oz: z,
    });
  });

  const grouped = new Map<string, LayoutNode[]>();
  const loose: LayoutNode[] = [];
  for (const node of nodes) {
    if (node.kind === "folder" || node.root) continue;
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
      const angle = index * Math.PI * (3 - Math.sqrt(5)) + hashAngle(node.id) * 0.2;
      const radius = Math.min(34, 8 + index * 1.35);
      const z = home.z + (hashUnit(node.id, 3) - 0.5) * 16;
      bodies.set(node.id, {
        id: node.id,
        x: home.x + Math.cos(angle) * radius,
        y: home.y + Math.sin(angle) * radius * 0.86,
        z,
        vx: 0,
        vy: 0,
        vz: 0,
        hub: false,
        root: false,
        home: homeId,
        ox: home.x + Math.cos(angle) * radius,
        oy: home.y + Math.sin(angle) * radius * 0.86,
        oz: z,
      });
    });
  }
  const free = [...loose].sort((a, b) => a.id.localeCompare(b.id));
  const parked = new Map<string, number>();
  free.forEach((node) => {
    let homeId = "";
    for (const edge of edges) {
      const other = edge.from === node.id ? edge.to : edge.to === node.id ? edge.from : "";
      if (!other) continue;
      if (bodies.has(other) && (folderIds.has(other) || other === root?.id)) {
        homeId = other;
        break;
      }
      const via = homeOf.get(other);
      if (via && bodies.has(via)) {
        homeId = via;
        break;
      }
    }
    if (!homeId) homeId = root?.id ?? ordered[0] ?? "";
    const home = homeId ? bodies.get(homeId) : undefined;
    if (!home || !homeId) {
      const index = parked.get("*") ?? 0;
      parked.set("*", index + 1);
      const angle = hashAngle(node.id) + index * 0.7;
      const radius = 48 + index * 20;
      const z = (hashUnit(node.id, 8) - 0.5) * 24;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius * 0.86;
      bodies.set(node.id, {
        id: node.id,
        x,
        y,
        z,
        vx: 0,
        vy: 0,
        vz: 0,
        hub: false,
        root: false,
        ox: x,
        oy: y,
        oz: z,
      });
      return;
    }
    const index = parked.get(homeId) ?? 0;
    parked.set(homeId, index + 1);
    const angle = index * Math.PI * (3 - Math.sqrt(5)) + hashAngle(node.id) * 0.2;
    const radius = Math.min(42, 34 + index * 1.4);
    const z = home.z + (hashUnit(node.id, 8) - 0.5) * 18;
    const x = home.x + Math.cos(angle) * radius;
    const y = home.y + Math.sin(angle) * radius * 0.86;
    bodies.set(node.id, {
      id: node.id,
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      hub: false,
      root: false,
      home: homeId,
      ox: x,
      oy: y,
      oz: z,
    });
  });

  const list = [...bodies.values()];
  const iterations = list.length > 180 ? 48 : 72;
  const springs = edges.filter((edge) => bodies.has(edge.from) && bodies.has(edge.to));
  for (let step = 0; step < iterations; step += 1) {
    const cool = 1 - step / iterations;
    for (const body of list) {
      body.vx = 0;
      body.vy = 0;
      body.vz = 0;
    }
    const repelK = repel * 22 * cool;
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      if (!a) continue;
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (!b) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dz = a.z - b.z;
        let dist = Math.hypot(dx, dy, dz);
        if (dist < 12) {
          dist = 12;
          dx = dx || 1;
          dy = dy || 0.25;
        }
        const sameHome = Boolean(a.home && a.home === b.home);
        const push = (repelK * (a.hub && b.hub ? 1.4 : sameHome ? 0.16 : 0.55)) / (dist * dist);
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
    const springK = 0.09 * cool;
    for (const edge of springs) {
      const a = bodies.get(edge.from);
      const b = bodies.get(edge.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.max(8, Math.hypot(dx, dy, dz));
      const homeA = a.hub ? a.id : a.home;
      const homeB = b.hub ? b.id : b.home;
      const cross = Boolean(homeA && homeB && homeA !== homeB);
      const same = Boolean(a.home && a.home === b.home);
      let rest = link * 0.62;
      let localK = springK;
      if (a.root || b.root) {
        rest = Math.max(96, Math.min(width, height) * 0.18);
        localK = springK * 0.04;
      } else if (a.hub && b.hub) {
        rest = Math.max(56, Math.min(width, height) * 0.12);
      } else if (cross) {
        rest = Math.max(72, Math.min(width, height) * 0.14);
        localK = springK * 0.06;
      } else if (same || a.hub || b.hub) {
        rest = Math.min(28, Math.max(12, link * 0.08));
      }
      const pull = (dist - rest) * localK;
      const ux = (dx / dist) * pull;
      const uy = (dy / dist) * pull;
      const uz = (dz / dist) * pull;
      a.vx += ux;
      a.vy += uy;
      a.vz += uz * 0.35;
      b.vx -= ux;
      b.vy -= uy;
      b.vz -= uz * 0.35;
    }
    for (const body of list) {
      if (body.root) {
        body.x = body.ox;
        body.y = body.oy;
        body.z = body.oz;
        body.vx = 0;
        body.vy = 0;
        body.vz = 0;
        continue;
      }
      if (body.hub) {
        body.vx += (body.ox - body.x) * 0.62 * cool;
        body.vy += (body.oy - body.y) * 0.62 * cool;
        body.vz += (body.oz - body.z) * 0.62 * cool;
      }
      if (body.home) {
        const home = bodies.get(body.home);
        if (home) {
          body.vx += (home.x - body.x) * 0.34 * cool;
          body.vy += (home.y - body.y) * 0.34 * cool;
          body.vz += (home.z - body.z) * 0.28 * cool;
        }
      } else if (!body.hub) {
        body.vx += (cx - body.x) * 0.0015 * cool;
        body.vy += (cy - body.y) * 0.0015 * cool;
      }
      const stepScale = body.hub ? 0.55 : 0.85;
      body.x += body.vx * stepScale;
      body.y += body.vy * stepScale;
      body.z += body.vz * stepScale;
    }
  }

  const clusterReach = 44;
  for (const body of list) {
    if (!body.home) continue;
    const home = bodies.get(body.home);
    if (!home) continue;
    const dx = body.x - home.x;
    const dy = body.y - home.y;
    const dist = Math.hypot(dx, dy);
    const clusterGap = Math.min(clusterReach - 4, 28 + repel / 40);
    if (dist > clusterReach) {
      body.x = home.x + (dx / dist) * clusterReach;
      body.y = home.y + (dy / dist) * clusterReach;
    } else if (dist < clusterGap) {
      const angle = dist === 0 ? hashAngle(body.id) : Math.atan2(dy, dx);
      body.x = home.x + Math.cos(angle) * clusterGap;
      body.y = home.y + Math.sin(angle) * clusterGap;
    }
    const dz = body.z - home.z;
    if (Math.abs(dz) > 28) body.z = home.z + Math.sign(dz) * 28;
  }

  const pad = 36;
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
    const angle = hashAngle(node.id);
    point.x = hub.x + Math.cos(angle) * SSOT_GAP;
    point.y = hub.y + Math.sin(angle) * SSOT_GAP * 0.86;
    point.z = hub.z;
  }
  const zLimit = depth;
  const reachLimit = Math.min(width, height) * 0.44;
  for (const point of points) {
    if (root && point.id === root.id) {
      point.z = clamp(point.z, -zLimit, zLimit);
      continue;
    }
    const dx = point.x - cx;
    const dy = point.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > reachLimit && dist > 0) {
      point.x = cx + (dx / dist) * reachLimit;
      point.y = cy + (dy / dist) * reachLimit;
    }
    point.x = Math.min(width - pad, Math.max(pad, point.x));
    point.y = Math.min(height - pad, Math.max(pad, point.y));
    point.z = clamp(point.z, -zLimit, zLimit);
  }
  return points;
}
