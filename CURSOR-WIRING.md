# Cursor + xAI wiring (brain + hands, no Grok Bot)

**`hud/` is the face.** xAI Grok is the **talk**. Cursor Pro is the **hands** —
coding, HUD edits, long jobs. SuperGrok stays research chat in the Grok app.
Grok Bot is not in this path.

## The split

| Job | Where it happens |
| --- | --- |
| Wake, HUD, voice, boot, overnight audit | **`hud/`** — `npm run jarvis` |
| Talk (real answers, not a phrase list) | **xAI** via `bridge/` — `XAI_API_KEY` from [console.x.ai](https://console.x.ai) |
| Change HUD / files / backend by command | **Cursor SDK local agent** via `bridge/` — `CURSOR_API_KEY` from [dashboard](https://cursor.com/dashboard/cloud-agents) |
| "Know Joseph" forever | Cursor **Rules** + [`JOSEPH.profile.md`](./JOSEPH.profile.md) |
| Build Atelier, school coding help in the IDE | Cursor **Agent** (Composer 2.5 daily) |
| Run while the laptop is closed | Cursor **Cloud Agents** + **Automations** (not this HUD path) |
| Phone | Cursor iOS or <https://cursor.com/agents> — same Rules, same profile |

```text
hud/  --prompt-->  localhost:8790 bridge
                      |-- talk -------->  xAI Grok (grok-4.6)
                      `-- file/HUD edit ->  Cursor local agent (composer-2)
```

Keys stay in `.env`. The HUD never sees them. Restart `npm run jarvis` after
pasting keys.

## SuperGrok vs xAI API

SuperGrok is the **chat app**. `XAI_API_KEY` is a **console key**. They are not
the same login. If talk still says it's on the local profile, the `.env` key is
missing or rejected — mint a new one at console.x.ai.

## Why not Grok Bot?

Grok Bot burns weekly usage fast. SuperGrok stays useful for **research chat in
the Grok app**; it is **not** part of the HUD path.

## Rules to paste (Cursor → Settings → Rules)

This repo already ships [`.cursor/rules/jarvis-joseph.mdc`](./.cursor/rules/jarvis-joseph.mdc),
which applies automatically inside this workspace. Paste this into your **User Rules** so it
follows you into other projects and onto your phone:

```text
You are Jarvis for Joseph (9th grade). Explain simply; he is learning to code.
Always read and respect JOSEPH.profile.md when it exists in the workspace.
Never suggest Grok Bot. Prefer Cursor Agent, Cloud Agents, and Automations.
Do not buy or recommend new AI subscriptions. He has Cursor Pro and SuperGrok.
Ask before sending emails, posting publicly, or changing account settings.
Tone: calm, precise, briefly witty — answer first, never condescending.
```

## Profile file

- [`JOSEPH.profile.md`](./JOSEPH.profile.md) is the memory. The live Grok path
  loads it on every talk turn. Cursor local agents see it in the repo.
- [`JOSEPH.profile.template.md`](./JOSEPH.profile.template.md) is the blank starting shape.
- The HUD still keeps a **distilled** copy in `hud/js/profile-data.js` for the
  local fallback and the Tonight / Briefing plates. Body and medical details
  stay out of the HUD.
- **When you edit the profile, update `hud/js/profile-data.js` too**, or the
  fallback plates will keep saying the old thing.

## Local vs cloud Cursor

This HUD uses a **local** agent (`cwd` = this repo, `settingSources: ["project"]`)
so uncommitted HUD files are visible and Vite HMR can show the change. A cloud
agent would clone GitHub and miss that. Don't switch this bridge to cloud unless
Joseph asked for a PR.

## Later

Cursor **Automations** can still run a scheduled job and leave a result behind.
If that ever happens, the Overnight panel can report the real result of a real
run. Until something actually runs while the page is closed, the panel keeps
saying so out loud.
