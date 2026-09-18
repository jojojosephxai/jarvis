import { buildSystemPrompt } from "../system-prompt.mjs";

/** @type {{ role: string, content: string }[]} */
let history = [];

export function grokAvailable() {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

export function resetGrokHistory() {
  history = [];
}

/**
 * Fast conversational brain via xAI Chat Completions (not Grok Bot).
 * Needs XAI_API_KEY — SuperGrok chat sub alone is not enough.
 * @param {string} message
 * @returns {Promise<{ reply: string, brain: string, durationMs?: number }>}
 */
export async function askGrok(message) {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing XAI_API_KEY");

  const model = process.env.JARVIS_GROK_MODEL?.trim() || "grok-3-mini";
  const started = Date.now();

  history.push({ role: "user", content: message });
  // Keep memory light for HUD turns
  if (history.length > 24) history = history.slice(-24);

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 400,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        ...history,
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`xAI non-JSON (${res.status}): ${raw.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.error || raw.slice(0, 200);
    throw new Error(`xAI ${res.status}: ${msg}`);
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("Grok returned an empty reply");

  history.push({ role: "assistant", content: reply });
  return { reply, brain: "grok", durationMs: Date.now() - started };
}
