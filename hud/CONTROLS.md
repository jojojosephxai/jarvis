# Keyboard & gestures

| Input | Action |
| --- | --- |
| **Esc** during boot | Skip the cinematic, land on a working HUD |
| **Skip** button (bottom-right of boot) | Same as Esc |
| **Space** (when not typing) | Toggle the mic |
| **Enter** in the command box | Send |
| **Mic** button | Push-to-talk |
| **Brief me** button | Morning / status briefing |
| **Voice on / off** button | Mute or unmute spoken replies |
| **Double-click the orb** | Re-run the briefing salute |

Spoken or typed: with an xAI key, ask anything. Without it, the local profile knows:

`brief me` · `overnight` · `school tonight` · `swim` · `atelier` · `who am I` · `sleep` ·
`research watch` · `help`

With a Cursor key, HUD/file changes go through a local agent. Without it, only
the safe dials work:

`what can you change` · `make the orb bigger` · `go amber` · `boot faster` ·
`stars off` · `keep the wake line brief` · `reset yourself`

Dials write `hud/jarvis.settings.json`. `git diff` shows it; `git checkout -- hud/jarvis.settings.json` undoes it.

Say **"Hey Jarvis"** before a command and the wake phrase is stripped before it's answered.
