const BRIDGE = "http://127.0.0.1:8790";

export async function askBridge(message) {
  try {
    const res = await fetch(`${BRIDGE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(300), // fail fast — local jarvisReply stays snappy
    });
    if (res.status === 501) return null; // stub not wired
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.reply === "string" ? data.reply : null;
  } catch {
    return null; // bridge offline / slow — local brain handles it
  }
}

/**
 * Probe the optional `bridge/` stub. Offline is the normal, expected case —
 * the HUD reports it honestly rather than treating it as an error.
 * @returns {Promise<{ reachable: boolean, cursor: boolean }>}
 */
export async function probeBridge() {
  try {
    const res = await fetch(`${BRIDGE}/health`, { signal: AbortSignal.timeout(800) });
    if (!res.ok) return { reachable: false, cursor: false };
    const data = await res.json();
    return { reachable: Boolean(data.ok), cursor: Boolean(data.cursor) };
  } catch {
    return { reachable: false, cursor: false };
  }
}
