# Jarvis

Jarvis is a personal assistant you open in a browser. The screen is the **Face**: a near-black HUD, an orb, a graph of the vault notes, and a box where you talk.

The **brain** answers from the Obsidian vault only. Each answer names the notes it used. If the notes do not say it, Jarvis says so. It does not invent facts and it does not send email.

**Morning brief** reads the demo calendar and the priority lines written in the vault. If the calendar is empty, or a note is blank, the brief says that. It does not invent events or an overnight email, and it does not call Grok.

**Hands** can save a demo calendar event, show a link stub, or ask before send, spend, and delete. Those show a **plan** and then a **receipt**. Calendar writes are auto-approved. Send, spend, and delete wait for a yes.

Voice is not live. Ring and Cube views are not built. No account is required. Phone calls are refused.

## Try it

You need [Node.js](https://nodejs.org) 20 or newer. In this folder, run:

```bash
npm install
npm run dev
```

Open [http://localhost:4721](http://localhost:4721).

1. A short boot plays. Press **Skip** if you want the main screen now.
2. You should see a dark screen and a blue wireframe orb. Face is online. Brain says **Vault** when no key is set, or **grok-4.7** when a key is set. Voice says not live.
3. Press **Graph**. You should see the notes from the `vault` folder. Click a note to read a short preview. Press **Orb** to bring the orb back. **Ring** and **Cube** say they are not built yet.
4. Type `graph` or `orb` and press **Send** if you want. That only changes the view.
5. Type this and press **Send**:

   `What grade is Joseph in?`

   The reply quotes the vault and ends with the note names, such as About and School. It says 9th grade. It does not invent a school name.

More questions:

- `What is the science fair project about?` — Goals says the project is how light changes how fast plants grow.
- `What time is swim practice?` — Swim leaves the time blank, and the reply says that.
- `Did you email me overnight?` — the notes do not say that. Jarvis says it does not have it. It will not claim an email was sent.

A refresh clears the talk lines. They stay on this screen only.

On a phone using the same Wi-Fi as the computer, the server is open on port **4721**. On Windows, run `ipconfig` in a terminal and look for the IPv4 address, then open `http://that-address:4721` in Safari. If Windows asks about a firewall, allow Node on private networks.

## Hands

These still work. They are not vault answers.

1. Type `Put soccer practice on my calendar tomorrow at 4pm` and press **Send**. A plan says **Auto-approved**, then a receipt says the event was saved on the demo calendar on this computer. The event also shows above the talk log.
2. Type `Open https://example.com` and press **Send**. The receipt status is **stub**. Browser automation is not running, so the page was not opened. The link works only if you click **Open this link yourself**.
3. Type `Send an email to my coach that practice moved to 5` and press **Send**. Nothing is sent. Press **No, don't** for a declined receipt. Press **Yes, do it** only if you want to try. After a yes, the receipt still says no mail was sent, because no mail hand is connected. Typing yes in the box does not send it.
4. `Spend $12 on pizza` waits the same way. After a yes, no money is spent.
5. `Delete soccer practice from my calendar` waits for a yes. **Yes, do it** removes that demo event. **No, don't** leaves it.

## Morning brief

1. Press **Morning brief** above the talk box. Or type `morning brief` and press **Send**.
2. You should see today's date, then two parts: the demo calendar, and priority lines copied from the vault.
3. With no saved events, the brief says the demo calendar is empty. It does not add a fake practice or a meeting.
4. The starter vault is thin. You should see the science fair, soccer after school, and the library book due Friday, copied from Goals and School. Swim practice time stays under **Not written down**.
5. The brief says no mail was read. It will not claim an overnight email.
6. Grok is not called for the brief. If you want Brain to read a note, ask in the talk box. Example: `What time is swim practice?`

Using the brief on three school days is a habit for later. The button and the command are the part that works now.

## Model

The talk model is locked to xAI **grok-4.7**. Claude is not used. grok-4.3 is not used.

1. Copy `.env.example` to `.env.local`.
2. Put your key from [console.x.ai](https://console.x.ai) in `XAI_API_KEY`.
3. Leave `XAI_MODEL` as `grok-4.7`. The server sends that model id even if the line is changed.
4. Stop the server (Ctrl+C) and run `npm run dev` again.
5. The Brain line should say **grok-4.7**.

Grok only sees the notes that matched the question. If its wording adds a fact that is not in those notes, Jarvis drops that wording and shows the local reading instead.

With no key, Jarvis still answers by quoting the notes. A missing key does not block you. Hands still run without a key.

The key stays on the server. It is not sent to the browser. Do not commit `.env.local`.

`XAI_REASONING` can be `none`, `low`, `medium`, or `high`. grok-4.7 uses `low` when that line is empty.

## Notes and Obsidian

The vault is the `vault` folder. Open that folder in Obsidian. See [VAULT.md](VAULT.md).

Brain and the graph both read that folder. Set `OBSIDIAN_VAULT_PATH` in `.env.local` if the notes live somewhere else. Jarvis only reads the vault. It does not change it.

If the folder is missing, the reply starts with **Brain wiring** and does not guess. The graph says the folder is missing and draws nothing.

Question answers are not taken from `data/notes`. Those old files are not the vault.

The answer code is `src/lib/grounded-answer.ts` and `src/lib/vault-read.ts`.

The demo calendar is saved in `data/calendar.json` on this computer only. It is not Apple Calendar or Google Calendar.

## What it does not do

- It does not speak
- It does not send a real email, even after you press yes
- It does not spend real money
- It does not open a live browser
- It does not invent facts that are not in the vault
- Ring and Cube views are not built
- It does not edit the vault notes

## Tests

```bash
npm test
```
