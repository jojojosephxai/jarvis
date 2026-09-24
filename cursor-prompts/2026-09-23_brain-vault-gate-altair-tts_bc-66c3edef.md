# Brain vault-gate fix + Altair Grok TTS

Date: 2026-09-23
Run: bc-66c3edef

Joseph approved this fix for Jarvis on Origin repo mr-potato/tmp-310a2048b18e7d16 (start from latest main).

## Bugs / goals
1) **Brain vault-gate is wrong.** On localhost he typed "hello" and got: "I don't have that in the vault notes... No vault note matched, so nothing was sent to a model." BRAIN chip shows grok-4.7 but the API was never called. Fix: normal chat (greetings, questions, anything) MUST call **grok-4.7** via `XAI_API_KEY` + `GROK_MODEL` (default grok-4.7). Vault notes are **context when relevant**, NOT a hard gate that skips the model. Keep butler persona. Cite vault notes when used; if nothing in vault matches, still answer with the model (do not refuse just because vault had no hit).
2) **Speak still uses Web Speech (Google UK Female).** Wire Speak → **server-side Grok TTS** (`/v1/tts` or the current xAI TTS endpoint the codebase should use) with `XAI_TTS_VOICE_ID` (altair) + `XAI_TTS_SPEED` (clamp 0.7–1.5). **API key never leaves the server / never to the browser.** Web Speech only as fallback when key/voice config is missing.
3) Document in `.env.example` (no secrets): `GROK_MODEL`, `XAI_TTS_VOICE_ID`, `XAI_TTS_SPEED`, and keep documenting `XAI_API_KEY`. Local `.env.local` already has the real values — do not commit secrets.
4) Soft prefer no Claude for Brain; model lock stays xAI grok-4.7.

## Constraints
- Face/UI thin wiring OK for Speak button; Brain change is the retrieval/answer path; Voice/TTS is the speak path. Don’t burn credits on UI-only paths (no model call for pure mode toggles).
- Keep `package.json` `dev` as `next dev --webpack -p 4721 -H 0.0.0.0`.
- This Origin temp repo often cannot open PRs — land work on **main** and report the final main commit SHA.
- Archive this exact launch prompt under `cursor-prompts/2026-09-23_brain-vault-gate-altair-tts_<bc-short-id>.md` and a one-line pointer in `cursor-prompts/README.md`. No secrets.

## Verify
- `npm run dev` → localhost:4721
- Type "hello" → real grok-4.7 reply (not vault-only refusal)
- Vault questions still can use/cite notes when relevant
- Speak uses Altair via server TTS when `XAI_API_KEY` + voice id present; falls back to Web Speech only if missing
- `.env.example` documents the new vars

## Report back
Final main SHA, what changed, 1–3 try steps (git pull / npm run dev / hello + Speak).
