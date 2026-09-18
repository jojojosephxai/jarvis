# Project sync — what’s real vs what’s still out

Last checked: 2026-09-18 (preview URLs verified HTTP 200 + screenshots: boot reactor @8%, then live wake line with honest Overnight counts). Source of truth for “is it in the project?” is **`main`**, not draft PRs.

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

## Open PRs (not in main until merged)

| PR | State | What it really is | Mark Ready? |
| --- | --- | --- | --- |
| [#1](https://github.com/jojojosephxai/jarvis/pull/1) Movie HUD + live brain | **Draft** | Cinematic boot, honest Overnight, talk→xAI, edits→Cursor, dials, fluid polish, original boot motif, static Vercel build. **Live preview:** https://jarvis-git-cursor-jarvis-hud-movie-quality-f732-atelier-3d58.vercel.app | **Yes — mark Ready when you want this reviewed/merged** |
| [#2](https://github.com/jojojosephxai/jarvis/pull/2) School + live brain | **Draft** | Local Cursor/Grok chat + Vercel `/api/chat` for school PCs. Preview: https://jarvis-git-cursor-hud-live-brain-5701-atelier-3d58.vercel.app | **Only after you decide how it mixes with #1** |
| [#3](https://github.com/jojojosephxai/jarvis/pull/3) `/roles` skill | Open (not draft) | One markdown skill — Believer/Skeptic/Investor/Judge | Already ready; Vercel check is **green**; safe merge |
| [#4](https://github.com/jojojosephxai/jarvis/pull/4) This sync doc | Draft | `SYNC.md` + honest `STATUS.md` | Merge anytime for the written truth |

### Important conflict

PR **#1** and PR **#2** both rewrite the same brain path (`bridge/server.mjs`, `hud/js/app.js`, `bridge-client.js`, scripts). Different designs:

- **#1:** talk = xAI, file edits = Cursor SDK; movie face polish; home `.env`
- **#2:** chat prefers Cursor SDK (+ optional Grok); adds Vercel school path

Do **not** merge both blindly. Recommended order:

1. Merge **#3** anytime (harmless).
2. Merge **#4** for docs truth.
3. Mark Ready + merge **#1** for the movie face + home live brain.
4. Re-port only school pieces from **#2** (`api/`, school docs, same-origin `/api` client) onto that stack — or close #2 if school isn’t needed yet.

## What Joseph still has to do (not code)

1. **Mark Ready** on PR #1 (and maybe #2 after the conflict decision).
2. **Keys (home, after #1 lands):** copy `.env.example` → `.env`
   - `XAI_API_KEY` from https://console.x.ai (SuperGrok chat login is **not** this key)
   - `CURSOR_API_KEY` from https://cursor.com/dashboard/cloud-agents (for file edits)
3. **Keys (school, if keeping #2):** Vercel project **jarvis** → `XAI_API_KEY`; optional `JARVIS_ACCESS_KEY` then type `unlock …` in the HUD.
4. **Confirm practice grid** in the profile (Overnight CONFLICT stays until you resolve it).
5. **Hear the wake line on your PC** — agent VMs often can’t verify TTS audio.
6. Ask coach which four Tetrathlon events (Sep 26 FLAG in profile), if still open.

## Agent / chat timeline (same day)

| Chat | Outcome |
| --- | --- |
| Hud consistency and boot | Built most of PR #1 (movie + later live brain). Live Grok/Cursor never proven on that machine (no keys). |
| Missing email / Cursor SDK | Built PR #2 after “no Node at school” → Vercel Grok path |
| Cursor subagents → `/roles` | Built PR #3; earlier Vercel fail cleared — checks **pass** now |
| Movie startup music | Earlier run never landed a PR; **original boot motif now on PR #1** (`hud/js/sfx.js`) |
| Demo / video reviews | Confirmed movie boot story on recordings; some demos showed DevTools; one live pass disputed visor (other videos show it) |
| Aesthetic branch `cursor/jarvis-aesthetic-setup-6b63` | Older HUD polish; **no open PR** — superseded by #1 |

## Still needs to be added (real gaps)

1. Overnight **email** automation (Automations + Gmail MCP)
2. True “agents auditing other agents” while laptop is closed
3. One combined school+home brain (merge strategy above)
4. Live key proof on Joseph’s machine (wiring is ready; not proven in agent VMs)

## Reviewer shortcut

- Want movie face? → PR #1  
- Want school without Node? → pieces of PR #2 after #1  
- Want `/roles`? → PR #3  
- Want the written map? → PR #4  
- Want what’s running if you clone today? → **`main` only**


## Live preview evidence (PR #1)

- URL: https://jarvis-git-cursor-jarvis-hud-movie-quality-f732-atelier-3d58.vercel.app
- Boot frame: reactor + SKIP + progress (screenshot `pr1-preview-boot.png`)
- Live frame: arc-reactor orb + wake line naming Joseph, conflict/flag counts, "nothing ran / nothing was sent" (screenshot `pr1-preview-settled.png`)
- Not on `main`: that clone still serves the older HUD + stub bridge only
