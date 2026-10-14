/** Share of the previous particle budget. A shell, not a solid ball. */
export const ORB_PARTICLE_KEEP = 0.22;

/**
 * Radius on the unit sphere. Most points sit in a thin outer band.
 * A few sit just inside that band. The center stays empty for the core.
 */
export function shellRadius(unit: number): number {
  const t = Math.min(1, Math.max(0, unit));
  if (t < 0.78) return 0.9 + (t / 0.78) * 0.1;
  return 0.68 + ((t - 0.78) / 0.22) * 0.2;
}

export function hash01(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function shellPoint(index: number, count: number): [number, number, number] {
  const y = 1 - (index / Math.max(count - 1, 1)) * 2;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  return [Math.cos(theta) * ring, y, Math.sin(theta) * ring];
}
