/**
 * Motion preference helper.
 *
 * Joseph's rule is that the HUD still says everything it would normally say when
 * motion is reduced — same boot log, same audit, same spoken line — it just stops
 * flying things around the screen.
 */
const QUERY =
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

export function prefersReducedMotion() {
  return Boolean(QUERY?.matches);
}

/**
 * Cinematic duration in ms, collapsed to a token pause when motion is reduced.
 * Never returns 0 so the sequence still resolves in order rather than all at once.
 * @param {number} ms full-motion duration
 * @param {number} [reduced] duration to use when motion is reduced
 */
export function beat(ms, reduced = 40) {
  return prefersReducedMotion() ? reduced : ms;
}

/** Per-character typing speed; 0 means "paint the whole string at once". */
export function typeSpeed(ms) {
  return prefersReducedMotion() ? 0 : ms;
}

export function onMotionPreferenceChange(fn) {
  QUERY?.addEventListener?.("change", fn);
}
