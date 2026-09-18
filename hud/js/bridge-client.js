const BRIDGE = "http://127.0.0.1:8790";

/** Live model calls are slow. 300ms used to fail-fast to the local brain; that is gone. */
export const ASK_TIMEOUT_MS = 180_000;

/**
 * Ask the local bridge. Returns a spoken reply, an honest error, or
 * `{ fallback: "local" }` when talk should stay on the resident profile.
 *
 * @param {string} message
 * @param {{ audit?: object | null }} [extra]
 */
export async function askBridge(message, extra = {}) {
  try {
    const res = await fetch(`${BRIDGE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, audit: extra.audit ?? null }),
      signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    if (data.fallback === "local") {
      return { fallback: "local", via: data.via ?? "none" };
    }
    if (typeof data.reply === "string" && data.reply.trim()) {
      return {
        ok: true,
        reply: data.reply.trim(),
        via: data.via ?? null,
        error: data.error ?? null,
      };
    }
    const error =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : `Bridge error ${res.status}`;
    return { ok: false, reply: null, error, via: data.via ?? null };
  } catch (err) {
    const timeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      ok: false,
      reply: null,
      error: timeout
        ? "The model is still working, but this wait ran out. Check the bridge terminal, then try again."
        : "The bridge dropped. Is npm run jarvis still running?",
    };
  }
}

/**
 * Probe the bridge. Health is key-presence only — it does not ping xAI.
 * Offline is the normal case until `.env` is filled and the bridge is running.
 * @returns {Promise<{ reachable: boolean, xai: boolean, cursor: boolean }>}
 */
export async function probeBridge() {
  try {
    const res = await fetch(`${BRIDGE}/health`, { signal: AbortSignal.timeout(800) });
    if (!res.ok) return { reachable: false, xai: false, cursor: false };
    const data = await res.json();
    return {
      reachable: Boolean(data.ok),
      xai: Boolean(data.xai),
      cursor: Boolean(data.cursor),
    };
  } catch {
    return { reachable: false, xai: false, cursor: false };
  }
}
