/**
 * What Jarvis is allowed to change about himself.
 *
 * This schema is the security boundary, not just documentation. The dev-server
 * endpoint that writes `jarvis.settings.json` rejects any key that isn't here
 * and clamps every value to the range below, so the worst a bad request can do
 * is make the HUD an ugly colour. Nothing here can write arbitrary files, run
 * code, or reach outside the settings file.
 */
export const SCHEMA = {
  accent: {
    kind: "enum",
    values: ["ice", "amber", "gold", "green", "crimson"],
    default: "ice",
    label: "accent",
  },
  orbSize: { kind: "number", min: 240, max: 560, step: 60, default: 400, unit: "px", label: "orb" },
  // Speeds, not durations: higher is faster, and timings divide by them.
  bootSpeed: { kind: "number", min: 0.5, max: 2.5, step: 0.35, default: 1, label: "boot speed" },
  textSpeed: { kind: "number", min: 0.4, max: 3, step: 0.45, default: 1, label: "typing speed" },
  scanlines: { kind: "number", min: 0, max: 40, step: 8, default: 8, label: "scanlines" },
  starfield: { kind: "boolean", default: true, label: "starfield" },
  voiceRate: { kind: "number", min: 0.6, max: 1.6, step: 0.1, default: 1.04, label: "speaking rate" },
  voicePitch: { kind: "number", min: 0.5, max: 1.4, step: 0.1, default: 0.9, label: "voice pitch" },
  wakeStyle: {
    kind: "enum",
    values: ["steward", "brief", "silent"],
    default: "steward",
    label: "wake line",
  },
  probeBridge: { kind: "boolean", default: true, label: "bridge probe" },
};

export const DEFAULTS = Object.fromEntries(
  Object.entries(SCHEMA).map(([key, spec]) => [key, spec.default]),
);

const round = (n) => Math.round(n * 1000) / 1000;

/**
 * Validate and clamp one value. Returns `undefined` for anything the schema
 * won't accept, so callers can drop it rather than storing junk.
 */
export function coerce(key, value) {
  const spec = SCHEMA[key];
  if (!spec) return undefined;

  switch (spec.kind) {
    case "enum":
      return spec.values.includes(value) ? value : undefined;
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    case "number": {
      const n = Number(value);
      if (!Number.isFinite(n)) return undefined;
      return round(Math.min(spec.max, Math.max(spec.min, n)));
    }
    default: {
      /** @type {never} */
      const exhaustive = spec.kind;
      throw new Error(`unhandled setting kind: ${exhaustive}`);
    }
  }
}

export function sanitize(patch) {
  const clean = {};
  if (!patch || typeof patch !== "object") return clean;
  for (const [key, value] of Object.entries(patch)) {
    const ok = coerce(key, value);
    if (ok !== undefined) clean[key] = ok;
  }
  return clean;
}

export function withDefaults(stored) {
  return { ...DEFAULTS, ...sanitize(stored) };
}

export function nudge(key, current, direction) {
  const spec = SCHEMA[key];
  if (!spec || spec.kind !== "number") return undefined;
  return coerce(key, current + spec.step * direction);
}

export function atLimit(key, value, direction) {
  const spec = SCHEMA[key];
  if (!spec || spec.kind !== "number") return false;
  return direction > 0 ? value >= spec.max : value <= spec.min;
}

export function describe(key, value) {
  const spec = SCHEMA[key];
  if (!spec) return `${key} is ${value}`;
  if (spec.kind === "boolean") return `${spec.label} ${value ? "on" : "off"}`;
  if (spec.kind === "enum") return `${spec.label} ${value}`;
  if (spec.unit) return `${spec.label} at ${value}${spec.unit}`;
  return `${spec.label} at ${value}`;
}

export function changedFromDefault(settings) {
  return Object.entries(settings).filter(([key, value]) => DEFAULTS[key] !== value);
}
