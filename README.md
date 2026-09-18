# Jarvis

Joseph's movie-style Jarvis: a cinematic HUD face, a profile that remembers him, and launchers.

**One face, one stack:** [`hud/`](./hud/) is the Jarvis. There is no second app to install,
no desktop package, and nothing to clone. If a doc ever tells you otherwise, that doc is wrong.

## Run it

Double-click Desktop **Start Jarvis.bat**, or this repo's [`Start-Jarvis.bat`](./Start-Jarvis.bat).

Or in a terminal:

```bash
npm install
cp .env.example .env   # paste XAI_API_KEY + CURSOR_API_KEY; see CURSOR-WIRING.md
npm run jarvis
```

Open **<http://localhost:8787>** — boot sequence, visor, HUD assemble, overnight audit, then
talk. Without keys the HUD still runs; answers stay on the local profile until `.env` is filled.

## Layout

| Path | Purpose |
| --- | --- |
| [`hud/`](./hud/) | **The Jarvis face** — cinematic boot + HUD (Vite on port 8787) |
| [`JOSEPH.profile.md`](./JOSEPH.profile.md) | Know-me memory (the source of truth about Joseph) |
| [`AESTHETIC.md`](./AESTHETIC.md) | The look/feel bar the HUD is held to |
| [`STATUS.md`](./STATUS.md) | Honest "what actually works today" |
| [`CURSOR-WIRING.md`](./CURSOR-WIRING.md) | How Cursor Pro does the real work behind the face |
| [`hud/CONTROLS.md`](./hud/CONTROLS.md) | Keyboard / mic controls |
| [`bridge/`](./bridge/) | Live brain — xAI talk + local Cursor file edits. Keys in `.env` only. |
| [`Start-Jarvis.bat`](./Start-Jarvis.bat) | One-click launcher |
| [`.cursor/rules/jarvis-joseph.mdc`](./.cursor/rules/jarvis-joseph.mdc) | Agent persona rules |

## What it will not do

- It will never claim mail was read, drafted, or sent. Nothing here sends mail.
- It will never claim an agent ran overnight. Nothing runs while the browser is closed.
- The Overnight panel only reports checks it actually performed at load time.

## Scope

- Jarvis HUD, profile notes, and Jarvis-only tooling
- Private — for Joseph's use
- **Not Atelier.** The wardrobe app stays in its own repo.
