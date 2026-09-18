# Jarvis

Private home for Joseph’s movie-style Jarvis (HUD face, profile, launchers).

## Run it

Double-click Desktop **Start Jarvis.bat**, or this repo’s `Start-Jarvis.bat`.

Or in a terminal:

```bash
npm install
npm run jarvis
```

Open **http://localhost:8787** — boot sequence, then Brief me / school / swim / mic / Space.

## Layout

| Path | Purpose |
| --- | --- |
| [`hud/`](./hud/) | Movie HUD face (Vite on port 8787) |
| [`bridge/`](./bridge/) | Placeholder Cursor SDK bridge (port 8790) |
| [`JOSEPH.profile.md`](./JOSEPH.profile.md) | Know-me memory |
| [`AESTHETIC.md`](./AESTHETIC.md) | Look/feel targets from inspiration reels |
| [`hud/CONTROLS.md`](./hud/CONTROLS.md) | Keyboard / mic controls |
| [`Start-Jarvis.bat`](./Start-Jarvis.bat) | One-click launcher |
| [`.cursor/rules/jarvis-joseph.mdc`](./.cursor/rules/jarvis-joseph.mdc) | Agent persona rules |

## Scope

- Jarvis HUD, profile notes, and Jarvis-only tooling
- Private — for Joseph’s use
- Not Atelier (wardrobe app stays in the Atelier repo)
