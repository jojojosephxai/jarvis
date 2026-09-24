Agent id: bc-e5fe319a-f145-5c3b-948d-4392c8298a0b
Action: launch
Title: JOS-40 Face Graph pan/drag the space

--- VERBATIM LAUNCH PROMPT ---
Ship Linear JOS-40 only: https://linear.app/joseph-apo/issue/JOS-40/face-graph-pandrag-the-space-try-gate-change

Repo: Origin mr-potato/tmp-310a2048b18e7d16. Start from latest **main** (includes 3D graph at ~7afb455).

## Problem
Joseph try-gate: Graph looks better (3D / wires) but the view is stuck — he cannot drag/pan around the graph space.

## Done means (scope ONLY this — light Face pass, NOT a Graph rewrite)
1. Click-drag (or equivalent) pans the graph camera/space.
2. Feel is “grab the space and move it,” not only rotating a locked blob.
3. Keep it light for old PC / phone (JOS-6) — no heavy controls that break the HUD.
4. Preserve existing Orb ↔ Graph modes, thin Talk, cyan/arc Iron Man look, real vault wires.

## Out of scope
Full Graph redesign, Brain/TTS, Ring/Cube, holohands, new node types.

## Constraints
- Face/UI ownership only.
- Keep `dev` as `next dev --webpack -p 4721 -H 0.0.0.0`.
- Origin temp often can’t open PRs — land on **main**, report final SHA.
- Archive this exact prompt to `cursor-prompts/2026-09-23_jos-40-graph-pan_<bc-short-id>.md` + README pointer. No secrets.

## Verify
localhost:4721 → Graph → click-drag pans the space freely; orb mode still fine; phone still usable.

## Report
Main SHA + 1–3 try steps for Joseph.
--- END ---
