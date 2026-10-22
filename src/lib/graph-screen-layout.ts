export type ScreenRect = { left: number; top: number; right: number; bottom: number };
export type ScreenNode = {
  id: string; x: number; y: number; r: number; hubId?: string; priority: number;
};

export function labelSpots(x: number, y: number, r: number, w: number, h: number): ScreenRect[] {
  return [
    { x: x + r + 6, y: y - h / 2 },
    { x: x - r - 6 - w, y: y - h / 2 },
    { x: x - w / 2, y: y - r - h - 6 },
    { x: x - w / 2, y: y + r + 6 },
    { x: x + r + 6, y: y - h - 4 },
    { x: x - r - 6 - w, y: y - h - 4 },
  ].map((spot) => ({ left: spot.x, top: spot.y, right: spot.x + w, bottom: spot.y + h }));
}

export function rectsIntersect(a: ScreenRect, b: ScreenRect, gap = 0): boolean {
  return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
}

export function rectIntersectsCircle(rect: ScreenRect, node: Pick<ScreenNode, "x" | "y" | "r">, gap = 0): boolean {
  const x = Math.max(rect.left, Math.min(rect.right, node.x));
  const y = Math.max(rect.top, Math.min(rect.bottom, node.y));
  return Math.hypot(node.x - x, node.y - y) < node.r + gap;
}

/** Fit the projection as a whole; focus scales neighbors toward their hub without HUD obstacles. */
export function frameScreenNodes(nodes: ScreenNode[], free: ScreenRect, focusId: string | null, near: Set<string>): ScreenNode[] {
  if (!nodes.length) return [];
  const cx = (free.left + free.right) / 2;
  const cy = (free.top + free.bottom) / 2;
  const reach = Math.max(...nodes.map((node) => node.r * 1.6)) + 2;
  const minX = Math.min(...nodes.map((node) => node.x));
  const maxX = Math.max(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxY = Math.max(...nodes.map((node) => node.y));
  const scale = Math.min(1, (free.right - free.left - reach * 2) / Math.max(1, maxX - minX), (free.bottom - free.top - reach * 2) / Math.max(1, maxY - minY));
  const focus = nodes.find((node) => node.id === focusId);
  const members = focus ? nodes.filter((node) => near.has(node.id) && node.id !== focus.id) : [];
  const local = members.filter((node) => node.hubId === focusId);
  const distances = (local.length ? local : members).map((node) => Math.hypot(node.x - focus!.x, node.y - focus!.y));
  const radius = Math.min(free.right - free.left, free.bottom - free.top) * 0.32 - reach;
  const focusScale = radius / Math.max(1, ...distances);
  return nodes.map((node) => {
    if (focus && near.has(node.id)) {
      const dx = (node.x - focus.x) * focusScale;
      const dy = (node.y - focus.y) * focusScale;
      const distance = Math.hypot(dx, dy);
      const pull = Math.min(1, radius / Math.max(1, distance));
      return { ...node, x: cx + dx * pull, y: cy + dy * pull };
    }
    return { ...node, x: cx + (node.x - (minX + maxX) / 2) * scale, y: cy + (node.y - (minY + maxY) / 2) * scale };
  });
}
