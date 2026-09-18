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

function tone(ac, { freq, type = "sine", start, attack = 0.04, hold = 0.2, release = 0.25, gain = 0.04 }) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(gain * 0.7, start + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, start + attack + hold + release);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(start);
  osc.stop(start + attack + hold + release + 0.05);
}

/**
 * Short original boot motif (not a movie soundtrack). Rising fifths + a soft
 * pad under the chirp so cold start feels like power-up, not three beeps.
 */
export function playBootChirp() {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;

  // Soft low pad under the whole motif
  tone(ac, { freq: 110, type: "sine", start: now, attack: 0.08, hold: 0.9, release: 0.6, gain: 0.018 });
  tone(ac, { freq: 165, type: "triangle", start: now + 0.05, attack: 0.1, hold: 0.8, release: 0.5, gain: 0.014 });

  // Rising figure
  const figure = [
    [0.0, 220],
    [0.12, 277],
    [0.24, 330],
    [0.38, 440],
    [0.55, 554],
  ];
  for (const [t, freq] of figure) {
    tone(ac, {
      freq,
      type: "sine",
      start: now + t,
      attack: 0.03,
      hold: 0.12,
      release: 0.22,
      gain: 0.045,
    });
  }

  // Resolve on a brighter chord hit
  tone(ac, { freq: 660, type: "triangle", start: now + 0.78, attack: 0.02, hold: 0.18, release: 0.35, gain: 0.035 });
  tone(ac, { freq: 880, type: "sine", start: now + 0.8, attack: 0.02, hold: 0.15, release: 0.4, gain: 0.022 });
}

export function playAckBlip() {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(560, now);
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.1);
  gain.gain.setValueAtTime(0.028, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.13);
}
