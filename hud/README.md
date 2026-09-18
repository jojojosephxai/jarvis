# Jarvis HUD — the face

This is **the** Jarvis. There is no second app, no desktop package, and nothing to install
beyond `npm install`. The bar it's held to is in [`../AESTHETIC.md`](../AESTHETIC.md).

## Run

From the repo root:

```bash
npm run jarvis
```

Open **<http://localhost:8787>**.

## What happens on a fresh load

1. **Cold start** — arc reactor ignites, the system log types in, progress climbs.
2. **Visor** — helmet plates seat, the glass catches a reflection, the camera pushes through.
3. **Assemble** — corner frames snap, the topbar drops, panels fly in as plates, the orb blooms.
4. **Overnight audit** — rows type into the right panel with real `OK` / `FLAG` / `CONFLICT` chips.
5. **Wake line** — one short spoken sentence, keyed to the real audit counts.

**Skip** (button) or **Esc** cuts straight to a settled, working HUD with the audit filled in.
`prefers-reduced-motion: reduce` gets the same content with cross-fades instead of flight.

## Files

| File | Job |
| --- | --- |
| `index.html` | Markup for boot, visor, HUD plates, dock |
| `css/jarvis.css` | Design tokens + HUD chrome |
| `css/cinematic.css` | Boot, visor, plate assemble, reduced-motion overrides |
| `css/hex.css` | Hex lattice overlay |
| `js/app.js` | Wiring — voice, commands, state, wake line |
| `js/cinematic.js` | Boot → visor → assemble orchestration (and skip) |
| `js/overnight.js` | The real audit: runs the checks, types the rows |
| `js/profile-data.js` | Distilled Joseph memory + local brain facts |
| `js/wire-orb.js` | Arc-reactor wireframe orb |
| `js/typewriter.js` | Shared typing effect |
| `js/motion.js` | `prefers-reduced-motion` helper |
| `js/stars.js`, `js/sfx.js` | Starfield, boot tones |
| `js/bridge-client.js` | Health check for the optional, not-wired `bridge/` stub |

## Commands the local brain knows

`brief me` · `overnight` · `school tonight` · `swim` · `atelier` · `who am I` · `sleep` ·
`research watch` · `help`

## Honesty

The Overnight panel reports only checks actually performed when the page loaded. It never
claims mail was read or sent, and never claims an agent ran while the browser was closed.
If you add a row, it has to be backed by a real check.

## Updating what Jarvis knows

Edit `../JOSEPH.profile.md` first, then mirror the change into `js/profile-data.js`.
Keep body, weight, and medical detail **out** of the HUD — that's a standing rule.
