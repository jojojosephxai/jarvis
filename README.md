# Jarvis

Jarvis is a personal assistant you can open in a browser. It has three parts:

- **Face** — the screen. A light comes on, then stays in the room while you talk.
- **Brain** — answers questions from the Obsidian vault only. Each answer names the notes it used. If a note does not say it, Jarvis says so.
- **Hands** — tasks such as saving a calendar event. Every task leaves a **receipt** that says what ran, what went in, and what happened.

No account is required to try it. Phone calls are not part of this version. Jarvis does not send email.

## Try it

You need [Node.js](https://nodejs.org) 20 or newer. In this folder, run:

```bash
npm install
npm run dev
```

Open [http://localhost:4721](http://localhost:4721).

1. Watch the light come on, or press **Skip**.
2. The corner says **Brain: vault** when no key is set.
3. Ask something the notes already say, then press **Send**:

   `What grade is Joseph in?`

4. The reply quotes the vault and ends with the note names, such as School or About. It does not invent a school name.

Two more questions:

- `What is the science fair project about?` — Goals and School mention light and plant growth.
- `What time is swim practice?` — Swim leaves the time blank, and the reply says that.
- `Did you email me overnight?` — the notes do not say that, so Jarvis says it does not have it. It will not claim an email was sent.

Calendar still works:

`Put soccer practice on my calendar tomorrow at 4pm`

That leaves a receipt for `calendar.write`. The event shows under **Demo calendar**.

## What works with no key

- The face, including the opening
- Answers read from the `vault` folder
- A clear **Brain wiring** reply if that folder is missing
- Demo calendar (saved in `data/calendar.json` on this computer only)
- Saving a note in `data/user-notes` when you say `Remember that...`
- A receipt for calendar tasks and saved notes

The demo calendar is not Google, Apple, or any other real calendar. Question answers are not taken from `data/notes`. Those old files are not the vault.

Nothing is sent off this computer unless you add a Grok key.

## Model

The default needs no key and no Claude. Jarvis reads the vault notes and quotes the lines that match the question. That reader is free.

If you want Grok to word the same notes:

1. Copy `.env.example` to `.env.local`.
2. Put your key from [console.x.ai](https://console.x.ai) in `XAI_API_KEY`.
3. Stop the server (Ctrl+C) and run `npm run dev` again.
4. The corner can say **Brain: Grok + vault**.

The default model is `grok-4.3`, with reasoning set to `none`, so a short reply stays cheaper. You can change `XAI_MODEL` and `XAI_REASONING` in `.env.local`. Claude is not used.

Grok only sees the notes that matched the question. If its wording adds a fact that is not in those notes, Jarvis drops that wording and shows the local reading instead. A missing key does not block anything.

The key stays on the server. It is not sent to the browser. Do not commit `.env.local`.

## Notes and Obsidian

The vault is the `vault` folder. Open that folder in Obsidian. See `vault/README.md`.

Brain reads that folder for answers. Set `OBSIDIAN_VAULT_PATH` in `.env.local` if the vault lives somewhere else. A relative path is from the project folder. Jarvis only reads it. It does not change the vault.

If the folder is missing, the reply starts with **Brain wiring** and does not guess.

`Remember that the library book is due Friday` still saves a separate note in `data/user-notes`. That does not write into the vault. Putting a fact into the vault is later work.

The answer code is `src/lib/grounded-answer.ts` and `src/lib/vault-read.ts`.

## Phone calls

Jarvis does not place phone calls. If you ask it to call someone, it refuses and does not run a tool.

## Tests

```bash
npm test
```
