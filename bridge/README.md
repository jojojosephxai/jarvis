# Bridge — optional, not wired

A stub HTTP server sketching what a local **Cursor SDK** bridge would look like if the HUD
ever needed a live model behind it.

**It is not part of the Jarvis face.** `hud/` runs fine without it, answers from its own local
brain, and reports `NOT WIRED` in the Systems panel rather than pretending a brain is attached.
Do not treat this directory as a required setup step.

## What it does today

```bash
npm run jarvis:bridge   # http://127.0.0.1:8790
```

| Route | Response |
| --- | --- |
| `GET /health` | `{ ok: true, brain: "stub", cursor: false }` |
| `POST /api/chat` | `501` — not wired |

The HUD probes `/health` on load with a short timeout. Offline is the normal case and is
reported honestly in the Overnight audit; it is not an error.

## If it ever gets built

1. `npm i @cursor/sdk`, set `CURSOR_API_KEY` from Cursor Dashboard → API Keys.
2. Have `POST /api/chat` forward `{ message }` to a Cursor Agent and return `{ reply }`.
3. Load `JOSEPH.profile.md` into the first system turn so the bridge knows what the HUD knows.
4. Usage bills to Cursor Pro. No Grok Bot, no new subscription.

Until all of that is true, this stays a stub and the docs keep saying so.
