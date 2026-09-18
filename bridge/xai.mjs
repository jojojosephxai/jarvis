const XAI_URL = "https://api.x.ai/v1/chat/completions";

/**
 * One non-streaming Chat Completions call to xAI.
 * @param {{ messages: Array<{ role: string, content: string }>, apiKey: string, model?: string, timeoutMs?: number }} opts
 * @returns {Promise<string>}
 */
export async function chatXai({ messages, apiKey, model, timeoutMs = 90_000 }) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("XAI_API_KEY missing");

  const res = await fetch(XAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || "grok-4.6",
      messages,
      stream: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const status = res.status;
    if (status === 401 || status === 403) {
      throw new Error(
        "xAI rejected the key. It has to come from https://console.x.ai — SuperGrok chat login is a different thing.",
      );
    }
    if (status === 429) {
      throw new Error("xAI rate-limited this call. Wait a minute, then try again.");
    }
    throw new Error(`xAI HTTP ${status}`);
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error("xAI returned an empty reply");
  }
  return reply.trim();
}
