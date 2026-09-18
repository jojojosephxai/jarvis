# What actually works today

`hud/` is the Jarvis face. Everything below is about that. Run it with `npm run jarvis`
and open <http://localhost:8787>.

## Works

| Thing | Where it lives |
| --- | --- |
| Cinematic boot — reactor, typing system log, progress | `hud/js/cinematic.js`, `hud/css/cinematic.css` |
| Helmet **visor** seat + camera push-through | `hud/css/cinematic.css` (`.visor`) |
| HUD **plate assemble** — frames, topbar, panels, dock, orb bloom | `hud/css/cinematic.css` (`.is-assembling`) |
| **Overnight audit** typed in with real `OK` / `FLAG` / `CONFLICT` rows | `hud/js/overnight.js` |
| Short spoken **wake line**, keyed to the real audit counts | `hud/js/app.js` |
| Arc-reactor orb with idle / listen / think / speak states | `hud/js/wire-orb.js` |
| Voice in (Web Speech) + voice out (browser TTS) | `hud/js/app.js` |
| Mic button, **Space** to talk, **Esc / Skip** to cut the boot | `hud/js/app.js` |
| Typed commands + Brief me, answered by a local brain | `hud/js/app.js`, `hud/js/profile-data.js` |
| Knows Joseph — school, swim, near goals, open questions | `hud/js/profile-data.js` ← `JOSEPH.profile.md` |
| `prefers-reduced-motion` honored end to end | `hud/css/cinematic.css`, `hud/js/motion.js` |
| No Grok Bot, no new subscriptions, anywhere in the path | — |

## Deliberately not built

| Thing | Why |
| --- | --- |
| Overnight email / inbox automation | Nothing in this repo sends or reads mail. Claiming otherwise would be a lie, so the audit says so out loud instead. |
| Cursor SDK as the live brain | `bridge/` is a stub. The Systems panel reads `NOT WIRED`, and the local brain answers. |
| Multi-agent auditing of other agents | Nothing runs while the browser is closed, so there is nothing honest to audit. |
| A downloadable desktop app | A second face means agents follow the wrong stack. See "Paths considered and rejected" in [`AESTHETIC.md`](./AESTHETIC.md). |

## The honest gap

The Instagram reels sell **platforms** that run overnight email agents. This repo is the
**face + memory + school/swim briefing**, running on Cursor Pro with no Grok Bot and no new
subscription. The Overnight panel is a real audit of what was actually checked at load time —
not a fake "your emails are handled" screen.

## Open questions the HUD keeps asking

These come straight from unresolved items in `JOSEPH.profile.md` and show up as
`CONFLICT` / `FLAG` rows until Joseph answers them:

- Which practice grid is current — the evening AG1B grid, or the old morning version?
- Is there a Jan 15–17 meet?
- Which four events at the Sep 26 Tetrathlon?
