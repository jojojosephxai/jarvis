export type ScreenRect = { left: number; top: number; right: number; bottom: number };
export type ScreenNode = {
  id: string; x: number; y: number; r: number; hubId?: string; priority: number; anchorId?: string;
};

export function labelSpots(x: number, y: number, r: number, w: number, h: number): ScreenRect[] {
  return [6, 18, 28].flatMap((gap) => [
    { x: x + r + gap, y: y - h / 2 },
    { x: x - r - gap - w, y: y - h / 2 },
    { x: x - w / 2, y: y - r - h - gap },
    { x: x - w / 2, y: y + r + gap },
    { x: x + r + gap, y: y - h - 4 },
    { x: x - r - gap - w, y: y - h - 4 },
    { x: x + r + gap, y: y + 4 },
    { x: x - r - gap - w, y: y + 4 },
  ].map((spot) => ({ left: spot.x, top: spot.y, right: spot.x + w, bottom: spot.y + h })));
}

export function rectsIntersect(a: ScreenRect, b: ScreenRect, gap = 0): boolean {
  return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
}

export function rectIntersectsCircle(rect: ScreenRect, node: Pick<ScreenNode, "x" | "y" | "r">, gap = 0): boolean {
  const x = Math.max(rect.left, Math.min(rect.right, node.x));
  const y = Math.max(rect.top, Math.min(rect.bottom, node.y));
  return Math.hypot(node.x - x, node.y - y) < node.r + gap;
}

/** Keep screen-space clusters proportional to their populations, with a stable organic stagger. */
export function frameScreenNodes(nodes: ScreenNode[], free: ScreenRect, focusId: string | null, near: Set<string>, edges: { from: string; to: string }[] = []): ScreenNode[] {
  if (!nodes.length) return [];
  const width = free.right - free.left, height = free.bottom - free.top;
  if (focusId && near.has(focusId)) {
    const overview = frameScreenNodes(nodes, free, null, new Set());
    const members = nodes.filter((node) => near.has(node.id) && node.id !== focusId).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    const focus = nodes.find((node) => node.id === focusId)!;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const active = [{ ...focus, x: 0, y: 0 }, ...members.map((node, index) => {
      const radius = Math.sqrt(.35 + .65 * (index + 1) / Math.max(1, members.length));
      const angle = .55 + (index * golden) % (Math.PI * 2 - 1.1);
      return { ...node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    })];
    const byId = new Map(active.map((node) => [node.id, node]));
    const longest = Math.max(1, ...edges.filter((edge) => edge.from === focusId || edge.to === focusId).map((edge) => {
      const a = byId.get(edge.from), b = byId.get(edge.to);
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    }));
    const scale = Math.max(1, Math.min(width, height) * .335 - 4) / longest;
    for (const node of active) byId.set(node.id, { ...node, x: (free.left + free.right) / 2 + node.x * scale, y: (free.top + free.bottom) / 2 + node.y * scale });
    return overview.map((node) => byId.get(node.id) ?? node);
  }
  let placed = nodes;
  const hubs = nodes.filter((node) => node.hubId === node.id).sort((a, b) => a.id.localeCompare(b.id));
  if (hubs.length) {
    const groups = new Map(hubs.map((hub) => [hub.id, [] as ScreenNode[]]));
    for (const node of nodes) {
      const home = groups.has(node.hubId ?? "") ? node.hubId! : [...hubs].sort((a, b) => Math.hypot(a.x - node.x, a.y - node.y) - Math.hypot(b.x - node.x, b.y - node.y))[0].id;
      groups.get(home)!.push(node);
    }
    const cells = new Map<string, ScreenRect>();
    const split = (items: ScreenNode[], rect: ScreenRect) => {
      if (items.length === 1) { cells.set(items[0].id, rect); return; }
      const weight = (hub: ScreenNode) => groups.get(hub.id)!.length + 8;
      const total = items.reduce((sum, hub) => sum + weight(hub), 0);
      let count = 1, first = weight(items[0]);
      while (count < items.length - 1 && first + weight(items[count]) / 2 < total / 2) first += weight(items[count++]);
      if (rect.right - rect.left > rect.bottom - rect.top) {
        const x = rect.left + (rect.right - rect.left) * first / total;
        split(items.slice(0, count), { ...rect, right: x });
        split(items.slice(count), { ...rect, left: x });
      } else {
        const y = rect.top + (rect.bottom - rect.top) * first / total;
        split(items.slice(0, count), { ...rect, bottom: y });
        split(items.slice(count), { ...rect, top: y });
      }
    };
    split(hubs, free);
    placed = hubs.flatMap((hub, index) => {
      const members = groups.get(hub.id)!, cell = cells.get(hub.id)!;
      const cellW = cell.right - cell.left, cellH = cell.bottom - cell.top;
      const radiusX = Math.max(6, cellW * .38 - hub.r);
      const radiusY = Math.max(6, cellH * .34 - hub.r);
      const x = (cell.left + cell.right) / 2 + Math.sin(index * 2.4) * cellW * .05;
      const y = (cell.top + cell.bottom) / 2 + Math.cos(index * 1.7) * cellH * .08;
      const notes = members.filter(node => node.id !== hub.id).sort((a, b) => a.id.localeCompare(b.id));
      const golden = Math.PI * (3 - Math.sqrt(5));
      const phase = notes.length ? Math.atan2(notes[0].y - hub.y, notes[0].x - hub.x) : 0;
      const hubY = y - radiusY - hub.r;
      return [{ ...hub, x, y: hubY }, ...notes.map((node, i) => {
        if (node.anchorId === hub.id) return { ...node, x: x + hub.r + node.r + 8, y: hubY + hub.r + node.r + 8 };
        const radius = Math.sqrt((i + .5) / notes.length);
        return { ...node, hubId: hub.id, x: x + Math.cos(i * golden + phase) * radiusX * radius, y: y + Math.sin(i * golden + phase) * radiusY * radius };
      })];
    });
  }
  const reach = Math.max(...placed.map((node) => node.r * 1.6)) + 12;
  const minX = Math.min(...placed.map((node) => node.x)), maxX = Math.max(...placed.map((node) => node.x));
  const minY = Math.min(...placed.map((node) => node.y)), maxY = Math.max(...placed.map((node) => node.y));
  const scaleX = (width - reach * 2) / Math.max(1, maxX - minX);
  const scaleY = (height - reach * 2) / Math.max(1, maxY - minY);
  return placed.map((node) => ({ ...node, x: (free.left + free.right) / 2 + (node.x - (minX + maxX) / 2) * scaleX, y: (free.top + free.bottom) / 2 + (node.y - (minY + maxY) / 2) * scaleY }));
}

/** Clip a screen-space edge around label boxes, preserving its visible connection on either side. */
export function edgePieces(a: { x: number; y: number }, b: { x: number; y: number }, boxes: ScreenRect[]): [number, number][] {
  let pieces: [number, number][] = [[0, 1]];
  for (const box of boxes) {
    let start = 0, end = 1;
    for (const [origin, delta, min, max] of [[a.x, b.x - a.x, box.left - 3, box.right + 3], [a.y, b.y - a.y, box.top - 3, box.bottom + 3]]) {
      if (Math.abs(delta) < 1e-8) { if (origin < min || origin > max) end = -1; }
      else {
        const t1 = (min - origin) / delta, t2 = (max - origin) / delta;
        start = Math.max(start, Math.min(t1, t2)); end = Math.min(end, Math.max(t1, t2));
      }
    }
    if (start >= end) continue;
    pieces = pieces.flatMap(([lo, hi]) => end <= lo || start >= hi ? [[lo, hi] as [number, number]] : [
      ...(start > lo ? [[lo, start] as [number, number]] : []), ...(end < hi ? [[end, hi] as [number, number]] : []),
    ]);
  }
  return pieces;
}
