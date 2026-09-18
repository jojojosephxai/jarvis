/**
 * Same-origin brain:
 * - School / Vercel: /api/* → serverless Grok
 * - Home + Node: Vite proxies /api/* → localhost bridge (Cursor or Grok)
 */

const KEY_STORAGE = "jarvis_access_key";

/** @returns {string} */
function accessKey() {
  try {
    return sessionStorage.getItem(KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

/** @param {string} key */
export function setAccessKey(key) {
  try {
    sessionStorage.setItem(KEY_STORAGE, key);
  } catch {
    /* private mode */
  }
}

function headers(json = false) {
  /** @type {Record<string, string>} */
  const h = {};
  if (json) h["Content-Type"] = "application/json";
  const key = accessKey();
  if (key) h["x-jarvis-key"] = key;
  return h;
}

/**
 * @typedef {{ ok: boolean, brain?: string, mode?: string, cursor?: boolean, grok?: boolean, gated?: boolean, unlocked?: boolean, reason?: string }} BridgeHealth
 */

/** @type {{ role: string, content: string }[]} */
let history = [];

/** @returns {Promise<BridgeHealth | null>} */
export async function bridgeHealth() {
  try {
    const res = await fetch("/api/health", {
      headers: headers(),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    return /** @type {BridgeHealth} */ (await res.json());
  } catch {
    return null;
  }
}

/**
 * @param {string} message
 * @returns {Promise<{ reply: string, brain: string } | null>}
 */
export async function askBridge(message) {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ message, history }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401 || data.gated) {
      return {
        reply: "Access key needed. Type: unlock YOUR_KEY  (same as JARVIS_ACCESS_KEY on Vercel)",
        brain: "error",
      };
    }

    if (!res.ok) {
      const hint = data.hint || data.error || `brain ${res.status}`;
      return { reply: `Brain offline: ${hint}`, brain: "error" };
    }

    if (typeof data.reply !== "string" || !data.reply.trim()) return null;

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: data.reply.trim() });
    if (history.length > 24) history = history.slice(-24);

    return { reply: data.reply.trim(), brain: data.brain || "live" };
  } catch {
    return null;
  }
}

/** Clear chat memory (not the access key). */
export function resetChatHistory() {
  history = [];
}
