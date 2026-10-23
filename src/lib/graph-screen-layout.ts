export type ScreenRect = { left: number; top: number; right: number; bottom: number };
export type ScreenNode = {
  id: string; x: number; y: number; r: number; hubId?: string; priority: number; anchorId?: string;
};

export function labelSpots(x: number, y: number, r: number, w: number, h: number): ScreenRect[] {
  return [6, 18, 28, 34].flatMap((gap) => [
    { x: x + r + gap, y: y - h / 2 },
    { x: x - r - gap - w, y: y - h / 2 },
    { x: x - w / 2, y: y - r - h - gap },
    { x: x - w / 2, y: y + r + gap },
    { x: x + r + gap, y: y - h - 4 },
    { x: x - r - gap - w, y: y - h - 4 },
    { x: x + r + gap, y: y + 4 },
    { x: x - r - gap - w, y: y + 4 },
    { x: x - w, y: y - r - h - gap },
    { x, y: y - r - h - gap },
    { x: x - w, y: y + r + gap },
    { x, y: y + r + gap },
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
