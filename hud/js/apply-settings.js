import { withDefaults } from "./settings.js";
import { setSpeeds } from "./motion.js";

/**
 * Applies a settings object to the running HUD.
 *
 * Everything visual goes through CSS custom properties so a change can land
 * without a reload. Status colours are not in here on purpose — a FLAG stays
 * amber and a CONFLICT stays red whatever accent Joseph picks.
 */

const ACCENTS = {
  ice: {
    base: "#d6e6ff",
    dim: "#8aa4c8",
    glow: "rgba(200, 220, 255, 0.38)",
    line: "rgba(220, 235, 255, 0.6)",
    bright: "rgba(248, 252, 255, 0.98)",
    core: "rgba(140, 180, 255, 0.28)",
    orb: "198, 224, 255",
    orbCore: "150, 195, 255",
  },
  amber: {
    base: "#ffdcb0",
    dim: "#c49a66",
    glow: "rgba(255, 200, 130, 0.38)",
    line: "rgba(255, 226, 192, 0.6)",
    bright: "rgba(255, 248, 238, 0.98)",
    core: "rgba(255, 168, 80, 0.28)",
    orb: "255, 206, 142",
    orbCore: "255, 168, 80",
  },
  gold: {
    base: "#ffeeb0",
    dim: "#c8b064",
    glow: "rgba(255, 224, 120, 0.38)",
    line: "rgba(255, 240, 190, 0.6)",
    bright: "rgba(255, 253, 238, 0.98)",
    core: "rgba(255, 200, 70, 0.28)",
    orb: "255, 228, 140",
    orbCore: "255, 200, 70",
  },
  green: {
    base: "#c8ffdc",
    dim: "#74b58f",
    glow: "rgba(140, 240, 180, 0.38)",
    line: "rgba(200, 255, 220, 0.6)",
    bright: "rgba(240, 255, 246, 0.98)",
    core: "rgba(120, 230, 170, 0.28)",
    orb: "176, 250, 202",
    orbCore: "120, 230, 170",
  },
  crimson: {
    base: "#ffcccc",
    dim: "#c07a7a",
    glow: "rgba(255, 140, 140, 0.38)",
    line: "rgba(255, 210, 210, 0.6)",
    bright: "rgba(255, 244, 244, 0.98)",
    core: "rgba(240, 110, 110, 0.28)",
    orb: "255, 178, 178",
    orbCore: "240, 110, 110",
  },
};

/**
 * @param {Record<string, unknown>} raw settings straight off disk
 * @returns {Record<string, unknown>} the complete settings actually applied
 */
export function applySettings(raw) {
  const s = withDefaults(raw);
  const root = document.documentElement;
  const accent = ACCENTS[s.accent] || ACCENTS.ice;

  root.style.setProperty("--cyan", accent.base);
  root.style.setProperty("--cyan-dim", accent.dim);
  root.style.setProperty("--cyan-glow", accent.glow);
  root.style.setProperty("--hud-line", accent.line);
  root.style.setProperty("--hud-bright", accent.bright);
  root.style.setProperty("--hud-core", accent.core);
  root.style.setProperty("--orb-idle-rgb", accent.orb);
  root.style.setProperty("--orb-core-rgb", accent.orbCore);

  root.style.setProperty("--orb-size", `${s.orbSize}px`);
  root.style.setProperty("--scanline-opacity", String(s.scanlines / 100));
  root.style.setProperty("--boot-speed", String(s.bootSpeed));

  setSpeeds({ boot: s.bootSpeed, text: s.textSpeed });

  const stars = document.getElementById("starfield");
  if (stars) stars.hidden = !s.starfield;

  return s;
}
