#!/usr/bin/env node
/**
 * Local brain for the HUD.
 *
 * Talk → xAI Grok. File / HUD edits → Cursor SDK local agent.
 * Keys are read from `.env` in this process only — never sent to the browser.
 */
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./load-env.mjs";
import { wantsFileEdit } from "../hud/js/wants-file-edit.js";
import { buildCursorPrompt, buildSystemPrompt, loadProfile, repoRoot } from "./prompt.mjs";
import { chatXai as defaultChatXai } from "./xai.mjs";
import { runCursorAgent as defaultRunCursor } from "./cursor-agent.mjs";

const MISSING_CURSOR =
  "I can talk, but I cannot change files until CURSOR_API_KEY is in .env. Mint it at https://cursor.com/dashboard/cloud-agents.";

function trim(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function keysPresent(env = process.env) {
  return {
    xai: Boolean(trim(env.XAI_API_KEY)),
    cursor: Boolean(trim(env.CURSOR_API_KEY)),
  };
}

function readConfig(env = process.env) {
  return {
    xaiKey: trim(env.XAI_API_KEY),
    xaiModel: trim(env.XAI_MODEL) || "grok-4.6",
    cursorKey: trim(env.CURSOR_API_KEY),
    cursorModel: trim(env.CURSOR_MODEL) || "composer-2",
  };
}

function redact(s) {
  return String(s)
    .replace(/cursor_[A-Za-z0-9._-]+/g, "cursor_…")
    .replace(/xai-[A-Za-z0-9._-]+/g, "xai-…")
    .replace(/Bearer\s+\S+/gi, "Bearer …");
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   repoRoot?: string,
 *   chatXai?: typeof defaultChatXai,
 *   runCursor?: typeof defaultRunCursor,
 *   profile?: string,
 * }} [opts]
 */
export function createBridge(opts = {}) {
  const env = opts.env ?? process.env;
  const root = opts.repoRoot ?? repoRoot();
  const chatXai = opts.chatXai ?? defaultChatXai;
  const runCursor = opts.runCursor ?? defaultRunCursor;
  const profile = opts.profile ?? loadProfile(root);
  /** @type {Array<{ role: "user" | "assistant", content: string }>} */
  const history = [];

  function remember(user, assistant) {
    history.push({ role: "user", content: user }, { role: "assistant", content: assistant });
    while (history.length > 20) history.shift();
  }

  async function handleChat(body) {
    const text = trim(body?.message);
    if (!text) return { reply: "Standing by.", via: "none" };
    if (text.length > 8000) return { reply: "That was too long. Shorter, please.", via: "none" };

    const cfg = readConfig(env);
    const audit = body?.audit ?? null;
    const edit = wantsFileEdit(text);

    if (edit) {
      if (!cfg.cursorKey) {
        return { reply: MISSING_CURSOR, via: "none", error: "missing_cursor_key" };
      }
      try {
        const reply = await runCursor(buildCursorPrompt({ message: text, audit }), {
          cwd: root,
          apiKey: cfg.cursorKey,
          model: cfg.cursorModel,
        });
        remember(text, reply);
        return { reply, via: "cursor" };
      } catch (err) {
        const reply = `Cursor did not finish that edit. ${redact(err instanceof Error ? err.message : "unknown error")}`;
        return { reply, via: "cursor", error: "cursor_failed" };
      }
    }

    if (!cfg.xaiKey) {
      return { fallback: "local", via: "none" };
    }

    try {
      const reply = await chatXai({
        apiKey: cfg.xaiKey,
        model: cfg.xaiModel,
        messages: [
          { role: "system", content: buildSystemPrompt({ profile, audit }) },
          ...history,
          { role: "user", content: text },
        ],
      });
      remember(text, reply);
      return { reply, via: "xai" };
    } catch (err) {
      const reply = `xAI did not answer. ${redact(err instanceof Error ? err.message : "unknown error")}`;
      return { reply, via: "xai", error: "xai_failed" };
    }
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

    const url = req.url?.split("?")[0] || "";

    if (url === "/health" && req.method === "GET") {
      const keys = keysPresent(env);
      send(res, 200, {
        ok: true,
        brain: keys.xai || keys.cursor ? "live" : "local",
        xai: keys.xai,
        cursor: keys.cursor,
      });
      return;
    }

    if (url === "/api/chat" && req.method === "POST") {
      let body;
      try {
        body = JSON.parse((await readBody(req)) || "{}");
      } catch {
        send(res, 400, { reply: "I could not read that.", via: "none", error: "bad_json" });
        return;
      }
      try {
        const result = await handleChat(body);
        send(res, 200, result);
      } catch (err) {
        send(res, 500, {
          reply: "The bridge hit an unexpected error.",
          via: "none",
          error: redact(err instanceof Error ? err.message : "unknown"),
        });
      }
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  return { server, history, handleChat };
}

function listen() {
  const root = repoRoot();
  loadEnv(root);
  const port = Number(process.env.JARVIS_BRIDGE_PORT || 8790);
  const { server } = createBridge({ repoRoot: root });
  server.listen(port, "127.0.0.1", () => {
    const keys = keysPresent();
    console.log(`Jarvis bridge on http://127.0.0.1:${port}  xai=${keys.xai} cursor=${keys.cursor}`);
    if (!keys.xai) {
      console.log("  No XAI_API_KEY — talk stays local. Mint at https://console.x.ai (not SuperGrok chat).");
    }
    if (!keys.cursor) {
      console.log("  No CURSOR_API_KEY — file edits stay refused. Mint at https://cursor.com/dashboard/cloud-agents");
    }
  });
}

const isMain =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) listen();
