import { typeSpeed } from "./motion.js";

/**
 * Type `text` into `node`, one character at a time.
 *
 * Collapses to a single assignment when motion is reduced or when the boot
 * sequence has been cut, so Skip never leaves a half-typed line on screen.
 *
 * @param {HTMLElement | null} node
 * @param {string} text
 * @param {{ seq?: { wait: (ms: number) => Promise<void>, isCut: boolean }, charMs?: number }} [opts]
 */
export async function typeInto(node, text, { seq, charMs = 16 } = {}) {
  if (!node) return;
  const perChar = typeSpeed(charMs);
  if (!seq || seq.isCut || perChar <= 0) {
    node.textContent = text;
    return;
  }

  node.textContent = "";
  node.classList.add("is-typing");
  for (let i = 1; i <= text.length; i += 1) {
    node.textContent = text.slice(0, i);
    await seq.wait(perChar);
    if (seq.isCut) break;
  }
  node.textContent = text;
  node.classList.remove("is-typing");
}
