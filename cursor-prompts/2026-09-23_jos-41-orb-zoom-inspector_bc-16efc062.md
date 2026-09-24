Agent id: bc-16efc062-19bb-5fcf-8383-a79ee991390a
Action: launch
Title: JOS-41 orb rotate/zoom + Inspector polish

--- VERBATIM LAUNCH PROMPT ---
Ship Linear JOS-41 only: https://linear.app/joseph-apo/issue/JOS-41/face-try-gate-orb-rotatezoom-inspector-bleakunreadable

Repo: Origin mr-potato/tmp-310a2048b18e7d16. Start from latest **main** (includes JOS-40 graph pan at ~fbfdef39 — do NOT re-do pan/drag).

## Joseph try-gate (~9:08pm ET)
1) **Orb:** Expected drag/rotate the orb in 3D and zoom in/out. Actual: rotate/zoom missing or not discoverable.
2) **Inspector:** Sparse bleak text dump — INSPECTOR → Vault (Folder), PATH, description, "6 connections" list, footer. Needs readable hierarchy + HUD styling (cyan-on-black cinematic), scannable sections — not bare gray text.

## Acceptance (scope ONLY this)
- Orb: rotate (orbit) with pointer drag
- Orb: zoom in/out (wheel and/or pinch/controls)
- Inspector: readable hierarchy (title / type / path / body / connections)
- Inspector: digestible + good-looking within Face HUD language
- Stay cyan-on-black Iron Man; no gold; ORB + GRAPH modes only

## Out of scope
JOS-40 pan rewrite, Brain/TTS, Graph redesign, Ring/Cube.

## Constraints
- Face/UI only; light for old PC/phone (JOS-6).
- Keep `dev` as `next dev --webpack -p 4721 -H 0.0.0.0`.
- Land on **main**; report final SHA (Origin temp often can’t open PRs).
- Archive exact prompt to `cursor-prompts/2026-09-23_jos-41-orb-zoom-inspector_<bc-short-id>.md` + README pointer. No secrets.

## Verify
localhost:4721 — Dynamic Orb: drag orbits, wheel/pinch zooms; open Graph, click a node — Inspector looks HUD-polished and scannable.

## Report
Main SHA + 1–3 try steps.
--- END ---
