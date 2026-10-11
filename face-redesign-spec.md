# Jarvis Face — full visual redesign spec (for Joseph to approve)

Status: **spec only**. No code, no Cursor launch, no Linear "Ready". Replaces `orb-arena.md` / `orb-prompt-master-brief.md` (the ogl orb pass was rejected).
Inputs: Reel Review brief (Joseph-approved 2026-10-08), @maninalabs frames (`/workspace/jarvis/visual-refs/maninalabs_*.jpg`), Zubair AI Workshop OS screenshot, Jarvis mockup (vibe only), repo `NORTH_STAR.md`, Steal.md #3 #4 #9 #10 #11, current Face code.
**Repo:** live repo is Origin **`mr-potato/jarvis`** (main `8aa9858`). This is the remote Joseph's PC pushes to. `tmp-310a2048b18e7d16` is stale (main `cd93581f`), so don't point Cursor there.

---

## 1. Concept

The graph **is** the orb. Jarvis is one glowing sphere: thousands of tiny cyan particles draw its silhouette, and Joseph's real notes sit on and inside it. Each folder or tag hub (School, Swim, Jarvis, People, Journal, Decisions…) owns a region of the sphere. Its notes cluster around it through real links, and cross-topic links arc through the middle. When Jarvis talks, the sphere fills the screen and the particle shell pulses with Altair's voice. Click a hub and the sphere turns and zooms in, then that cluster unfolds into a flat, labeled map. Zoom out and it closes back into a sphere. When a panel opens, the sphere shrinks and flies to the bottom-right corner, and the panel takes the space. Chrome is thin: 1px cyan lines, tick-marked rings, tiny wide-spaced monospace text, and see-through glass that floats **over** the visual. Rule #1: **give the space to whatever is being used.** Every motion means something; nothing spins on its own.

---

## 2. Screen states

| State | What fills the space | Chrome visible |
|---|---|---|
| **Idle (home)** | Sphere centered, ~78% of the short screen side. Hub labels only (tiny caps). Particles breathe slowly. | Header line, thin talk line, outer tick ring |
| **Listening** | Same sphere. The outer tick ring brightens and a mic arc fills with the live mic level. | Talk line expands and shows the live transcript |
| **Speaking** | Sphere grows to ~90% (fills the screen). Particle shell displaces outward with the Altair audio level. | Reply caption: 1–2 lines under the sphere, fades after |
| **Working** | Sphere at ~78%. One thin arc on the outer ring sweeps; if real progress exists, it fills to that %. A hub flashes when a note in it is touched. | Status chip in the header ("WORKING · 2/5") |
| **Graph explore** | Sphere at ~85%, labels on (hubs + nearby + hover). Drag turns it, scroll zooms. | Glass overlays: Search + Top Hubs (left), Filter (right), sliders folded |
| **Cluster focus** | One cluster unfolded flat, filling ~70% of the screen. Every note in it is labeled. Rest of the sphere dims to 15% behind it. | Inspector glass (right) when a note is selected; breadcrumb "SPHERE / SCHOOL" |
| **Panel open (orb docked)** | Panel (terminal, log, note, receipts) takes ~85% of the screen. Sphere docks bottom-right: 160px desktop, 96px phone. It still pulses with voice. | Panel header with close (Esc). Docked orb is clickable to restore. |

**Transitions** (all real interpolations, never jump cuts):
- **Idle → Speaking:** sphere scales 78→90% (500ms ease-out) as the first audio frame arrives; it eases back 700ms after speech ends.
- **Explore → Cluster focus:** camera slerps to face the hub (600ms ease-in-out). Cluster nodes then morph from sphere positions to their flat layout (500ms), and other clusters fade to 15%.
- **Cluster focus → Explore:** reverse order. Flat nodes re-wrap onto the sphere first, then the camera pulls back. Triggered by Esc, scroll-out past threshold, or the breadcrumb.
- **Any → Panel open (Steal #9):** the sphere group scales to dock size and flies along a slight curve to bottom-right (700ms cubic ease-in-out). The panel scales 0.96→1 and fades in, with a 150ms delay. Close reverses it.
- **Graph ↔ Orb:** these are no longer two screens. "Orb" = idle/talk framing and "Graph" = explore framing of the **same** sphere. The mode switch is just a camera + label change (400ms).

---

## 3. Orb–graph mesh mechanics

**Clustering source (real data only)**
1. Hub = top-level vault folder (Journal, jarvis/…) **or** first frontmatter tag for notes in the vault root. Today most of the ~23 notes sit in the root, so tags matter (see open question 1).
2. Fallback for untagged root notes: Louvain community detection on the wikilink graph. These communities get **no** label and no hub dot.
3. A hub dot is drawn only for a real folder/tag. Its size = note count. No invented hubs and no filler notes.

**Layout algorithm** (`d3-force-3d`, deterministic seed)
- Hub anchors: hubs are spread over the sphere with a Fibonacci lattice. Then a few relaxation steps give bigger hubs more surface area.
- Forces per note:
  - `link` follows wikilinks; strength comes from the **Link length** slider.
  - `manyBody` repulsion comes from the **Repel** slider.
  - `forceSphere` pulls each note to radius R with a ±10% shell band. Hubs sit at 0.92R and notes at 0.95–1.05R.
  - `forceCluster` pulls notes toward their hub's direction.
- Cross-hub edges: drawn as curves whose control point is pulled 40% toward the center, so they arc **through** the sphere. Same-hub edges hug the surface.
- The simulation runs to alpha < 0.01, then **stops**: no drift. It re-heats only on slider change or a vault change. Positions are cached per vault hash so the sphere looks the same on every load.
- Cluster unfold: a 2D force layout is precomputed for each hub on its tangent plane. Focus mode interpolates between the sphere and flat positions.
- Scale: small vaults get larger nodes (size ∝ 1/√N, clamped) plus hub halos, so 25 notes still look rich. At 300+ notes, nodes shrink and only hub labels show by default.

**Particles (decoration only)**
- Particles are never clickable and never counted. "25 notes · N links" shows real data only.
- 70% are spread evenly on the shell. 30% are density-weighted toward hub regions, so clusters read as brighter patches like the maninalabs frames.
- One draw call (`THREE.Points` + a small shader). Additive blending; per-particle size and alpha jitter make the "texture".
- Voice: a `uLevel` uniform comes from the existing Altair analyser. It displaces the shell outward with 3D noise and brightens the particles. When idle, a slow breath runs on the same uniform.

**Particle / quality budget per device** (auto-tiered with drei `PerformanceMonitor`, falls back a tier when FPS < 50)
| Tier | Particles | Bloom | DPR | Notes |
|---|---|---|---|---|
| Desktop GPU | 40,000 | yes (postprocessing) | ≤2 | full |
| Laptop / integrated | 15,000 | light | ≤1.5 | full |
| Phone | 5,000 | no (fake glow sprite) | ≤1.5 | labels: hubs + focused cluster only |
| Reduced motion | 3,000 static | no | 1 | no breath, no pulse displacement, instant transitions |

**Label rules** (reuse Joseph's local `labelRank` / `pickLabels`)
- Priority order: selected > hovered > hub > path > neighbor of selected > search match > rest.
- Selected, hovered and hubs are protected: they are never hidden by collisions. Everything else drops on overlap (6px pad).
- When labels show:
  - Idle shows hubs only.
  - Explore adds front-hemisphere notes when zoom ≥ 1.35.
  - Cluster focus labels **every** note in the cluster.
  - Back-hemisphere labels never show.
- Max ~40 labels on screen (phone ~15).
- Labels are HTML overlay text, projected each frame and clamped to the screen edges. Each has a dark plate behind it.

---

## 4. Chrome spec

**Tokens**
- Colors:
  - Background: `#03070F` (near-black navy) with a faint radial lift to `#071426` center.
  - Cyan `#49D4FF`, dim cyan `#1C6F8C`, line `rgba(73,212,255,.35)`.
  - Text `#CFEFFF`, muted `#6FA9BF`.
  - Rainbow **only** on note-type dots and the filter legend. Node colors are a real legend, never decoration: each color = one real thing in the vault — e.g. note (markdown), hub/tag, person, school item, swim item, link/URL, file/attachment, journal entry, decision — and every color shown must appear in the Filter legend with a real count.
- Font: `JetBrains Mono` (self-hosted with `next/font`), one family everywhere.
- Glass: `rgba(5,14,28,.55)`, `backdrop-filter: blur(10px)`, 1px line border, radius 2px, 8px corner tick marks. No fills, shadows or thick borders.
- Text sizes:
  - HUD caps: 11–12px, uppercase, light letter-spacing ~.08em (Joseph 2026-10-10: never ultra-spaced, tiny or squished).
  - Values/body: 12px, .04em.
  - Node labels: 11px, .12em (12px on phone).

**Pieces**
- **Header:** 32px tall, full width, no background. Thin 1px line under it with a center notch.
  - Left: `JARVIS` at ~13px, light tracking ~.08em (not ultra-spaced).
  - Center: `NEURAL OPERATING SYSTEM · v1`.
  - Right: `BRAIN GROK-4.7 · VOICE ALTAIR · ● ONLINE`.
  - Top center under the header: a thin `LISTENING` / `SPEAKING` status bar (Zoey OS ref), visible only when voice is live.
  - Mode switch as text, not buttons: `ORB · GRAPH`, with the active one underlined by 1px.
  - No left button column.
- **Outer ring:** 1px circle around the sphere at 1.08R, with tick marks every 5° and longer ticks every 30°. Tiny hub names are placed on the ring at their angle (the maninalabs look). It doubles as the listening/working arc.
- **Talk:**
  - Idle: a single 1px line, 360px wide, bottom-center, 24px above the edge, with a blinking caret and `ASK JARVIS ·  /  ·  HOLD SPACE TO TALK`.
  - Focus/typing: expands to 560×36px glass with a mic glyph inside.
  - Enter sends. **No Send button, no Speak button.** Speak is automatic when voice is on; a header toggle mutes it.
- **Search + Top Hubs:** glass, top-left, 232px wide, floating over the sphere.
  - Search field 28px.
  - Top Hubs list: hub color dot, name, right-aligned count, 22px rows, max 8, scroll after that.
  - Click a hub to focus that cluster.
- **Filter:** glass, top-right, 200px. Note-type legend with toggle dots and counts.
- **Forces:** folded under the Filter as a `FORCES ▸` row. When open: Repel and Link length sliders, 1px tracks with a 6px square cyan thumb.
- **Inspector:** glass, right, 300px, appears only in cluster focus or when a note is selected.
  - Rows: type chip (dot + caps) → title (14px) → path (10px muted) → excerpt (12px, 6 lines) → connections list (click to jump).
  - Footer hint: `SHIFT-CLICK ANOTHER NOTE TO TRACE PATH`.
- **Path trace:** shift-click a second note. Edges on the shortest path glow and the nodes are numbered 1…n. The Inspector lists the path.
- **Phone:**
  - Header shrinks to `J.A.R.V.I.S ● ONLINE`.
  - Overlays become bottom sheets (Search/Hubs, Filter, Inspector), opened by 3 tiny caps tabs above the talk line.
  - The sphere keeps ≥ 70% of the screen height.

---

## 5. Motion table (each motion has a trigger, nothing loops for decoration)

| Motion | Trigger | Spec |
|---|---|---|
| Breath | Idle, nothing happening | Particle brightness ±6%, scale ±1%, 6s period. The only idle motion. |
| Voice pulse | Altair audio level (`onLevel`) | Shell displacement 0–4% R plus brightness, smoothed 80ms |
| Listen arc | Mic open / live mic level | Outer ring brightens; an arc grows with mic level |
| Ack flash | Message sent / heard | One brightness flash across the shell, 250ms |
| Work sweep | Real tool/agent step in progress | One arc sweeps the ring once per step. It fills to the real % if known and stops when done. |
| Hub flash | A note in that hub is read or written | Hub halo pulse, 400ms |
| Focus ease | Hub click / Top Hubs click / search pick | Camera slerp 600ms, then unfold 500ms |
| Re-form | Esc / zoom out / breadcrumb | Reverse unfold, then camera pull-back |
| Dock fly | Panel opens / closes | Sphere scales and flies to bottom-right, 700ms; panel scales in with 150ms delay |
| Turn | User drags | Rotates with inertia, which decays to 0 in ≤ 800ms. Never auto-rotates. |
| Layout settle | Load, slider change, vault change | Force sim runs to rest (≤ 1.5s), then freezes |

**Removed:** `reactor-tumble`, `reactor-spin-y-*`, graph `orbitCamera` time drift, and any autoRotate.

---

## 6. Recommended stack + why

- **three.js + @react-three/fiber + @react-three/drei.** A real 3D sphere, one camera for every state (idle, explore, focus, dock), instanced nodes, a single-draw-call particle shader, and `PerformanceMonitor` / `AdaptiveDpr` for phone tiers. React state (voice, mode, panel) drives the scene directly.
- **d3-force-3d** for layout (the same engine 3d-force-graph uses), with custom `forceSphere` and `forceCluster` forces.
- **@react-three/postprocessing** for bloom on desktop tiers only.
- **HTML overlay labels** reusing `pickLabels`, rather than in-canvas text: crisp at any DPR, styled with the same mono font, and collision handling already written.
- **Not 3d-force-graph / react-force-graph-3d.** They own the renderer, camera, controls and node objects, which fights the particle shell, the cluster unfold, the docking fly and custom labels. It could look like Obsidian in a day, but the mesh and dock moves would be hacks. We borrow its engine (d3-force-3d) instead.
- **Not ogl.** It's fine for one shader, but it lacks the scene graph, controls and perf tooling this needs. The rejected pass shows the ceiling.
- Keep Next 16 / React 19 / Tailwind 4 for the chrome. Load the canvas with `next/dynamic` and `ssr:false`.

**Joseph's local `face-orb-redo` changes** (uncommitted on his PC). The vault edits must be committed by Joseph before any Cursor pass: they're his real notes, and cloud agents can't see his PC.

| Keep | Drop |
|---|---|
| `src/lib/orb-mode.ts` + test (5 states) | `src/components/orb-canvas.tsx` (ogl orb) |
| `voice/session.ts` `onLevel` analyser + `use-voice.ts` plumbing | `ogl` dependency |
| `graph-layout.ts` `restCamera` (no drift), `labelRank`, `labelEligible`, `pickLabels` + tests | Reactor / orb CSS changes in `globals.css` / `mark.css` |
| Vault note edits, `vault/Journal/`, `vault/jarvis/`, `School-schedule.md` (commit separately) | `vault/_sync-backups-2026-10-08/` (don't commit) |

---

## 7. Build split (3 Cursor passes, in order)

**Pass 0 (Joseph, no Cursor):** commit the vault notes and keepers to a branch on `mr-potato/jarvis` and push. Discard the ogl files.

**Pass 0.5 — `DESIGN.md` design system (first Cursor deliverable, docs only, no visual build).** Approved by Joseph 2026-10-10 (via Reel Review; source: @yanis.himself reel, "no design system = AI breaks the look every few prompts"). `mr-potato/jarvis` has none today (top level is only NORTH_STAR, README, AGENTS, VAULT, WRITEBACK), so every agent guesses the look. Add `DESIGN.md` at repo root, link it from `AGENTS.md` as **must read before any UI change**, and make Passes 1–3 cite it. It locks:
- **Colors:** the §4 tokens (near-black navy `#03070F`, cyan `#49D4FF` + dim/line/text/muted), glow levels (e.g. 3 named steps: faint / ring / peak, with blur radius + opacity each), rainbow allowed **only** for graph note-types. Node colors are a real legend, never decoration: each color = one real thing in the vault — e.g. note (markdown), hub/tag, person, school item, swim item, link/URL, file/attachment, journal entry, decision — and every color shown must appear in the Filter legend with a real count.
- **Type:** one mono family (JetBrains Mono). HUD caps 11–12px, uppercase, light tracking ~.08em (never ultra-spaced, tiny or squished); body 12px; **node titles never below 11px** (12px phone) and always legible over the sphere.
- **Lines:** 1px cyan borders, rings with tick marks; **banned:** chunky filled buttons, pills, drop shadows, thick borders.
- **Status line:** one small line under the orb showing what Jarvis is doing / which skill it is using (no capability toggles).
- **Panels:** see-through glass over the main visual (fill, blur 10px, 1px line border, 2px radius, corner ticks), never side-by-side website columns.
- **Motion (Joseph's top priority):** smooth eased transitions everywhere with fixed tokens (e.g. `fast 150ms`, `base 300ms`, `slow 600ms`, `dock 700ms`; one ease-out curve such as `cubic-bezier(.22,1,.36,1)` + one spring for the orb). Orb morphs/ripples with voice; **no idle spin, no decorative loops** (only the §5 breath); orb docks to a corner when a panel opens; a **LISTENING / SPEAKING status bar at top center**. Every motion maps to a §5 trigger.
- **Layout rule:** space goes to whatever is in use (sphere owns the frame at rest; an opened panel takes the space and the sphere docks).
- **Refs:** @maninalabs orb (look), Zubair AI Workshop OS graph (features), Zoey OS reel (motion + listening/speaking bar) = Steal #9–15.
- **Done when:** the file exists on `main`, AGENTS.md points to it, and Joseph reads it and says ok **before** Pass 1 launches.

**Pass 1 — Sphere engine (orb = graph)**
- Scope:
  - R3F scene, particle shell, real notes clustered on the sphere (d3-force-3d + sphere/cluster forces).
  - Cross-hub arcs; layout settles then freezes.
  - Voice pulse via `onLevel`; states idle/listening/speaking/ack/working.
  - New header + thin talk line (no Send/Speak buttons, no left column).
  - Device tiers; reactor/ogl removed.
- Joseph clicks through:
  1. Load: one sphere fills the screen. You can see real hub regions (School, Swim, Journal…), and hub names sit on the tick ring.
  2. Leave it alone 30s: it only breathes. No spin, no drift.
  3. Ask something with voice on: the sphere grows and the shell pulses in time with Altair.
  4. Drag: it turns, then stops on its own within a second. Scroll zooms.
  5. Count check: the note count in the header matches the vault (~23–25), and no fake dots are clickable.
  6. Phone: opens, sphere ≥ 70% of the screen, smooth.

**Pass 2 — Explore + cluster focus + glass chrome**
- Scope:
  - Glass overlays: Search, Top Hubs with counts, Filter by type, folded Forces sliders (Repel / Link length).
  - Label system (`pickLabels`); click hub → turn + unfold; Inspector; shift-click path trace; Esc/zoom-out re-forms.
- Joseph clicks through:
  1. Top Hubs shows real hubs with real counts; clicking School turns the sphere and unfolds School flat with every title readable.
  2. Click a note: Inspector shows type, title, path, text and connections. Click a connection to jump.
  3. Shift-click a second note: the path lights up and is numbered.
  4. Search "swim" focuses it. Type filter hides that type.
  5. Repel / Link length visibly reshape the sphere, then it settles and stops.
  6. Esc re-forms the sphere. Panels float over the sphere, not beside it.

**Pass 3 — Dock + terminal panel (Steal #9) + polish**
- Scope:
  - Panel system: a real log/receipts/note panel using real Hands receipts and agent progress only, no fake scroll.
  - Sphere fly-to-corner dock and restore; working sweep tied to real steps (Steal #10/#11 hook).
  - Desktop bloom; phone bottom sheets; reduced-motion mode.
- Joseph clicks through:
  1. Open a panel: the sphere smoothly shrinks and flies bottom-right, and the panel takes the space. No jump cut.
  2. While docked, Jarvis speaks: the small orb still pulses.
  3. Click the docked orb or Esc: the panel closes and the sphere flies back.
  4. Run a real Hands action: the ring sweep advances per real step and the touched hub flashes.
  5. Phone: sheets open and close, and the dock works at 96px.
  6. Three-question gate passes: the brain owns the frame, chrome is thinner than Zubair's, and it reads as Jarvis without the word.

Each pass lands on `main`, reports its SHA, and archives its prompt to `cursor-prompts/`. Brain (grok-4.7) and Altair TTS are untouched in every pass.

---

## 8. Joseph's answers (2026-10-10)

1. **Clusters = tags.** Notes can belong to several hubs even when they're in different folders. Notes with no tag fall back to their folder (or `Unsorted`). DESIGN.md defines the hub colors.
2. **One home screen = graph + orb dock (Zubair layout, corrected 2026-10-10).** Home is the Zubair-style clustered graph (search, Top Hubs, filters, Inspector, path trace, forces) with the Jarvis orb docked off to the side like Zubair's dial. When Jarvis is talking or listening, the orb grows big and the graph steps back. When Joseph explores, the graph takes the space and the orb shrinks and slides back to the side. Log or terminal panels follow the same rule. The resizing and moving are always eased, never jump cuts. Space goes to whatever is in use. NORTH_STAR ("graph as home / orb is a mode") already matches this.
3. **Phone is out of scope** for this redesign. Ignore all the phone items in §4, §5 and §7.

---

## 9. Locked visual reference (Joseph, 2026-10-10, Superdesign "Jarvis Face")

Files: `design/superdesign/` (A-home-speaking.png, A-working.png, C-graph-function-ref.png). Live drafts: https://superdesign.dev/share/b02766614cf0a3c806bcf4aba3e829fc2d75aa2cf67b1255892dce9f0593b6f5

- **Base = Layout A.** Left column (hint, Top Hubs with counts, Forces, Display, note/link totals), top-center Fit/zoom toolbar plus status pill, top-right Filter with counts, orb dial on the right with status line under it, Chat/Tasks/Log card at bottom right, big live caption above the ask bar, round tool buttons under it.
- **Loved frames = targets:** "Joseph Speaking" (live caption, LISTENING pill, SKILL status line) and "Working" (center task-execution panel with real steps, timings, context loaded, model activity and progress, orb docked bottom-right, STOP button).
- **Fix A's weak spot with C's graph:** A's graph is mostly unlabeled dots. Use C's graph behaviour inside A's layout: visible edges between real notes, readable labels on hubs and key notes (≥11–12px), clickable notes with Inspector and focus, and colors that are a real legend with counts (markdown note, tag/hub, person, link/URL, file/attachment, journal entry, decision). Every dot is a real vault item; no filler dots.
- Motion stays per §5 and DESIGN.md (eased, voice morph, no idle spin, smooth dock).
