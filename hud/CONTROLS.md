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

Spoken or typed phrases the local brain knows:

`brief me` · `overnight` · `school tonight` · `swim` · `atelier` · `who am I` · `sleep` ·
`research watch` · `help`

Jarvis can also **tune himself** (look and pacing, not his source):

`what can you change` · `make the orb bigger` · `go amber` · `boot faster` ·
`stars off` · `keep the wake line brief` · `reset yourself`

Every change is written to `hud/jarvis.settings.json`. `git diff` shows it; `git checkout -- hud/jarvis.settings.json` undoes it. Asking him to add a panel or rewrite his code is refused — that's Cursor's job.

Say **"Hey Jarvis"** before a command and the wake phrase is stripped before it's answered.
