# Cursor launch — Jarvis Face orb redo (JOS-41)

**Repo:** Origin `mr-potato/tmp-310a2048b18e7d16`  
**Branch:** start from `main`, land on `main`  
**Ticket:** JOS-41 (change 2026-10-08). Parent JOS-32.  
**Stack:** Next 16, React 19, Tailwind 4, shadcn. Keep `dev`: `next dev --webpack -p 4721 -H 0.0.0.0`.  
**Ownership:** Face / UI only. One pass. Do not launch other work.

## Goal

Replace the CSS reactor-cage “orb” with a real glowing sphere (tiny WebGL hybrid) and align motion + labels + HUD chrome with Steal Face items and NORTH_STAR. Kill idle spin/tumble/drift. Wire voice pulse to existing Altair / Speak. Add layout hooks so a later pass can shrink the orb to a corner for a terminal panel.

## Architecture (arena winner C)

- One `<canvas>` via **`ogl`** (preferred). If ogl install fails, one raw WebGL2 shader. **No** `three` / R3F / drei.
- Canvas stays a **DOM node** inside a wrapper that can CSS-shrink for Steal #9.
- Cap particles for phone (JOS-6). Respect `prefers-reduced-motion` → static orb, no particles.

## Steal must-match (do not dilute)

- **#3** “Voice you already have — keep xAI / Altair; don’t rebuild voice.” Do not change TTS provider, voice id, or Brain model.
- **#4** “HUD as the face — Iron Man LARP.” Orb is presence; graph is home.
- **#9** “Terminal pull-up animation (HUD) — big center orb shrinks into a corner while a dark log/terminal panel slides or scales in.” This pass: **orb transform hook + empty terminal panel slot** (or CSS classes + layout states `orb-center` | `orb-corner`). Real transform/ease — no jump-cuts. **No** fake scrolling logs. Do not claim terminal is done.
- **#11** “orb pulses with the voice” when Altair / Speak is active; later milestone lines reuse the same pulse. No multi-speed idle spin as “life.”
- **#10** (state only): calm `working` orb mode hook for real progress later — no fake file spam.

## NORTH_STAR motion

Breathe / sweep / ease only. Nothing else noisy.

| State | When | Orb behavior |
|-------|------|----------------|
| **idle / standby** | Default | Still or ≤1 soft breath on core brightness/scale. **No** tumble. **No** forever Y-spin layers. **No** graph camera drift. |
| **listening** | Mic / STT active | Soft outer ring ease or iris widen; calm. |
| **speaking** | Altair / Speak audio playing | **Pulse** core (+ halo) from audio level or speech-active envelope. |
| **ack** | Instant heard / short ack | One quick sweep or brightness flash, then ease back. Replace today’s “spin faster.” |
| **working** | Hands / self-edit progress (hook only) | Slow sweep on a thin arc; calm pulse. |

**Kill:** all `reactor-spin-y-*` infinite animations; `reactor-tumble` infinite; graph `orbitCamera` auto yaw/pitch when not dragging. User drag + wheel/pinch zoom only (existing `orb-rig` pose).

## Visual spec

- Sphere at center of Dynamic Orb: soft core + fresnel/edge glow + thin cyan arc accents + light particle shell (capped).
- Near-black void; cyan / `#49d4ff` arcs; **no gold**; no purple SaaS gradients on chrome.
- Not a flat ring badge. Not the tiny ONLINE dial alone (badge can stay as status chrome; mode orb is the big center presence).
- Optional very slow breath on core brightness/scale only.

## Voice pulse (#3 + #11)

- Wire to existing Speak / Altair playback in `src/lib/voice/` (`new Audio` / session).
- Prefer `AnalyserNode` amplitude → uniform or CSS var; fallback: pulse while `speaking` boolean true if analyser blocked.
- Do **not** rebuild voice / TTS.

## Steal #9 hook (this pass)

- Wrapper supports layout states: **center (full)** ↔ **corner (small)**.
- CSS/transform API or data-attribute so a later pass can slide in a dark terminal/log panel without rewriting the orb.
- Optional: invisible/empty panel slot or off-screen terminal shell. Demo with toggle or data-attr is enough. **No** fake logs.

## Graph labels (same pass)

- Hubs + nearby + hover: always-readable titles (≥ ~11–12px), dark plate or HUD glow behind text, high contrast.
- Collision avoidance / fade far labels; more titles when zoomed in.
- Rainbow **only** for note-type colors; chrome stays cyan.
- No fake nodes. Honest empty vault.
- No idle camera orbit.

## HUD panels (NORTH_STAR)

- ~85–90% viewport = optic (graph or orb).
- Header ≤ ~40px; Talk closed ≤ ~44px; side panels ~240px glass/translucent.
- Short HUD labels; no tutorial essays; no website lamps/pills chrome.
- Inspector: title / type / path / body / connections — cinematic cyan-on-black, scannable.
- ONLINE badge always on; thinner chrome than AI Workshop OS ref.

## Modes

- ORB + GRAPH (+ DYNAMIC if already present) only. No Ring/Cube.
- Today’s modes include `OrbMode = "standby" | "ack"` — extend for listening / speaking / working as needed without inventing extra Face modes.

## Out of scope

Brain/TTS rewrite; Hands OAuth; full terminal product; fake progress text; gold theme; phone/SMS; JOS-40 pan rewrite.

## Acceptance (Joseph try)

1. Dynamic Orb looks like a **sphere/orb**, not flat rings.
2. Idle does **not** spin/tumble/drift on its own.
3. Drag rotate + zoom still work.
4. Speak / Altair: orb **pulses** with voice.
5. Mic listening / ack: calm state change (no frantic spin).
6. Graph: hub/nearby/hover titles readable; no idle camera orbit.
7. Inspector + glass panels match HUD language.
8. Layout supports orb **center → corner** shrink (toggle or data-attr OK); terminal panel can be empty stub.
9. Phone + desktop usable (JOS-6); no heavy particle soup.
10. Land on **main**; report SHA; commit the **exact** prompt used into `cursor-prompts/YYYY-MM-DD_jos-41-orb-redo_<bc-short-id>.md` and add a one-line pointer in `cursor-prompts/README.md` if missing.

## Done when

All acceptance checks pass on main; PR/commit SHA reported; prompt archived under `cursor-prompts/`. Do not expand scope.
