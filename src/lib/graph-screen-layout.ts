export type ScreenRect = { left: number; top: number; right: number; bottom: number };
export type ScreenNode = {
  id: string; x: number; y: number; r: number; hubId?: string; priority: number;
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

/** Pack overview clusters into separate cells, then fit one coordinate system to the viewport. */
export function frameScreenNodes(nodes: ScreenNode[], free: ScreenRect, focusId: string | null, near: Set<string>, edges: { from: string; to: string }[] = []): ScreenNode[] {
  if (!nodes.length) return [];
  let placed = focusId ? nodes.filter((node) => near.has(node.id)) : nodes;
  if (!placed.length) return [];
  const width = free.right - free.left;
  const height = free.bottom - free.top;
  const focus = placed.find((node) => node.id === focusId);
  if (focus) {
    const members = placed.filter((node) => node !== focus).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    const golden = Math.PI * (3 - Math.sqrt(5));
    placed = [{ ...focus, x: 0, y: -1.4 }, ...members.map((node, index) => {
      const radius = Math.sqrt((index + 3) / (members.length + 2));
      return { ...node, x: Math.cos(index * golden) * radius, y: Math.sin(index * golden) * radius };
    })];
  }
  const hubs = focusId ? [] : nodes.filter((node) => node.hubId === node.id).sort((a, b) => a.id.localeCompare(b.id));
  if (hubs.length) {
    const columns = Math.max(1, Math.round(Math.sqrt(hubs.length * width / height)));
    const rows = Math.ceil(hubs.length / columns);
    const cellW = width / columns, cellH = height / rows;
    const groups = new Map(hubs.map((hub) => [hub.id, [] as ScreenNode[]]));
    for (const node of nodes) {
      const home = groups.has(node.hubId ?? "") ? node.hubId! : [...hubs].sort((a, b) => Math.hypot(a.x - node.x, a.y - node.y) - Math.hypot(b.x - node.x, b.y - node.y))[0].id;
      groups.get(home)!.push(node);
    }
    placed = hubs.flatMap((hub, index) => {
      const members = groups.get(hub.id)!;
      const reach = Math.max(...members.map((node) => node.r * 1.6));
      const radius = Math.min(cellW, cellH) * .32 - reach;
      const scale = radius / Math.max(1, ...members.map((node) => Math.hypot(node.x - hub.x, node.y - hub.y)));
      const x = free.left + (index % columns + .5) * cellW;
      const y = free.top + (Math.floor(index / columns) + .5) * cellH;
      // Put the hub above its members so its title has clear space beside the node.
      return members.map((node) => ({ ...node, hubId: hub.id, x: x + (node.x - hub.x) * scale, y: node.id === hub.id ? y - radius - hub.r * 2 : y + (node.y - hub.y) * scale }));
    });
  }
  const reach = Math.max(...placed.map((node) => node.r * 1.6)) + 20;
  const minX = Math.min(...placed.map((node) => node.x)), maxX = Math.max(...placed.map((node) => node.x));
  const minY = Math.min(...placed.map((node) => node.y)), maxY = Math.max(...placed.map((node) => node.y));
  let scale = Math.min((width - reach * 2) / Math.max(1, maxX - minX), (height - reach * 2) / Math.max(1, maxY - minY));
  if (focusId) {
    const byId = new Map(placed.map((node) => [node.id, node]));
    const longest = Math.max(1, ...edges.map((edge) => {
      const a = byId.get(edge.from), b = byId.get(edge.to);
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    }));
    scale = Math.min(scale, Math.min(width, height) * .34 / longest);
  }
  return placed.map((node) => ({ ...node, x: (free.left + free.right) / 2 + (node.x - (minX + maxX) / 2) * scale, y: (free.top + free.bottom) / 2 + (node.y - (minY + maxY) / 2) * scale }));
}
