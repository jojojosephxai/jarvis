export type ScreenRect = { left: number; top: number; right: number; bottom: number };
export type ScreenNode = {
  id: string; x: number; y: number; r: number; hubId?: string; priority: number;
  label?: { w: number; h: number };
  labelRect?: ScreenRect;
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

/** Resolve projected forces against the actual desktop HUD before rendering. Hubs move first;
 * their members follow that displacement, preserving clusters around the central keep-out. */
export function fitScreenNodes(nodes: ScreenNode[], free: ScreenRect, blocks: ScreenRect[]): ScreenNode[] {
  const placed: ScreenNode[] = [];
  const shifts = new Map<string, { x: number; y: number }>();
  const ordered = [...nodes].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const node of ordered) {
    const shift = node.hubId ? shifts.get(node.hubId) : undefined;
    const desiredX = node.x + (shift?.x ?? 0);
    const desiredY = node.y + (shift?.y ?? 0);
    // Reserve room for the glow and selected ring as well as the sphere itself.
    const reach = node.r * 1.6;
    const clampX = (x: number) => Math.max(free.left + reach, Math.min(free.right - reach, x));
    const clampY = (y: number) => Math.max(free.top + reach, Math.min(free.bottom - reach, y));
    const clear = (x: number, y: number) => {
      const box = { left: x - reach, top: y - reach, right: x + reach, bottom: y + reach };
      return !blocks.some((block) => rectsIntersect(box, block, 16)) &&
        !placed.some((other) => Math.hypot(x - other.x, y - other.y) < node.r + other.r + 8 ||
          (other.labelRect && rectIntersectsCircle(other.labelRect, { x, y, r: node.r }, 4)));
    };
    const labelAt = (x: number, y: number) => node.label && labelSpots(x, y, node.r, node.label.w, node.label.h).find((rect) =>
      rect.left >= free.left && rect.right <= free.right && rect.top >= free.top && rect.bottom <= free.bottom &&
      !blocks.some((block) => rectsIntersect(rect, block, 8)) &&
      !placed.some((other) => rectIntersectsCircle(rect, other, 4) || (other.labelRect && rectsIntersect(rect, other.labelRect, 6))));
    const candidate = (x: number, y: number) => {
      if (!clear(x, y)) return null;
      const labelRect = labelAt(x, y);
      return !node.label || labelRect ? { x, y, labelRect } : null;
    };
    const x = clampX(desiredX);
    const y = clampY(desiredY);
    let spot: { x: number; y: number; labelRect?: ScreenRect } | null = candidate(x, y);
    // Nearest legal point wins. Search in screen pixels so margin does not depend on zoom/depth.
    for (let radius = 8; !spot && radius <= Math.hypot(free.right - free.left, free.bottom - free.top); radius += 8) {
      const count = Math.max(12, Math.ceil(Math.PI * 2 * radius / 12));
      for (let index = 0; index < count; index += 1) {
        const angle = index / count * Math.PI * 2;
        const px = clampX(x + Math.cos(angle) * radius);
        const py = clampY(y + Math.sin(angle) * radius);
        spot = candidate(px, py);
        if (spot) break;
      }
    }
    // Dense vaults may exhaust node spacing; HUD and viewport constraints still take precedence.
    if (!spot) {
      for (let py = free.top + reach; py <= free.bottom - reach && !spot; py += 4) {
        for (let px = free.left + reach; px <= free.right - reach; px += 4) {
          const box = { left: px - reach, top: py - reach, right: px + reach, bottom: py + reach };
          if (!blocks.some((block) => rectsIntersect(box, block, 16))) { spot = { x: px, y: py }; break; }
        }
      }
    }
    const result = { ...node, ...(spot ?? { x, y }) };
    placed.push(result);
    if (!node.hubId) shifts.set(node.id, { x: result.x - node.x, y: result.y - node.y });
  }
  return placed;
}
