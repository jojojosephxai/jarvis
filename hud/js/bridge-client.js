const BRIDGE = "http://127.0.0.1:8790";

/**
 * @typedef {{ ok: boolean, brain?: string, mode?: string, cursor?: boolean, grok?: boolean, reason?: string }} BridgeHealth
 */

/** @returns {Promise<BridgeHealth | null>} */
export async function bridgeHealth() {
  try {
    const res = await fetch(`${BRIDGE}/health`, { signal: AbortSignal.timeout(800) });
    if (!res.ok) return null;
    return /** @type {BridgeHealth} */ (await res.json());
  } catch {
    return null;
  }
}

/**
 * Ask the live brain. Longer timeout — Cursor SDK can take a bit.
 * @param {string} message
 * @returns {Promise<{ reply: string, brain: string } | null>}
 */
export async function askBridge(message) {
  try {
    const res = await fetch(`${BRIDGE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const hint = data.hint || data.error || `bridge ${res.status}`;
      return { reply: `Brain offline: ${hint}`, brain: "error" };
    }
    if (typeof data.reply !== "string" || !data.reply.trim()) return null;
    return { reply: data.reply.trim(), brain: data.brain || "live" };
  } catch {
    return null; // bridge process not running
  }
}
