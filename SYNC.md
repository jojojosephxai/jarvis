# Project sync — what’s real vs what’s still out

Last checked: 2026-09-18 (after PR #1 merged to `main`). Source of truth for “is it in the project?” is **`main`**, not draft PRs.

## What’s actually on `main` today

You can run:

```bash
npm install
cp .env.example .env   # add XAI_API_KEY and/or CURSOR_API_KEY
npm run jarvis
```

Open http://localhost:8787.

| Thing | On main? | Notes |
| --- | --- | --- |
| Movie HUD face (`hud/`) | **Yes** | Visor boot, plates, orb, mic, Space, Overnight audit, dials |
| Joseph profile | **Yes** | `JOSEPH.profile.md` + `hud/js/profile-data.js` |
| Agent rules | **Yes** | `.cursor/rules/jarvis-joseph.mdc` |
| `/roles` skill | **Yes** | Merged via PR #3 |
| Live xAI talk | **Yes (needs key)** | Bridge + `XAI_API_KEY` from https://console.x.ai |
| Cursor file edits from HUD | **Yes (needs key)** | `CURSOR_API_KEY` from Cursor cloud-agents dashboard |
| School Vercel brain (`api/`) | **No** | Still only on draft PR #2 — you said you don’t need that path |
| Overnight email agents | **No** | Never claimed as real on purpose |
| Multi-agent auditor | **No** | Phase 2 / later |
| Long-term chat memory + broad skills | **No** | Next build after face+brain — not in any open PR |

## Open PRs (not in main until merged)

| PR | State | What it really is | Do this? |
| --- | --- | --- | --- |
| [#1](https://github.com/jojojosephxai/jarvis/pull/1) Movie HUD + live brain | **Merged** | Face + xAI talk + Cursor edits | Done — already on `main` |
| [#2](https://github.com/jojojosephxai/jarvis/pull/2) School + alternate brain | **Draft** | School Chromebook Vercel Grok path; different brain design | **Skip / close** unless you need Jarvis on school PCs without Node |
| [#3](https://github.com/jojojosephxai/jarvis/pull/3) `/roles` skill | **Merged** | Believer/Skeptic/Investor/Judge | Done |
| [#4](https://github.com/jojojosephxai/jarvis/pull/4) This sync doc | Open | `SYNC.md` + pointer in `STATUS.md` | Merge anytime for the written map |

### Brain conflict (only matters if you keep #2)

PR **#2** still rewrites the same brain path as what #1 already put on `main` (`bridge/server.mjs`, `hud/js/app.js`, `bridge-client.js`). Different design (chat prefers Cursor SDK + school `/api`). Do **not** merge #2 on top without picking one architecture. Safer: close #2, or later cherry-pick only `api/` + school docs if you want school chat.

## What Joseph still has to do (not code)

1. **Keys (home):** copy `.env.example` → `.env`
   - `XAI_API_KEY` from https://console.x.ai (SuperGrok chat login is **not** this key)
   - `CURSOR_API_KEY` from https://cursor.com/dashboard/cloud-agents (for file edits)
2. **Confirm practice grid** in the profile (Overnight CONFLICT stays until you resolve it).
3. **Hear the wake line on your PC** — agent VMs often can’t verify TTS audio.
4. Ask coach which four Tetrathlon events (Sep 26 FLAG in profile), if still open.
5. Next product goal (your call): memory + skills so Jarvis helps with school/swim/coding — new work on `main`, not PR #2.

## Agent / chat timeline (same day)

| Chat | Outcome |
| --- | --- |
| Hud consistency and boot | Became PR #1 → **merged** |
| Missing email / Cursor SDK | Built PR #2 (school path) — optional; not required for home Jarvis |
| Cursor subagents → `/roles` | PR #3 → **merged** |
| Movie startup music | Boot motif landed with PR #1 (`hud/js/sfx.js`) |
| Project sync / easy review | This PR (#4) |

## Still needs to be added (real gaps)

1. Persistent **memory** across chats (profile is a start; chat history isn’t)
2. **Skills** for school / swim / calendar / coding help as tools Jarvis can run
3. Overnight **email** automation (Automations + Gmail MCP)
4. True “agents auditing other agents” while laptop is closed
5. Live key proof on Joseph’s machine (wiring is on `main`; not proven in agent VMs)

## Reviewer shortcut

- Want what’s running if you clone today? → **`main`** (movie face + live brain wiring)
- Want the written map? → **PR #4**
- Want school without Node? → pieces of PR #2 only if you still care; else close it
- Want memory + skills for everything? → **new work on `main`**, not an old draft PR

## Multi-model review notes (from PR #1 tip `8b37ea3`)

Still worth fixing on `main` before trusting live Cursor edits from random sites:

1. **Bridge CORS `*`** (`bridge/server.mjs`) — any website can `POST` localhost `:8790` while Jarvis runs; with `CURSOR_API_KEY` that is remote file edit. Restrict origin to the HUD.
2. **HUD swallows Cursor edits** (`parseSelfEdit` before bridge) — phrases like "add a new panel" refuse locally even when Cursor is ONLINE. Return `null` for source edits so `askBridge` runs.
