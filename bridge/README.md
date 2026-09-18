# Bridge — live brain (xAI talk + Cursor edits)

The HUD is the face. This process is the brain. `npm run jarvis` starts both.

Keys live in **`.env`** (gitignored). They are never sent to the browser, never
logged, and never committed. Copy [`.env.example`](../.env.example) to `.env`.

## Split

| Job | Where it goes |
| --- | --- |
| Talk, questions, briefing | **xAI Grok** (`XAI_API_KEY` from [console.x.ai](https://console.x.ai)) |
| Change HUD / files / backend | **Cursor SDK local agent** (`CURSOR_API_KEY` from [Cloud Agents → API Keys](https://cursor.com/dashboard/cloud-agents)) |
| No keys / bridge down | Local profile + dials in `hud/` — premade lines, on purpose |

**SuperGrok chat login is not `XAI_API_KEY`.** That key is minted at console.x.ai.
A SuperGrok subscription does not fill this in for you.

Local Cursor agents edit the files on disk (Vite HMR picks them up). Cloud agents
clone GitHub and miss uncommitted HUD work — this bridge does not use them.

## Run

```bash
cp .env.example .env   # then paste keys
npm run jarvis         # HUD :8787 + bridge :8790
```

`npm run jarvis:bridge` starts only the brain. `npm run jarvis:hud` starts only the face.

## Routes

| Route | Response |
| --- | --- |
| `GET /health` | `{ ok, brain: "live"\|"local", xai, cursor }` — key presence only, no model ping |
| `POST /api/chat` | `{ reply, via: "xai"\|"cursor"\|"none" }` or `{ fallback: "local" }` |

Health stays under the HUD's 800ms probe. Chat waits up to a few minutes.

## If a key is missing

- Talk without `XAI_API_KEY` → HUD keeps the local profile (not a fake Grok).
- File edit without `CURSOR_API_KEY` → spoken refusal, nothing written.
- Bad key → spoken error naming console.x.ai or the Cursor dashboard. No silent regex fallback.
