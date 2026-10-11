# Jarvis Face — design system (JOS-46)

Docs only. Read this before any UI change. Target frame is **1920×1080 desktop**. Phone is out of scope.

Sources: `face-redesign-spec.md` and `design/superdesign/` (`A-home-speaking.png`, `A-working.png`, `C-graph-function-ref.png`). This file wins over the spec and over the screenshots. The Joseph tweaks — status only under the orb, the ask box, round outlined tool buttons, thicker graph links, and the node-size hierarchy — override any stricter line in the spec or in an older draft of this file. The remaining screenshot conflicts are listed at the end so they are not pulled back toward the pictures.

**Rule: space goes to whatever is in use.** The graph owns the frame while Joseph explores. The orb owns it while Jarvis listens or speaks. A task panel owns it while Jarvis works. Chrome stays thin and floats over the graph. It never becomes a second page beside the graph.

## Color

One navy field, one cyan accent. Rainbow is only the graph type legend.

| Token | Value | Use |
|---|---|---|
| Background | `#03070F` | Full window |
| Center lift | `#071426` | Faint radial toward the middle of the graph |
| Accent | `#49D4FF` | Active cyan |
| Dim | `#1C6F8C` | Resting cyan |
| Line | `rgba(73, 212, 255, .35)` | 1px borders and ticks. Not graph links |
| Graph link | `rgba(73, 212, 255, .85)` | Idle edges, 2px in screen space at the default Fit zoom |
| Text | `#CFEFFF` | Primary type |
| Muted | `#6FA9BF` | Counts, paths, secondary type |
| Glass | `rgba(5, 14, 28, .55)` | Panel fill |

Four glow levels, and no others:

| Level | Look | Use |
|---|---|---|
| Faint | Dim `#1C6F8C` | Resting orb shell, quiet grid |
| Ring | Line at 35% | Borders, tick ring |
| Link | Accent at 85%, 2px | Idle graph edges. They must read at the default zoom |
| Peak | Accent `#49D4FF` at full | Voice peak, selection, the status dot, a traced path |

Do not paint chrome, buttons, the header, or the orb status with the type rainbow.

## Node legend

Every dot is one real vault item. No filler dots and no decorative dots. Color means type. Each type that is actually on the graph appears in **Filter** with a **live** count from the vault. Screenshot counts are mock and are never hardcoded. A type with nothing in the vault is omitted, so every swatch in Filter is a color you can see.

| Type | Color |
|---|---|
| Markdown note | `#3DDC97` |
| Tag / hub | `#C084FC` |
| Person | `#F5C451` |
| Link / URL | `#6AA6FF` |
| File / attachment | `#C6E05A` |
| Journal entry | `#FF6BB5` |
| Decision | `#FF7A45` |

Selection is a peak ring around the node, not an eighth color. Idle graph links use the graph-link token: **2px** in screen space at the default Fit zoom, accent at 85%. That is brighter and thicker than a panel border, so every connection is obvious without zooming in. Do not drop them back to a 1px 35% hairline. A traced path uses peak cyan at the same thickness or thicker.

Hubs are tags. A note may sit in several hubs. A note with no tag falls back to its folder, or to `Unsorted`. The graph dot for a hub still uses the tag/hub color above. **Top Hubs** adds a second, smaller job: a stable color for the row marker and the hub label only. That color is not a Filter entry and is not painted onto note dots.

| Hub | Label color |
|---|---|
| School | `#49D4FF` |
| Swim | `#6AA6FF` |
| Jarvis | `#8EE7FF` |
| People | `#F5C451` |
| Journal | `#FF6BB5` |
| Decisions | `#FF7A45` |
| Unsorted | `#6FA9BF` |

Any other real tag takes the next free color in this order, then repeats: `#C6E05A`, `#C084FC`, `#3DDC97`. Same tag, same color, every load.

## Type

One family: **JetBrains Mono**, self-hosted, everywhere.

| Role | Size | Tracking |
|---|---|---|
| Labels and title strips | 12–13px | `0.08em` |
| Header word `JARVIS` | 13px | `0.08em` |
| Values, counts, body | 12px | `0.04em` |
| Node titles | 12px, never below 11px | `0.04em` |
| Live caption | 18–20px, one line | `0.04em` |

Section labels are uppercase. Node titles and the caption are not. Tracking stays light. Never ultra-spaced, never tiny, never squished. Do not set `J.A.R.V.I.S.` with wide gaps. The word is `JARVIS`. The caption stays on one line and truncates. It does not wrap.

## Lines and panels

Chrome borders are **1px** in the line color. Graph links are the exception: **2px** and brighter (see Color). Panels are see-through glass over the graph: glass fill, 1px border, **2px** radius, **8px** corner ticks. No solid cards, no drop shadows, no thick chrome borders.

Banned: chunky filled buttons, filled pills, and shadows. Chrome controls are words or line icons in a 1px box. The tool row is the exception: round outlined buttons, as in the mockup (see Layout). The active control is marked with a 1px underline or a peak border, not a filled capsule. Slider tracks are 1px. The thumb is a **6px** square of accent cyan.

## Layout

Superdesign **A**, on a full-screen graph. Widths below are for 1920×1080.

**Header**, 32px, no fill, 1px line under it with a center notch.

- Left: `JARVIS`
- Center: `NEURAL OPERATING SYSTEM · v1` in muted text
- Right: `BRAIN GROK-4.7 · VOICE ALTAIR · ● ONLINE`

**Left column**, 232px glass, top left, over the graph.

- Search field, 28px
- One hint line: click a node to focus it, shift-click a second node to trace the path
- **Top Hubs**: hub color, name, live count. Rows 22px, max 8, then scroll. Click focuses that hub
- **Forces**: Repel, Link length
- **Display**: Hubs, Labels, Edges
- Footer: live `N NOTES` and `N LINKS`

**Top center:** `FIT` and zoom in / zoom out, as 1px text controls. Nothing else. No status pill, status box, or status word.

**Filter**, 200px glass, top right. The type legend and live counts. Click a row to show or hide that type.

**Orb dial**, right side. Resting size **160px**, inside a 1px tick ring (ticks every 5°, longer every 30°). Under it, and only under it, **one status mark**: a small glowing accent dot plus one word. The word is `LISTENING`, `SPEAKING`, `WORKING`, or the skill name when a skill is in use (for example `CALENDAR-CHECK`). The dot is peak cyan, about 6px, with a soft glow. The word is 12–13px. The mark follows the orb when the orb grows to the center or docks bottom-right. It is hidden while exploring, unless a skill is already in use. There is no second copy anywhere else on the frame. No on/off toggles and no capability switches. The dial does not carry a settings panel.

**Inspector**, 300px glass, right side, only after a note is clicked. Order: type (dot + label), title, path, excerpt (6 lines), connections (click to jump). Footer: `SHIFT-CLICK ANOTHER NOTE TO TRACE PATH`. Filter stays available.

**Bottom center:** the live caption, then the ask bar, then the tool row.

- Ask bar: always a visible glass box, at rest and while typing. About **560×36px**, 1px border, 24px above the bottom. It does not collapse to a 1px line. Inside, as in the Superdesign mockup: `ASK`, then the example prompts `"remind me…"`, `"good morning"`, and `"show swim times"`, with the arrow glyph at the right end of the box. The caret blinks in the box.
- While typing: the same box holds what Joseph types. The examples step aside. The box stays a box.
- Enter sends. The arrow is the mockup’s glyph inside the box. There is no separate Speak button. Voice runs on its own when it is on.
- Tool row: the mockup’s **round outlined** buttons. Each is a 1px circle with a line icon inside, not a filled disc and not a square. Real actions only. The row in the mockup is mic, copy, eye, calendar, bulb, and gear.

**Chat / Tasks / Log**, glass card, bottom right, three text tabs. The active tab is underlined. The card shows real replies, tasks, or log lines only.

## Graph

The frame is Layout A. The graph inside it behaves like Layout C.

- Edges between real notes are **thicker and brighter** than chrome: 2px in screen space at the default Fit zoom, accent at 85%. Same-hub links hug the cluster. Cross-hub links read as arcs across the middle. A connection that only appears after zooming in is wrong.
- Node size is three steps, plus the source-note bump. Every step stays readable at normal zoom. Nothing is a speck.

| Tier | What | Diameter |
|---|---|---|
| Top hub / category | School, Swim, and the other Top Hubs | 22px, the biggest |
| Subcategory | A tag or folder under a top hub | 16px, one step smaller |
| Source-of-truth note | The canonical note for that hub | 14px, a bit bigger than a normal note |
| Note, file, link | Everything else | 12px, never under 10px |

- A source-of-truth note is placed **right next to its hub**, not drifted out into the cluster. `School-schedule.md` sits beside School. `Swim.md` sits beside Swim. Its title stays on with the hub label.
- Hubs, source-of-truth notes, and other key notes have readable titles (11px minimum). Selected, hovered, hub, and source-of-truth labels win collisions and stay on screen. Other labels drop when they overlap. Labels on the far side of a turned cluster stay hidden.
- Click a note: it focuses and the Inspector opens
- Click a hub, a Top Hubs row, or a search hit: that cluster takes the graph. Every note in it is labeled. The rest dims
- Search, hubs, filters, and focus all work on the real vault
- Shift-click a second note: the shortest path lights in peak cyan and the nodes number 1…n. The Inspector lists the path
- Esc, zoom out past the threshold, or the breadcrumb (`GRAPH / SCHOOL`) closes focus and restores the full graph
- Forces reshape the layout, then it settles and **stops**. It does not drift. It reheats only when a slider or the vault changes

## States

### Explore

The graph takes the space. The orb stays in the right dial at 160px. It does not spin or drift. Fit is available. The status mark under the orb is hidden unless a skill is already in use. There is no top-center status.

### Listening

Joseph is talking. The orb leaves the dial, grows into the center, and reacts to his voice (the tick ring brightens, the listen arc follows the mic). The graph steps back and dims, still visible behind the glass. The only status is under the orb: a glowing dot plus `LISTENING`. The caption shows his words on one line.

### Speaking

Jarvis is talking. The orb stays large and morphs with his voice (the shell moves and brightens with the audio). The caption shows his reply on one line, 18–20px. The status under the orb is a glowing dot plus `SPEAKING`. When speech ends, the orb eases back to the right dial and the graph takes the space again.

### Working

A real task is running. The task panel **slides up** from the bottom into the center, like a terminal pull-up. It does not cut in. The panel takes the space. The graph stays behind it, dimmed. The orb docks **bottom-right** at 160px and stays still except for a voice pulse if he is also speaking. The status under the orb is a glowing dot plus `WORKING`, or the skill name when a skill is in use (for example `CALENDAR-CHECK`). There is no top-center status.

The panel shows only real work: current objective, steps with real timings, context that was actually loaded, model activity, and a progress figure only when a real fraction is known. No fake steps and no fake progress text. `STOP` is a 1px text control on the panel footer. Esc, Stop, or a click on the docked orb closes the panel, and the orb flies back to the right dial.

Chat / Tasks / Log yields while this panel is up. The ask bar yields with it.

## Motion

One curve for every transition, including the orb: `cubic-bezier(.22, 1, .36, 1)`.

Four durations, and no others:

| Token | Duration |
|---|---|
| Fast | 150ms |
| Base | 300ms |
| Slow | 600ms |
| Dock | 700ms |

The spec motion table maps onto those tokens like this.

| Motion | Trigger | Duration |
|---|---|---|
| Breath | Idle, nothing else happening | Brightness ±6% and scale ±1% over 6s. The only idle motion |
| Voice morph | Jarvis’s audio level | Fast. Shell displacement and brightness follow the level |
| Listen arc | Mic open, Joseph’s level | Fast. Ring and arc follow the mic |
| Ack flash | Message sent or heard | Base. One brightness flash, once |
| Work sweep | A real tool or skill step | Base. One sweep. Fills to the real percent when one exists, then stops |
| Hub flash | A note in that hub is read or written | Base |
| Focus | Hub click, Top Hubs, search pick | Slow. Then the cluster unfolds, also Slow |
| Re-form | Esc, zoom out, breadcrumb | Slow, in reverse |
| Grow | Listening or Speaking starts | Slow. Orb grows, graph steps back, together |
| Speak return | Speech ends | Dock. Orb returns to the right dial |
| Dock | Working panel opens | Dock. Orb scales and flies bottom-right. The panel starts sliding up after a Fast delay |
| Undock | Close, Esc, or click the docked orb | Dock, in reverse |
| Turn | Joseph drags the graph | Follows the pointer. Inertia is gone within Slow. Never auto-rotates |
| Settle | Load, slider change, vault change | Runs to rest, then freezes. No drift after |

The orb never spins, tumbles, or drifts on its own. Removed for good: reactor tumble, reactor spin, graph orbit drift, and any auto-rotate. Docking, growing, and the working panel are smooth moves on the shared curve. No jump cuts.

## Where the screenshots lose

- `A-home-speaking.png` leaves the dial small during listening. Listening and Speaking grow the orb, and the graph steps back.
- The frames set `J.A.R.V.I.S.` in wide tracking. Type here is `JARVIS` at 12–13px with light tracking.
- Layout A’s graph is mostly unlabeled dots, and its Filter mixes hubs with types (School, Swim, Files). The graph keeps Layout C’s behaviour inside Layout A: real nodes only, readable labels, and links that are thicker and brighter than the hairlines in the frames. Filter is the seven types with live counts.
- The frames draw most nodes as tiny specks of one size. Node diameter follows the hierarchy in Graph: top hubs biggest, subcategories one step smaller, notes, files, and links smallest but still readable. Source-of-truth notes (`School-schedule.md`, `Swim.md`) are a bit bigger than a normal note and sit beside their hub.
- Counts baked into the frames (284 notes, School 42, and the rest) are mock.
- The frames put a `LISTENING` or `WORKING` pill at top center, next to Fit and zoom. That pill is out. Status is only the glowing dot plus the word under the orb.
- Filled tool buttons and a filled status capsule are out. The tool row keeps the mockup’s round outlined buttons. Other controls stay 1px text or line icons.
- The spec’s ask bar is a 1px line that grows into a field. That line is out. The ask bar is always the mockup’s visible box, with `"remind me…"` and the other example prompts.
- Older phone notes in the spec (sheets, 96px dock, phone type size) are out of scope.

## Out of scope

Phone layouts. Particle counts, bloom tiers, blur budgets, and any other performance cap. Those do not belong in this file.
