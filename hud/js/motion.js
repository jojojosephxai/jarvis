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

/** Speed multipliers from jarvis.settings.json — higher is faster. */
const speed = { boot: 1, text: 1 };

export function setSpeeds({ boot, text }) {
  if (Number.isFinite(boot) && boot > 0) speed.boot = boot;
  if (Number.isFinite(text) && text > 0) speed.text = text;
}

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
  return prefersReducedMotion() ? reduced : Math.round(ms / speed.boot);
}

/** Per-character typing speed; 0 means "paint the whole string at once". */
export function typeSpeed(ms) {
  if (prefersReducedMotion()) return 0;
  return Math.max(1, Math.round(ms / speed.text));
}
