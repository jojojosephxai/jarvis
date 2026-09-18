# Cursor wiring (brain + memory, no Grok Bot)

OpenDex is the **face**. Cursor Pro is the **hands** for coding, long research, and jobs that keep running while you’re away.

## Why not Grok Bot?

Grok Bot burns weekly usage fast. SuperGrok stays useful for **chat research in the Grok app**; it is **not** required for the HUD path.

## Day-one split (no code required)

| Job | Where |
| --- | --- |
| Wake, HUD, voice, “movie” feel | OpenDex |
| “Know Joseph” forever | Cursor **User Rules** + `JOSEPH.profile.md` |
| Build apps / fix code / school coding help | Cursor Agent (Composer 2.5 daily; stronger models when needed) |
| Run while laptop closed | Cursor **Cloud Agents** + **Automations** (`/automate`) |
| Phone | Cursor iOS or https://cursor.com/agents — same Rules |

## User Rule to paste (Customize → Rules → User Rules)

```text
You are Jarvis for Joseph (9th grade). Explain simply; he is learning and does not know how to code yet.
Always read and respect JOSEPH.profile.md when it exists in the workspace.
Never suggest Grok Bot. Prefer Cursor Agent, Cloud Agents, and Automations.
Do not buy or recommend new AI subscriptions. He has Cursor Pro and SuperGrok.
Ask before sending emails, posting publicly, or changing account settings.
For movie-Jarvis tone: calm, precise, briefly witty — never condescending.
```

## Profile file

1. Rename `JOSEPH.profile.template.md` → `JOSEPH.profile.md` after pasting your merged markdown.  
2. Keep `JOSEPH.profile.md` in `jarvis/` so every Agent in this repo can `@` it.  
3. Optional: in chat say `@JOSEPH.profile.md` once so it’s in context.

## Phase 2 — Cursor (and optional Grok) behind the HUD

The in-repo HUD talks to `bridge/` on port 8790.

1. Copy `.env.example` → `.env`.
2. Set **`CURSOR_API_KEY`** from [Cursor Cloud Agents / API keys](https://cursor.com/dashboard/cloud-agents) (preferred — bills Cursor Pro).
3. Optional: set **`XAI_API_KEY`** from [xAI console](https://console.x.ai/) for fast Grok chat. SuperGrok **chat** alone is **not** this key.
4. `npm run jarvis:all` (HUD + bridge). `JARVIS_BRAIN=auto` uses Cursor first, then Grok.

Cursor path: `@cursor/sdk` with `tools: []` (text only) + Jarvis system prompt from `JOSEPH.profile.md`.  
Not Grok Bot. OpenDex can point at the same `/api/chat` later.

### Sketch

```text
HUD  --prompt-->  localhost:8790  --@cursor/sdk or xAI-->  live reply
                <--stream / JSON--
```

Cookbook: https://github.com/cursor/cookbook (sdk/quickstart)
## Phone + computer

- **Computer:** OpenDex HUD + Cursor desktop Agent.  
- **Phone:** Cursor Agents app / web — kick off Cloud Agents; no OpenDex on phone.  
- Shared memory = the same User Rules + profile markdown, not Grok Bot sync.

## Phase 3 (reel Db6KlOhJYLk)

Only after HUD + Cursor memory work: Automations that review PRs / other agent runs (“audit the other agents”). Not required for the movie startup feel.
