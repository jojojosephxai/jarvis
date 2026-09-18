/**
 * Phase-2 live brain: HUD → localhost bridge → Cursor SDK and/or xAI Grok.
 *
 * Setup:
 * 1. Copy .env.example → .env
 * 2. Set CURSOR_API_KEY (preferred) and/or XAI_API_KEY
 * 3. npm run jarvis:all   (HUD + bridge)
 *
 * JARVIS_BRAIN=auto|cursor|grok
 */
export const BRIDGE_PLAN = {
  goal: "OpenDex or jarvis/hud → localhost bridge → Cursor SDK / optional Grok",
  env: ["CURSOR_API_KEY", "XAI_API_KEY", "JARVIS_BRAIN"],
  endpoints: {
    health: "GET /health",
    chat: "POST /api/chat { message }",
    reset: "POST /api/reset",
  },
  notes: [
    "Bill Cursor usage to Cursor Pro — not Grok Bot",
    "XAI_API_KEY is an xAI console key; SuperGrok chat alone is not enough",
    "Cursor path uses tools: [] (chat only) + Jarvis system prompt",
    "Keyword HUD replies are fallback only when the bridge is down",
  ],
};
