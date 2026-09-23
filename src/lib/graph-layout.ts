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
};

export type Frame = {
  x: number;
  y: number;
  w: number;
  h: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  const points: LayoutPoint[] = nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
    const ring = node.kind === "folder" ? link * 0.28 : link * (0.9 + (index % 4) * 0.12);
    return {
      id: node.id,
      x: cx + Math.cos(angle) * ring,
      y: cy + Math.sin(angle) * ring * 0.84,
    };
  });
  const index = new Map(points.map((point) => [point.id, point]));
  const steps = 96;

  for (let step = 0; step < steps; step += 1) {
    const cooling = 1 - step / steps;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];
        if (!a || !b) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.8) {
          dx = 0.8 + (i % 3) * 0.1;
          dy = 0.4 + (j % 3) * 0.1;
          dist = Math.hypot(dx, dy);
        }
        const push = (repel * repel) / dist;
        const scale = (push / dist) * 0.012 * (0.4 + cooling);
        a.x += dx * scale;
        a.y += dy * scale;
        b.x -= dx * scale;
        b.y -= dy * scale;
      }
    }

    for (const edge of edges) {
      const a = index.get(edge.from);
      const b = index.get(edge.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.8;
      const delta = (dist - link) * 0.045 * (0.45 + cooling);
      const ux = dx / dist;
      const uy = dy / dist;
      a.x += ux * delta;
      a.y += uy * delta;
      b.x -= ux * delta;
      b.y -= uy * delta;
    }

    for (const point of points) {
      point.x += (cx - point.x) * 0.01;
      point.y += (cy - point.y) * 0.01;
    }
  }

  const pad = 40;
  for (const point of points) {
    point.x = Math.min(width - pad, Math.max(pad, point.x));
    point.y = Math.min(height - pad, Math.max(pad, point.y));
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
