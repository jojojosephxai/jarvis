import { withDefaults } from "./settings.js";

/**
 * Talks to the dev-server endpoint that owns `jarvis.settings.json`.
 *
 * Self-editing only works while the HUD is running from `npm run jarvis`,
 * because that's the only time a process exists that can write to disk. A built
 * copy falls back to defaults and says so rather than pretending it saved.
 */
const ENDPOINT = "/__jarvis/settings";

export async function loadSettings() {
  try {
    const res = await fetch(ENDPOINT, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { settings: withDefaults({}), writable: false };
    return { settings: withDefaults(await res.json()), writable: true };
  } catch {
    return { settings: withDefaults({}), writable: false };
  }
}

/**
 * @param {Record<string, unknown>} patch
 * @returns {Promise<{ ok: boolean, settings?: Record<string, unknown>, error?: string }>}
 */
export async function writeSettings(patch) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Jarvis-Self-Edit": "1",
      },
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `write failed (${res.status})` };
    return { ok: true, settings: withDefaults(data.settings) };
  } catch {
    return { ok: false, error: "I can only rewrite myself while running from npm run jarvis." };
  }
}
