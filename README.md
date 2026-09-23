# Jarvis

Jarvis is a personal assistant you can open in a browser. It has three parts:

- **Face** — the screen. A light comes on, then stays in the room while you talk.
- **Brain** — the conversation. With no key, a small demo brain answers. With an xAI key, Grok answers.
- **Hands** — tasks such as saving a calendar event. Every task leaves a **receipt** that says what ran, what went in, and what happened.

No account is required to try it. Phone calls are not part of this version.

## Try it

You need [Node.js](https://nodejs.org) 20 or newer. In this folder, run:

```bash
npm install
npm run dev
```

Open [http://localhost:4721](http://localhost:4721).

1. Watch the light come on, or press **Skip**.
2. The corner says **Brain: demo** when no key is set.
3. Press the first suggestion, or type this and press **Send**:

   `Put soccer practice on my calendar tomorrow at 4pm`

4. Jarvis replies, a **receipt** appears for `calendar.write`, and the event shows under **Demo calendar**.

That is the whole loop: face, chat, and one tool receipt. It should take a few minutes.

Two more things to try:

- `What do my notes say about the science fair?`
- `What's on my calendar?`

Each one leaves its own receipt. `Remember that the library book is due Friday` saves a note on this computer.

## What works with no key

- The face, including the opening
- Demo replies
- Demo calendar (saved in `data/calendar.json` on this computer only)
- Searching the notes in `data/notes`, and saving new notes in `data/user-notes`
- A receipt for every tool

The demo calendar is not Google, Apple, or any other real calendar. Nothing is sent off this computer unless you add a Grok key.

## Optional: talk to Grok

1. Copy `.env.example` to `.env.local`.
2. Put your key from [console.x.ai](https://console.x.ai) in `XAI_API_KEY`.
3. Stop the server (Ctrl+C) and run `npm run dev` again.
4. The corner should say **Brain: Grok**.

The key stays on the server. It is not sent to the browser. Do not commit `.env.local`.

The default model is `grok-4.3`, with reasoning set to `none` so a short chat stays cheaper. You can change `XAI_MODEL` and `XAI_REASONING` in `.env.local`.

If the key is missing or Grok does not answer, Jarvis says so and uses the demo brain. Calendar, notes, and receipts still work.

## Notes and Obsidian

Notes you can search today live in `data/notes`. Notes you save from chat go in `data/user-notes`.

Later, a folder of Obsidian markdown can be searched too. Set `OBSIDIAN_VAULT_PATH` in `.env.local` to that folder. Jarvis only reads it. It does not change the vault. If the folder is missing, the receipt says so and local notes are still searched.

The memory code is in `src/lib/memory.ts`. Local notes and the optional vault folder go through the same search.

## Phone calls

Jarvis does not place phone calls. If you ask it to call someone, it refuses and does not run a tool.

## Tests

```bash
npm test
```
