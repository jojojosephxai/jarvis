# Project sync — what’s real vs what’s still out

Last checked: 2026-09-18. Source of truth for “is it in the project?” is **`main`**, not draft PRs.

## What’s actually on `main` today

You can run:

```bash
npm install
npm run jarvis
```

Open http://localhost:8787.

| Thing | On main? | Notes |
| --- | --- | --- |
| Movie HUD face (`hud/`) | Yes | Boot, orb, mic, Space, Brief me, local keyword brain |
| Joseph profile | Yes | `JOSEPH.profile.md` + `hud/js/profile-data.js` |
| Agent rules | Yes | `.cursor/rules/jarvis-joseph.mdc` |
| Live xAI talk | **No** | Bridge is a stub (`brain: "stub"`) |
| Cursor file edits from HUD | **No** | Same stub |
| School Vercel brain | **No** | No `api/` on main |
| `/roles` skill | **No** | Open PR #3 only |
| Overnight email agents | **No** | Never claimed as real on purpose |
| Multi-agent auditor | **No** | Phase 2 / later |

`STATUS.md` on main still matches this: face + memory are done; live coding hands and overnight automation are partial / not yet.

## Open PRs (not in main until merged)

| PR | State | What it really is | Mark Ready? |
| --- | --- | --- | --- |
| [#1](https://github.com/jojojosephxai/jarvis/pull/1) Movie HUD + live brain | **Draft** | Big one: cinematic boot, honest Overnight audit, talk→xAI, edits→Cursor, self-edit dials | **Yes — mark Ready when you want this reviewed/merged** |
| [#2](https://github.com/jojojosephxai/jarvis/pull/2) School + live brain | **Draft** | Local Cursor/Grok chat + Vercel `/api/chat` for school PCs | **Only after you decide how it mixes with #1** |
| [#3](https://github.com/jojojosephxai/jarvis/pull/3) `/roles` skill | Open (not draft) | One markdown skill — Believer/Skeptic/Investor/Judge | Already ready; safe independent merge |

### Important conflict

PR **#1** and PR **#2** both rewrite the same brain path (`bridge/server.mjs`, `hud/js/app.js`, `bridge-client.js`, scripts). Different designs:

- **#1:** talk = xAI, file edits = Cursor SDK; movie face polish; home `.env`
- **#2:** chat prefers Cursor SDK (+ optional Grok); adds Vercel school path

Do **not** merge both blindly. Recommended order:

1. Merge **#3** anytime (harmless).
2. Mark Ready + merge **#1** for the movie face + home live brain.
3. Re-port only school pieces from **#2** (`api/`, `vercel.json`, `SCHOOL-VERCEL.md`, same-origin `/api` client) onto that stack — or close #2 if school isn’t needed yet.

## What Joseph still has to do (not code)

1. **Mark Ready** on PR #1 (and maybe #2 after the conflict decision). Draft = “not ready for normal review/merge.”
2. **Keys (home, after #1 lands):** copy `.env.example` → `.env`
   - `XAI_API_KEY` from https://console.x.ai (SuperGrok chat login is **not** this key)
   - `CURSOR_API_KEY` from https://cursor.com/dashboard/cloud-agents (for file edits)
3. **Keys (school, if keeping #2):** Vercel project **jarvis** → `XAI_API_KEY`; optional `JARVIS_ACCESS_KEY` then type `unlock …` in the HUD.
4. **Confirm practice grid** in the profile (Overnight CONFLICT stays until you resolve it).

## Agent / chat timeline (same day)

| Chat / agent | Outcome |
| --- | --- |
| Hud consistency and boot | Built most of PR #1 (movie + later live brain) |
| Missing email / Cursor SDK | Built PR #2 (school Vercel + local live chat) |
| Cursor subagents concept | Built PR #3 (`/roles`) |
| Movie startup music | No PR / no lasting code on main |
| Demo / video review agents | Reviews of HUD demos; no merge to main by themselves |
| Aesthetic branch `cursor/jarvis-aesthetic-setup-6b63` | Older HUD polish; **no open PR** — largely superseded by #1 |

## Still needs to be added (real gaps)

After PRs land, these are still missing if you want the Instagram-reel fantasy:

1. Overnight **email** automation (Automations + Gmail MCP) — face already refuses to lie about this
2. True “agents auditing other agents” while laptop is closed
3. One combined school+home brain (merge strategy above)
4. Optional: startup music (asked, not shipped)

## Reviewer shortcut

- Want movie face? → PR #1  
- Want school without Node? → pieces of PR #2 after #1  
- Want `/roles`? → PR #3  
- Want what’s running if you clone today? → **`main` only**
