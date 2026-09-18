import { Agent, CursorAgentError } from "@cursor/sdk";
import { redact } from "./redact.mjs";

function cursorStartError(err) {
  const name = err.constructor?.name || "CursorAgentError";
  if (name === "AuthenticationError" || /auth/i.test(err.message || "")) {
    return "Cursor rejected the key. Mint a new one at https://cursor.com/dashboard/cloud-agents and put it in .env as CURSOR_API_KEY.";
  }
  return redact(err.message || "Cursor agent could not start.");
}

/**
 * One-shot local Cursor agent against `cwd`. Disposes itself.
 * Cloud agents clone GitHub and miss uncommitted HUD files — do not use them here.
 *
 * @param {string} prompt
 * @param {{ cwd: string, apiKey: string, model?: string }} opts
 * @returns {Promise<string>}
 */
export async function runCursorAgent(prompt, { cwd, apiKey, model } = {}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("CURSOR_API_KEY missing");
  const root = cwd || process.cwd();

  let result;
  try {
    result = await Agent.prompt(prompt, {
      apiKey: key,
      model: { id: model || "composer-2" },
      local: { cwd: root, settingSources: ["project"] },
    });
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(cursorStartError(err));
    }
    throw err;
  }

  switch (result.status) {
    case "finished": {
      const text = typeof result.result === "string" ? result.result.trim() : "";
      return text || "Done. Check the HUD — Vite should pick up the files I changed.";
    }
    case "cancelled":
      throw new Error("The Cursor agent was cancelled.");
    case "error":
      throw new Error(
        result.error?.message
          ? `Cursor started but failed: ${redact(result.error.message)}`
          : "Cursor started but failed mid-run.",
      );
    default: {
      const _exhaustive = result.status;
      throw new Error(`unexpected Cursor status: ${_exhaustive}`);
    }
  }
}
