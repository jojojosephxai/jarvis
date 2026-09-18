# Aesthetic bar — MCU J.A.R.V.I.S.

The target is the movie, not a chat app and not an Instagram SaaS demo. Everything
below describes **`hud/`**, which is the one and only Jarvis face in this repo.

## The five things that make it read as Jarvis

| Element | What it has to feel like |
| --- | --- |
| **Helmet visor** | You are *inside* the helmet. Plates seat with weight, glass catches a reflection, then the camera pushes through the visor into the HUD. |
| **Ice-cyan palette** | Cold white-blue on near-black. Amber only for "listening" and warnings. Never teal, never purple, never a pastel chat bubble. |
| **Arc-reactor orb** | A live wireframe core in the center of the stage that reacts to idle / listening / thinking / speaking. |
| **Hologram plates** | Panels are machined plates that fly in, seat, and settle — not divs that fade in. |
| **Steward voice** | Dry, brief, British-leaning. Answers first. Never "Sure! I'd be happy to help!" |

## Motion rules

- **Heavy and precise.** Long ease-out curves (`cubic-bezier(0.16, 1, 0.3, 1)`),
  tiny settle, no bounce-house overshoot. Machinery, not jelly.
- **Staggered, never simultaneous.** Plates arrive in sequence so the eye can read the assembly.
- **Nothing is instant and nothing is slow.** Boot-to-usable stays under ~11 seconds, and
  **Skip / Esc** must always cut straight to a working HUD.
- **`prefers-reduced-motion: reduce` is honored.** Same content, same audit, same spoken
  line — cross-fades instead of flight, no zoom, no scan sweep, no parallax.

## Boot sequence (the required order)

1. **Cold start** — arc reactor ignites, system log types in, progress climbs.
2. **Visor** — helmet plates seat, glass reflection flickers, camera pushes through.
3. **Assemble** — corner frames snap, topbar drops, plates fly in, orb blooms open.
4. **Overnight audit** — rows type into the right panel with real `OK` / `FLAG` / `CONFLICT` chips.
5. **Wake line** — one short spoken sentence from a steward, keyed to the real audit counts.

## Honesty rules (non-negotiable)

The reels sell overnight email agents. We do not have those, so **we never pretend to**.

- Never claim mail was read, drafted, or sent. Nothing sends mail from this repo.
- Never claim an agent ran overnight. Nothing runs while the browser is closed.
- The Overnight panel is an **audit of things actually checked at load time** — voice API
  support, bridge reachability, last local session, and unresolved items in
  `JOSEPH.profile.md`. If a row can't be verified, it doesn't ship.
- `CONFLICT` rows come from real unresolved disagreements in the profile. They stay until
  Joseph resolves them — the HUD does not guess which version is true.

## Paths considered and rejected

Early notes in this repo pointed at other projects as the face. They are **not** the plan
and should not be installed; keeping two faces around means an agent can follow the wrong one.

| Option | Why not |
| --- | --- |
| **OpenDex desktop app** | Needs a paid model API key to be useful (a SuperGrok *chat* plan is not an xAI API key), can't be themed to Joseph's school/swim context, and can't be edited in Cursor. |
| **jarvis-home** | Nice Earth-zoom boot, but cloning a second full project into this repo creates exactly the two-stacks problem this file exists to prevent. |
| **Paid "comment JARVIS" SaaS** | New subscription. Out of bounds. |

The boot ideas from those projects were kept; the projects were not.

## Non-goals

- Anything social, public, or shareable. This HUD is private.
- Sending mail, posting, or changing accounts.
- Real AR / see-through holograms.
- Grok Bot in the critical path.
