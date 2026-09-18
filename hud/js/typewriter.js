import { typeSpeed } from "./motion.js";

/**
 * Type `text` into `node` in small chunks.
 *
 * Collapses to a single assignment when motion is reduced or when the boot
 * sequence has been cut, so Skip never leaves a half-typed line on screen.
 *
 * @param {HTMLElement | null} node
 * @param {string} text
 * @param {{ seq?: { wait: (ms: number) => Promise<void>, isCut: boolean }, charMs?: number, chunk?: number }} [opts]
 */
export async function typeInto(node, text, { seq, charMs = 16, chunk } = {}) {
  if (!node) return;
  const perChar = typeSpeed(charMs);
  if (!seq || seq.isCut || perChar <= 0) {
    node.textContent = text;
    return;
  }

  const step = chunk ?? deliveryChunk(text.length);
  node.textContent = "";
  node.classList.add("is-typing");
  for (let i = step; i < text.length; i += step) {
    node.textContent = text.slice(0, i);
    await seq.wait(perChar);
    if (seq.isCut) break;
  }
  node.textContent = text;
  node.classList.remove("is-typing");
}

/** Bigger chunks for longer replies — fewer DOM writes, same movie feel. */
export function deliveryChunk(length) {
  if (length < 48) return 1;
  if (length < 140) return 2;
  if (length < 320) return 4;
  return 6;
}

/**
 * Per-step typing delay. Short replies finish fast; long ones still land in
 * about ~1.6s so TTS isn't waiting on a crawl.
 */
export function deliverySpeed(length) {
  const chunk = deliveryChunk(length);
  const steps = Math.max(1, Math.ceil(length / chunk));
  const targetMs = length < 40 ? 520 : length < 120 ? 980 : 1600;
  return Math.max(8, Math.min(22, Math.round(targetMs / steps)));
}
