# Jarvis

Jarvis is a personal assistant you open in a browser. The screen is the **Face**: a near-black HUD, an orb, a graph of the vault notes, and a box where you talk.

The **brain** answers from the Obsidian vault only. Each answer names the notes it used. If the notes do not say it, Jarvis says so. It does not invent facts and it does not send email.

Voice is not live. Ring and Cube views are not built.

## Try it

You need [Node.js](https://nodejs.org) 20 or newer. In this folder, run:

```bash
npm install
npm run dev
```

Open [http://localhost:4721](http://localhost:4721).

1. A short boot plays. Press **Skip** if you want the main screen now.
2. You should see a dark screen, a blue wireframe orb, and status lines. Face is online. Brain says **Vault** when no key is set, or **grok-4.7** when a key is set. Voice says not live.
3. Press **Graph**. You should see the notes from the `vault` folder. Click a note to read a short preview. Press **Orb** to bring the orb back.
4. Type this and press **Send**:

   `What grade is Joseph in?`

5. The reply quotes the vault and ends with the note names, such as About and School. It says 9th grade. It does not invent a school name.

Two more questions:

- `What is the science fair project about?` — the Goals note says the project is how light changes how fast plants grow.
- `What time is swim practice?` — Swim leaves the time blank, and the reply says that.
- `Did you email me overnight?` — the notes do not say that, so Jarvis says it does not have it. It will not claim an email was sent.

`graph` or `orb` still switches the view. That does not ask the brain.

On a phone using the same Wi-Fi as the computer, the server is open on port **4721**. On Windows, run `ipconfig` in a terminal and look for the IPv4 address, then open `http://that-address:4721` in Safari. If Windows asks about a firewall, allow Node on private networks.

## Model

The talk model is locked to xAI **grok-4.7**. Claude is not used. grok-4.3 is not used.

1. Copy `.env.example` to `.env.local`.
2. Put your key from [console.x.ai](https://console.x.ai) in `XAI_API_KEY`.
3. Leave `XAI_MODEL` as `grok-4.7`. The server sends that model id even if the line is changed.
4. Stop the server (Ctrl+C) and run `npm run dev` again.
5. The Brain line should say **grok-4.7**.

Grok only sees the notes that matched the question. If its wording adds a fact that is not in those notes, Jarvis drops that wording and shows the local reading instead.

With no key, Jarvis still answers by quoting the notes. A missing key does not block you.

The key stays on the server. It is not sent to the browser. Do not commit `.env.local`.

`XAI_REASONING` can be `none`, `low`, `medium`, or `high`. grok-4.7 uses `low` when that line is empty.

## Notes and Obsidian

The vault is the `vault` folder. Open that folder in Obsidian. See [VAULT.md](VAULT.md).

Brain and the graph both read that folder. Set `OBSIDIAN_VAULT_PATH` in `.env.local` if the notes live somewhere else. Jarvis only reads the vault. It does not change it.

If the folder is missing, the reply starts with **Brain wiring** and does not guess. The graph says the folder is missing and draws nothing.

Question answers are not taken from `data/notes`. Those old files are not the vault.

`Remember that the library book is due Friday` still saves a separate note in `data/user-notes`. That does not write into the vault.

The answer code is `src/lib/grounded-answer.ts` and `src/lib/vault-read.ts`.

## What this screen does not do

- It does not speak
- It does not send email
- It does not edit the vault notes
- Ring and Cube views are not built
- Phone calls are refused

A calendar sentence such as `Put soccer practice on my calendar tomorrow at 4pm` still saves on the demo calendar on this computer. The reply says so. That calendar is not Google or Apple.

## Tests

```bash
npm test
```
