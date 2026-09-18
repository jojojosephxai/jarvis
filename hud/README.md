# Jarvis HUD (in-repo movie face)

Cinematic boot + Iron Man–style HUD that already knows Joseph from `../JOSEPH.profile.md` (distilled into `js/profile-data.js`).

## Run

From the repo root:

```bash
cp .env.example .env   # add CURSOR_API_KEY and/or XAI_API_KEY
npm run jarvis:all
```

Open **http://localhost:8787**

## What you get (reel / movie checklist)

- Full-screen **boot sequence** (reactor rings, system log, progress)
- **JARVIS** brand-first HUD (cyan / black — not purple chat UI)
- Arc-reactor **orb** with idle / listen / speak states
- **Briefing** panel from your schedule (school + UMLY)
- Mic via Web Speech + typed commands
- Spoken replies (browser TTS)
- **Live brain** via bridge (Cursor SDK preferred, optional xAI Grok)

## Brain status (sys pill)

| Pill | Meaning |
| --- | --- |
| CURSOR / GROK | Live answers |
| NO KEY | Bridge up, `.env` missing keys |
| OFF | Bridge not running — use `jarvis:all` |

## Profile updates

Edit `hud/js/profile-data.js` after changing `JOSEPH.profile.md` (keep body/medical stats out of the HUD per your omit rule). The bridge also reads `JOSEPH.profile.md` into the live system prompt.