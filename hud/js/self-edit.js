import { DEFAULTS, SCHEMA, atLimit, changedFromDefault, coerce, describe, nudge } from "./settings.js";

/**
 * Turns an instruction from Joseph into a settings patch.
 *
 * Deliberately a fixed grammar rather than a model: every command maps to a
 * known key with a clamped value, so Jarvis can rewrite his own look and
 * behaviour without any possibility of writing code that breaks him. Anything
 * beyond these dials is refused out loud instead of guessed at.
 */

const ACCENTS = {
  ice: /\b(ice|icy|blue|cyan|default colou?r)\b/,
  amber: /\b(amber|orange)\b/,
  gold: /\b(gold|golden|yellow)\b/,
  green: /\b(green|emerald)\b/,
  crimson: /\b(crimson|red|scarlet)\b/,
};

const COLOUR_CUE = /\b(go|turn|make yourself|switch to|accent|colou?r|paint yourself)\b/;

/** "bigger / faster / more" vs "smaller / slower / less". */
const UP = /\b(bigger|larger|louder|faster|quicker|more|higher|increase|up|speed up)\b/;
const DOWN = /\b(smaller|tinier|quieter|slower|less|lower|deeper|decrease|down|slow down)\b/;

function direction(q) {
  if (UP.test(q)) return 1;
  if (DOWN.test(q)) return -1;
  return 0;
}

/** A numeric nudge, with an honest answer when it's already pinned. */
function step(key, current, dir) {
  if (atLimit(key, current[key], dir)) {
    const spec = SCHEMA[key];
    const edge = dir > 0 ? spec.max : spec.min;
    return { patch: {}, say: `${describe(key, edge)} already — that's as far as I go.` };
  }
  const value = nudge(key, current[key], dir);
  return { patch: { [key]: value }, say: `${describe(key, value)}.` };
}

function set(key, value) {
  const ok = coerce(key, value);
  if (ok === undefined) return null;
  return { patch: { [key]: ok }, say: `${describe(key, ok)}.` };
}

/**
 * @param {string} raw what Joseph said or typed
 * @param {Record<string, unknown>} current the settings in effect right now
 * @returns {{ patch: Record<string, unknown>, say: string } | null} null when
 *   the command isn't about self-editing and the normal brain should answer
 */
export function parseSelfEdit(raw, current) {
  const q = raw.trim().toLowerCase();
  if (!q) return null;

  // ——— What have you already changed? ———
  if (/\b(what have you changed|show (me )?your settings|your current settings|how are you set)\b/.test(q)) {
    const changed = changedFromDefault(current);
    if (!changed.length) return { patch: {}, say: "Nothing. I'm exactly as I shipped." };
    return {
      patch: {},
      say: `I've changed ${changed.length === 1 ? "one thing" : `${changed.length} things`} about myself: ${changed
        .map(([key, value]) => describe(key, value))
        .join(", ")}. All of it is in hud/jarvis.settings.json.`,
    };
  }

  // ——— What can you change? ———
  if (/\b(what can you (change|edit|tune|adjust)|self.?edit|what dials)\b/.test(q)) {
    const names = Object.values(SCHEMA)
      .map((s) => s.label)
      .join(", ");
    return {
      patch: {},
      say: `I can change ${names}. Try "make the orb bigger", "go amber", or "boot faster". Every change is written to hud/jarvis.settings.json, so git diff shows exactly what I did to myself and git checkout undoes it.`,
    };
  }

  // ——— Reset ———
  if (/\b(reset|revert|undo).{0,20}\b(yourself|your (settings|changes|edits)|everything)\b/.test(q) ||
      /\b(factory reset|back to (default|normal|stock))\b/.test(q)) {
    return { patch: { ...DEFAULTS }, say: "Reset. Back to how I shipped." };
  }

  // ——— Accent ———
  if (COLOUR_CUE.test(q)) {
    for (const [name, pattern] of Object.entries(ACCENTS)) {
      if (pattern.test(q)) return set("accent", name);
    }
  }

  // ——— Orb ———
  if (/\borb\b/.test(q)) {
    const dir = direction(q);
    if (dir) return step("orbSize", current, dir);
  }

  // ——— Boot pacing ———
  if (/\b(boot|startup|start.?up|intro|cinematic|opening)\b/.test(q)) {
    if (/\b(skip|cut|shorten|snappier)\b/.test(q)) return set("bootSpeed", SCHEMA.bootSpeed.max);
    if (/\bmore cinematic\b/.test(q)) return step("bootSpeed", current, -1);
    const dir = direction(q);
    if (dir) return step("bootSpeed", current, dir);
  }

  // ——— Typing ———
  if (/\b(typ(e|ing)|text|transcript)\b/.test(q)) {
    const dir = direction(q);
    if (dir) return step("textSpeed", current, dir);
  }

  // ——— Wake line ———
  // Must beat the voice rule below: "don't talk when you wake up" contains both
  // "talk" and "up", and would otherwise be read as "speak faster".
  if (/\b(wake|waking|greeting|start.?up|when you (start|boot|wake))\b/.test(q)) {
    if (/\b(silent|quiet|don'?t (talk|speak)|stop talking|shut up|nothing)\b/.test(q)) {
      return set("wakeStyle", "silent");
    }
    if (/\b(brief|short|shorter|terse|trim)\b/.test(q)) return set("wakeStyle", "brief");
    if (/\b(full|normal|long|everything)\b/.test(q)) return set("wakeStyle", "steward");
  }

  // ——— Voice ———
  if (/\b(voice|talk|speak|speech|say it)\b/.test(q)) {
    if (/\b(deeper|lower pitch|higher|pitch)\b/.test(q)) {
      const dir = /\b(higher)\b/.test(q) ? 1 : -1;
      return step("voicePitch", current, dir);
    }
    const dir = direction(q);
    if (dir) return step("voiceRate", current, dir);
  }

  // ——— Scanlines ———
  if (/\bscan ?lines?\b/.test(q)) {
    if (/\b(off|no|remove|hide|kill|disable)\b/.test(q)) return set("scanlines", 0);
    const dir = direction(q);
    if (dir) return step("scanlines", current, dir);
    if (/\b(on|show|enable|back)\b/.test(q)) return set("scanlines", DEFAULTS.scanlines);
  }

  // ——— Starfield ———
  if (/\b(stars?|starfield)\b/.test(q)) {
    if (/\b(off|no|remove|hide|kill|disable)\b/.test(q)) return set("starfield", false);
    if (/\b(on|show|enable|back)\b/.test(q)) return set("starfield", true);
  }

  // ——— Bridge probe ———
  if (/\bbridge\b/.test(q) && /\b(stop|don'?t|off|quit|disable)\b/.test(q)) {
    return set("probeBridge", false);
  }
  if (/\bbridge\b/.test(q) && /\b(start|check|on|enable)\b/.test(q)) {
    return set("probeBridge", true);
  }

  // ——— Clearly a self-edit, clearly past the dials ———
  if (
    /\b(change|edit|modify|rewrite|redesign|add|remove|delete|build)\b/.test(q) &&
    /\b(yourself|your (own )?(code|ui|interface|layout|source|panel|self)|the hud)\b/.test(q)
  ) {
    return {
      patch: {},
      say: "That's past the local dials. Put CURSOR_API_KEY in .env from cursor.com/dashboard/cloud-agents, restart npm run jarvis, and ask again — that's the part of me that writes code, and you get a diff to read.",
    };
  }

  return null;
}
