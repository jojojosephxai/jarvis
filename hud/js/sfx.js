/** Stark-style boot / ack tones, synthesized — no audio files. */

/** @type {AudioContext | null} */
let ctx = null;

/**
 * One shared context for the whole session. Browsers start it suspended until
 * the page has been interacted with, so every call tries to resume it.
 */
function audio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx.state === "running" ? ctx : null;
}

/** Call from a user gesture so later tones aren't blocked. */
export function unlockAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  if (!ctx) ctx = new Ctx();
  ctx.resume().catch(() => {});
}

export function playBootChirp() {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  for (const [i, freq] of [220, 330, 440].entries()) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.05 + i * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35 + i * 0.08);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now + i * 0.08);
    osc.stop(now + 0.45 + i * 0.08);
  }
}

export function playAckBlip() {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.value = 520;
  gain.gain.setValueAtTime(0.03, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.14);
}
