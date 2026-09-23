Agent id: bc-86bacfc0-7ff1-5f91-81e8-acfc4b6f5f01
Action: launch
Title: Face JOS-6 cinematic dark HUD

--- VERBATIM LAUNCH PROMPT ---
Ticket: JOS-6 Face — https://linear.app/joseph-apo/issue/JOS-6/face-cinematic-hud-that-works-on-phone-old-pc

You are shipping on Cursor Origin repo mr-potato/tmp-310a2048b18e7d16 ONLY. Do not touch Atelier or github.com/jojojosephxai/jarvis.

## Goal
Replace the golden scaffold UI with an Iron Man–esque cinematic dark HUD so Joseph feels “this is Jarvis Face,” not a gold landing page, at localhost:4721.

## Must
1. Visual: near-black / dark suit-HUD look; cyan/blue arc-reactor energy accents. NO gold, NO warm luxury chrome. Talk input + status/orb placeholder.
2. Platforms: usable on desktop Chrome + phone Safari; light enough for a 2019 Core i5 — no heavy WebGL fireworks, keep CSS/canvas modest.
3. Honesty: stubs must say brain/voice are not live yet. Do NOT fake chat answers or overnight-email claims. Chat answering is Brain (JOS-10), not this Face ticket — UI may accept input and show an honest “not wired yet” / stub receipt, never invent replies.
4. Dev script: set package.json `scripts.dev` to exactly: `next dev --webpack -p 4721 -H 0.0.0.0` (Turbopack is broken on Joseph’s Windows SWC).
5. Prompt archive: commit this full launch prompt (verbatim) under `cursor-prompts/` as `2026-09-23_face-jos-6_<your-bc-short-id>.md` with agent id, action launch, title, and the prompt. Keep/update a one-line pointer in `cursor-prompts/README.md` if needed.
6. Ship: push to main OR open a PR on Origin — prefer a PR if the visual change is large so Joseph can review; otherwise main is fine if the greenfield habit was main-direct. Either way leave clear try steps in your final report.

## Done when
Joseph can `git pull` in `C:\\Users\\hosef japosef\\Documents\\tmp-310a2048b18e7d16`, run `npm run dev`, open http://localhost:4721 (or phone on LAN via 0.0.0.0), and see dark cinematic Face HUD with talk input + orb/status stub — not gold.

Investigate the existing Face/scaffold UI yourself; discard any “keep the gold, just tweak” approach. Report what changed, branch/PR URL if any, and exact try steps.
--- END ---
