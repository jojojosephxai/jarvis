Agent id: bc-f6d1b6d3-4fcd-5f15-882a-d0ebca9ceb3b
Title: Jarvis greenfield v1

--- VERBATIM LAUNCH PROMPT ---
Build Joseph's new Jarvis product from a clean slate in this brand-new private Origin repo.

CRITICAL: Do NOT use, clone, copy, reference, or mirror any existing Jarvis/HUD/Atelier code, docs, aesthetics, or architecture. Treat this as a net-new product with no prior repo history. Invent a clean modern stack yourself.

Product: video-parity personal assistant named Jarvis (Face / Brain / Hands).

v1 goals to implement as a tryable vertical slice (ship something Joseph can open in a browser today, then iterate):
1. FACE — cinematic UI that feels movie-assistant grade (boot / presence / talk surface), polished but performant.
2. BRAIN — chat with an LLM via env-configured API key (prefer xAI / Grok when keyed; graceful local/demo fallback without keys). Include a path toward Obsidian vault retrieval later (design the memory/retrieval interface, stub or minimal local notes retrieval if easy).
3. HANDS — tool framework with receipts: every tool call must show a clear receipt (what ran, inputs, outcome). Include calendar write capability behind a safe mock/demo mode if no calendar credentials exist. Browser/tools can be stubbed with receipts so the UX is real. NO outbound real phone calls in v1.

Hard constraints:
- Must work on phone Safari and a 2019 Intel i5 Chrome (keep JS/CSS light; no heavy desktop-only APIs as the only path).
- Parent bar / low cost: minimal deps, no paid SaaS required to boot the demo.
- Receipts or it didn't happen for any tool.
- Keys only in .env / server side — never commit secrets; ship .env.example.
- Clear README: how to run locally, what works without keys, how to try the face+chat+one tool receipt.

Success criteria:
- Repo boots with one documented command (e.g. npm install && npm run dev).
- Opening the app shows a cinematic Face and a working chat Brain.
- At least one Hands tool runs end-to-end and shows a visible receipt (calendar write can be demo/mock).
- README includes try steps Joseph can finish in under 5 minutes.
- No references to any legacy Jarvis/Atelier HUD project.

Investigate and choose a sensible stack yourself (Next.js/Vite/etc.). Prefer simple and shippable over clever. Commit on main of this new Origin repo and leave clear try instructions in the README.
--- END ---
