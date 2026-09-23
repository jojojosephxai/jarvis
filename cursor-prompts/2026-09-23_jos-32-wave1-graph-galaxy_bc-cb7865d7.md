Agent id: bc-cb7865d7-d31f-593a-9406-06adc12202b3
Action: launch
Title: JOS-32 Wave 1 Graph galaxy

--- VERBATIM LAUNCH PROMPT ---
You are shipping Linear JOS-32 (Wave 1 under epic JOS-31) on this Origin repo only: mr-potato/tmp-310a2048b18e7d16.

## Ticket
https://linear.app/joseph-apo/issue/JOS-32/wave-1-graph-galaxy-dynamic-orb-graph-modes

## Goal
Dense **vault galaxy** Graph (demo-density chrome, keep cyan/arc Iron Man — no gold) plus **Dynamic Orb ↔ Graph** mode switch + auto rules. Do NOT wait on JOS-23 Face try feedback. Builds on / supersedes the thin Graph stub from JOS-22 / JOS-23 (orb-center + thin Talk already on main).

## Done means (ship all of these)
1. Vault → graph: notes = nodes; edges from `[[wikilinks]]` + folder parents (tags if easy).
2. Search that finds/focuses nodes.
3. Inspector on node click (title + preview / path).
4. Top hubs (most-connected) visible or listable.
5. Type filters (e.g. by folder/type).
6. Layout controls: repel + link-length (or equivalent), Fit, focus + path highlight between notes.
7. Look: denser like a Zubair-demo vault galaxy while keeping cyan/arc Iron Man HUD (near-black, no gold).
8. Modes:
   - Toggle Dynamic Orb ↔ Graph (UI + voice/intent hooks if talk path exists).
   - Phrase "switch to dynamic orb" always wins (wire the intent; stub OK if STT not live).
   - Auto → Orb when not in vault/graph work.
   - Vault/path asks open Graph.
9. Dynamic Orb = cinematic center orb + **thin** Talk (preserve JOS-23 layout intent: orb owns middle, Talk is a short bottom strip — do not let Talk dominate again).
10. Honest empty vault; no fake hundreds of nodes.

## Out of scope
Ring/Cube, holohands, phone/SMS/Telegram, Tool Armory, screen share/takeover, Brain model changes.

## Hard constraints
- Face/UI ownership only: app shell, components, styles, graph viz. Do NOT rewrite vault markdown content, Brain retrieval model, or Hands/Voice backends except thin UI wiring for mode intents.
- Keep `package.json` script `dev` as `next dev --webpack -p 4721 -H 0.0.0.0` (Turbopack broken on Joseph’s Windows).
- Soft prefer no Claude for app Brain; Brain stays grok-4.7 via XAI_API_KEY — do not swap.
- This Origin temp repo often cannot open PRs. Land work on **main**: finish on a branch, then merge/push to main yourself (or leave a clear merge SHA). Report the final main commit SHA.
- After implementing, commit the **exact** launch prompt into `cursor-prompts/2026-09-23_jos-32-wave1-graph-galaxy_<your-bc-short-id>.md` with agent id, action=launch, title, and verbatim prompt. Keep a one-line pointer in `cursor-prompts/README.md` if missing. No secrets.

## Verify
- `npm install` + `npm run dev` serves http://localhost:4721
- Boot → Dynamic Orb: cyan orb centered, thin Talk strip, no Ring/Cube
- Switch to Graph: dense note galaxy with real edges from vault notes; search, filters, hubs, layout controls, Fit, path highlight, click → inspector
- Empty vault still honest (empty state, not fake nodes)
- "switch to dynamic orb" / Orb toggle returns to center orb

## Report back
Final main SHA, what shipped, 1–3 try steps for Joseph (git pull / npm run dev / localhost:4721), anything blocked.
--- END ---
