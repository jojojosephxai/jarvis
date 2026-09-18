import { Agent, CursorAgentError } from "@cursor/sdk";
import { ROOT } from "../load-env.mjs";
import { buildSystemPrompt } from "../system-prompt.mjs";

/** @type {import('@cursor/sdk').SDKAgent | null} */
let agent = null;

export function cursorAvailable() {
  return Boolean(process.env.CURSOR_API_KEY?.trim());
}

async function getAgent() {
  if (agent) return agent;
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing CURSOR_API_KEY");

  const modelId = process.env.JARVIS_CURSOR_MODEL?.trim() || "composer-2";

  agent = await Agent.create({
    apiKey,
    model: { id: modelId },
    // Text-only HUD chat — no shell/edit tools.
    tools: [],
    systemPrompt: buildSystemPrompt(),
    local: { cwd: ROOT },
  });
  return agent;
}

/**
 * Multi-turn Cursor Agent (local runtime, tools disabled).
 * @param {string} message
 * @returns {Promise<{ reply: string, brain: string, durationMs?: number }>}
 */
export async function askCursor(message) {
  const started = Date.now();
  try {
    const a = await getAgent();
    const run = await a.send(message);
    const result = await run.wait();
    if (result.status === "error") {
      throw new Error(result.error?.message || "Cursor run failed");
    }
    const reply = (result.result || "").trim();
    if (!reply) throw new Error("Cursor returned an empty reply");
    return {
      reply,
      brain: "cursor",
      durationMs: result.durationMs ?? Date.now() - started,
    };
  } catch (err) {
    if (err instanceof CursorAgentError) {
      const e = new Error(`Cursor auth/config: ${err.message}`);
      e.cause = err;
      throw e;
    }
    throw err;
  }
}

export async function disposeCursor() {
  if (!agent) return;
  try {
    await agent[Symbol.asyncDispose]();
  } catch {
    /* ignore */
  }
  agent = null;
}
