import { buildSystemPrompt } from "./_lib/jarvis-prompt.js";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw.trim() ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function gateOk(req) {
  const expected = process.env.JARVIS_ACCESS_KEY?.trim();
  if (!expected) return true;
  const got = String(req.headers["x-jarvis-key"] || "").trim();
  return got === expected;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-jarvis-key");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "POST only" }));
    return;
  }

  if (!gateOk(req)) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Wrong or missing access key", gated: true }));
    return;
  }

  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "XAI_API_KEY not set on Vercel",
        hint: "Vercel → Project → Settings → Environment Variables → add XAI_API_KEY",
      }),
    );
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "message required" }));
    return;
  }

  /** @type {{ role: string, content: string }[]} */
  const prior = Array.isArray(body.history) ? body.history.slice(-20) : [];
  const history = prior.filter(
    (m) =>
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string",
  );

  const model = process.env.JARVIS_GROK_MODEL?.trim() || "grok-3-mini";

  try {
    const xai = await fetch("https://api.x.ai/v1/chat/completions", {
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
          { role: "user", content: message },
        ],
      }),
    });

    const raw = await xai.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `xAI non-JSON (${xai.status})` }));
      return;
    }

    if (!xai.ok) {
      const msg = data?.error?.message || data?.error || raw.slice(0, 200);
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `xAI ${xai.status}: ${msg}` }));
      return;
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Empty Grok reply" }));
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ reply, brain: "grok" }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: msg }));
  }
}
