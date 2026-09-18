export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-jarvis-key");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const gated = Boolean(process.env.JARVIS_ACCESS_KEY?.trim());
  const hasGrok = Boolean(process.env.XAI_API_KEY?.trim());
  const key = String(req.headers["x-jarvis-key"] || "").trim();
  const unlocked = !gated || key === process.env.JARVIS_ACCESS_KEY?.trim();

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      ok: hasGrok && unlocked,
      brain: hasGrok && unlocked ? "grok" : "none",
      mode: "vercel",
      cursor: false,
      grok: hasGrok,
      gated,
      unlocked,
      reason: !hasGrok
        ? "Add XAI_API_KEY in Vercel env vars"
        : !unlocked
          ? "Enter your JARVIS_ACCESS_KEY"
          : null,
    }),
  );
}
