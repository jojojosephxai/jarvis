#!/usr/bin/env node
/**
 * Live Jarvis brain bridge for the HUD.
 * Prefer Cursor SDK (CURSOR_API_KEY). Optional xAI Grok (XAI_API_KEY).
 * Not Grok Bot.
 */
import http from "node:http";
import { askCursor, cursorAvailable, disposeCursor } from "./brains/cursor.mjs";
import { askGrok, grokAvailable, resetGrokHistory } from "./brains/grok.mjs";
import { loadEnv } from "./load-env.mjs";

loadEnv();

const PORT = Number(process.env.JARVIS_BRIDGE_PORT || 8790);

/** @typedef {'auto' | 'cursor' | 'grok'} BrainMode */
/** @type {BrainMode} */
const MODE = /** @type {BrainMode} */ (
  (process.env.JARVIS_BRAIN || "auto").toLowerCase()
);

function resolveBrain() {
  const hasCursor = cursorAvailable();
  const hasGrok = grokAvailable();

  if (MODE === "cursor") {
    if (!hasCursor) return { brain: null, reason: "Set CURSOR_API_KEY in .env" };
    return { brain: "cursor", reason: null };
  }
  if (MODE === "grok") {
    if (!hasGrok) {
      return {
        brain: null,
        reason:
          "Set XAI_API_KEY in .env (xAI API key — SuperGrok chat alone is not enough)",
      };
    }
    return { brain: "grok", reason: null };
  }

  // auto: Cursor first (Pro stack), then Grok
  if (hasCursor) return { brain: "cursor", reason: null };
  if (hasGrok) return { brain: "grok", reason: null };
  return {
    brain: null,
    reason:
      "Add CURSOR_API_KEY (preferred) or XAI_API_KEY to .env — see .env.example",
  };
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (
    (req.url === "/health" || req.url === "/api/health") &&
    req.method === "GET"
  ) {
    const pick = resolveBrain();
    json(res, 200, {
      ok: Boolean(pick.brain),
      brain: pick.brain || "none",
      mode: MODE,
      cursor: cursorAvailable(),
      grok: grokAvailable(),
      gated: false,
      unlocked: true,
      reason: pick.reason,
    });
    return;
  }

  if (req.url === "/api/reset" && req.method === "POST") {
    resetGrokHistory();
    await disposeCursor();
    json(res, 200, { ok: true });
    return;
  }

  if (req.url === "/api/chat" && req.method === "POST") {
    let body;
    try {
      body = await readJson(req);
    } catch {
      json(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      json(res, 400, { error: "message required" });
      return;
    }

    const pick = resolveBrain();
    if (!pick.brain) {
      json(res, 503, {
        error: "No live brain configured",
        hint: pick.reason,
      });
      return;
    }

    try {
      const out =
        pick.brain === "cursor" ? await askCursor(message) : await askGrok(message);
      json(res, 200, out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[jarvis-bridge] ${pick.brain} failed:`, msg);
      json(res, 502, { error: msg, brain: pick.brain });
    }
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  const pick = resolveBrain();
  console.log(`Jarvis bridge on http://127.0.0.1:${PORT}`);
  console.log(
    `Brain: ${pick.brain || "none"} (mode=${MODE})` +
      (pick.reason ? ` — ${pick.reason}` : ""),
  );
});

async function shutdown() {
  await disposeCursor();
  server.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
