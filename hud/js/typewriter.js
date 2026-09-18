import { typeSpeed } from "./motion.js";

/**
 * Type `text` into `node`, one character at a time.
 *
 * Collapses to a single assignment when motion is reduced or when the boot
 * sequence has been cut, so Skip never leaves a half-typed line on screen.
 *
 * @param {HTMLElement | null} node
 * @param {string} text
 * @param {{ seq?: { wait: (ms: number) => Promise<void>, isCut: boolean }, charMs?: number, chunk?: number }} [opts]
 */
export async function typeInto(node, text, { seq, charMs = 16, chunk = 1 } = {}) {
  if (!node) return;
  const perChar = typeSpeed(charMs);
  if (!seq || seq.isCut || perChar <= 0) {
    node.textContent = text;
    return;
  }

  node.textContent = "";
  node.classList.add("is-typing");
  for (let i = chunk; i < text.length; i += chunk) {
    node.textContent = text.slice(0, i);
    await seq.wait(perChar);
    if (seq.isCut) break;
  }
  node.textContent = text;
  node.classList.remove("is-typing");
}

/**
 * Per-character speed that keeps delivery at a roughly constant ~1.9s no matter
 * how long the reply is, so a long answer doesn't crawl.
 */
export function deliverySpeed(length) {
  return Math.max(3, Math.min(16, Math.round(1900 / Math.max(length, 1))));
}
