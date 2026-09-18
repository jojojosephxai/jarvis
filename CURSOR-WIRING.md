# Cursor wiring (brain + memory, no Grok Bot)

**`hud/` is the face.** Cursor Pro is the **hands** — coding, long research, and jobs that
keep running while you're away. They are separate on purpose, and the HUD works fine on its own.

## The split

| Job | Where it happens |
| --- | --- |
| Wake, HUD, voice, boot, overnight audit | **`hud/`** in this repo — `npm run jarvis` |
| "Know Joseph" forever | Cursor **Rules** + [`JOSEPH.profile.md`](./JOSEPH.profile.md) |
| Build apps, fix code, school coding help | Cursor **Agent** (Composer 2.5 daily; stronger models when a problem earns it) |
| Run while the laptop is closed | Cursor **Cloud Agents** + **Automations** |
| Phone | Cursor iOS or <https://cursor.com/agents> — same Rules, same profile |

The HUD does **not** call Cursor, and that's fine. It answers from a local brain in
`hud/js/profile-data.js`. When you want real work done, you open Cursor.

## Why not Grok Bot?

Grok Bot burns weekly usage fast. SuperGrok stays useful for **research chat in the Grok
app**; it is **not** part of the HUD path and never needs to be.

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

- [`JOSEPH.profile.md`](./JOSEPH.profile.md) is the memory. It lives at the repo root so any
  agent here can `@`-mention it.
- [`JOSEPH.profile.template.md`](./JOSEPH.profile.template.md) is the blank starting shape,
  kept only as a reference for rebuilding the file from scratch.
- The HUD reads a **distilled** copy in `hud/js/profile-data.js` — school, swim, near goals,
  open questions. Body and medical details are deliberately not in there.
- **When you edit the profile, update `hud/js/profile-data.js` too**, or the HUD will keep
  saying the old thing.

## The bridge (optional, not wired, not required)

[`bridge/`](./bridge/) is a stub sketching what a local Cursor-SDK bridge *would* look like.
It is **not** running, the HUD does not need it, and the Systems panel says `NOT WIRED`
rather than pretending otherwise. If it is ever built:

```text
hud/  --prompt-->  localhost:8790 bridge  --@cursor/sdk-->  Cursor Agent
      <--reply----
```

Until then, the HUD's local brain is the brain. Don't let a doc tell you otherwise.

## Later, if it's ever worth it

Cursor **Automations** can run a scheduled job (review a PR, check a repo, summarize a diff)
and leave a result behind. If that ever happens, the Overnight panel can report the real
result of a real run. Until something actually runs, the panel keeps saying so out loud.
