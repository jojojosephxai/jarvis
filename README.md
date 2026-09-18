# Jarvis

Private home for Joseph’s movie-style Jarvis (HUD face, profile, launchers).

## Run it

**School (no Node):** open the Vercel URL — see [`SCHOOL-VERCEL.md`](./SCHOOL-VERCEL.md).

**Home (with Node):**

```bash
npm install
cp .env.example .env   # then paste CURSOR_API_KEY and/or XAI_API_KEY
npm run jarvis:all
```

Or double-click `Start-Jarvis.bat`. Open **http://localhost:8787**.

## Layout

| Path | Purpose |
| --- | --- |
| [`hud/`](./hud/) | Movie HUD face (Vite; also builds for Vercel) |
| [`api/`](./api/) | Vercel Grok brain (`/api/chat`) — school path |
| [`bridge/`](./bridge/) | Local brain: Cursor SDK + optional Grok (port 8790) |
| [`SCHOOL-VERCEL.md`](./SCHOOL-VERCEL.md) | No-Node school setup |
| [`.env.example`](./.env.example) | API key template |
| [`JOSEPH.profile.md`](./JOSEPH.profile.md) | Know-me memory |
| [`Start-Jarvis.bat`](./Start-Jarvis.bat) | One-click launcher (HUD + bridge) |

## Scope

- Jarvis HUD, profile notes, and Jarvis-only tooling
- Private — for Joseph’s use
- Not Atelier (wardrobe app stays in the Atelier repo)
