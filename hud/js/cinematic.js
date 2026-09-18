import { typeInto } from "./typewriter.js";
import { beat } from "./motion.js";

/**
 * Boot cinematic: cold start → visor → plate assemble.
 *
 * Phases are driven by `document.body.dataset.phase`; all the motion lives in
 * css/cinematic.css. Skip / Esc sets `data-cut`, which kills every animation and
 * transition so the awaited chain lands on its final state in one tick rather
 * than leaving a half-assembled HUD.
 */

export const BOOT_LINES = [
  "Cold start — arc reactor spinning up",
  "Mounting Joseph profile kernel",
  "Conestoga schedule bus: online",
  "UMLY AG1B grid: online",
  "Voice stack: Web Speech",
  "Policy: no Grok Bot, no new subscriptions",
  "Running overnight audit — local only",
  "Handshake complete",
];

/** @type {ReadonlyArray<string>} */
const PHASES = ["boot", "visor", "assemble", "live"];

export function setPhase(phase) {
  if (!PHASES.includes(phase)) throw new Error(`unknown cinematic phase: ${phase}`);
  document.body.dataset.phase = phase;
}

export function markCut() {
  document.body.dataset.cut = "1";
}

/**
 * Cold start: reactor ignition, system log, progress climb.
 * @param {{ log: HTMLElement, bar: HTMLElement, pct: HTMLElement }} el
 * @param {{ wait: (ms: number) => Promise<void>, isCut: boolean }} seq
 */
export async function playBoot(el, seq) {
  setPhase("boot");
  await seq.wait(beat(520));

  for (let i = 0; i < BOOT_LINES.length; i += 1) {
    if (seq.isCut) break;
    const li = document.createElement("li");
    el.log.appendChild(li);
    await typeInto(li, BOOT_LINES[i], { seq, charMs: 5, chunk: 2 });

    const pct = Math.round(((i + 1) / BOOT_LINES.length) * 100);
    el.bar.style.width = `${pct}%`;
    el.pct.textContent = `${pct}%`;
    await seq.wait(beat(70, 0));
  }

  if (seq.isCut) {
    el.log.textContent = "";
    for (const line of BOOT_LINES) {
      const li = document.createElement("li");
      li.textContent = line;
      el.log.appendChild(li);
    }
  }
  el.bar.style.width = "100%";
  el.pct.textContent = "100%";
  await seq.wait(beat(100));
}

/**
 * Helmet visor seats over the boot screen, glass catches a reflection, and the
 * HUD becomes visible through the eye slits.
 */
export async function playVisor(seq) {
  setPhase("visor");
  await seq.wait(beat(980));
}

/** Camera pushes through the visor while the HUD plates fly in and seat. */
export async function playAssemble(seq) {
  setPhase("assemble");
  await seq.wait(beat(1180));
  setPhase("live");
  await seq.wait(beat(80, 0));
}
