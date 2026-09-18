# School computer → Vercel (no Node install)

School PCs often block Node. **Use the website instead of localhost.**

## What this is

| Where | Brain | Need Node? |
| --- | --- | --- |
| School browser | **Grok** on Vercel (`XAI_API_KEY`) | No |
| Home with Node | Cursor SDK and/or Grok via `npm run jarvis:all` | Yes |

Cursor SDK does **not** run on Vercel for this HUD. School path = Grok API.

## One-time setup (home / anywhere with Node, or ask Cloud Agent)

1. Repo linked to Vercel project **jarvis** (team Atelier).
2. In Vercel → Project → **Settings → Environment Variables**:
   - `XAI_API_KEY` = key from https://console.x.ai/ (not SuperGrok chat alone)
   - `JARVIS_ACCESS_KEY` = a password only you know (keeps strangers off your key)
3. Redeploy after adding env vars.

## Every day at school

1. Open the preview URL (until PR is merged):  
   **https://jarvis-git-cursor-hud-live-brain-5701-atelier-3d58.vercel.app**  
   After merge, use the production alias from the Vercel dashboard (e.g. `jarvis-atelier-3d58.vercel.app`).
2. If you set `JARVIS_ACCESS_KEY`, type in the HUD: `unlock YOUR_PASSWORD`
3. Talk — mic or type. No localhost. No Node.

**Still needed once (home phone/laptop):** Vercel → jarvis → Settings → Environment Variables → add `XAI_API_KEY` (+ optional `JARVIS_ACCESS_KEY`), then Redeploy. Until then the HUD loads but the brain says “add XAI_API_KEY”.

## Get the xAI key

1. https://console.x.ai/ (home Wi‑Fi if school blocks it)
2. Create API key → copy
3. Paste into Vercel env as `XAI_API_KEY` (not into GitHub, not into chat)

## Privacy

- Don’t post the Vercel URL in group chats if you can avoid it.
- Always set `JARVIS_ACCESS_KEY`.
- Optionally turn on Vercel **Deployment Protection** / password in project settings.
