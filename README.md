# Jarvis

Jarvis is a personal assistant you open in a browser. The screen is the **Face**: a near-black HUD, an orb, a graph of the vault notes, and a box where you talk.

The **brain** answers from the Obsidian vault only. Each answer names the notes it used. If the notes do not say it, Jarvis says so. It does not invent facts and it does not send email.

**Hands** can save a demo calendar event, show a link stub, or ask before send, spend, and delete. Those show a **plan** and then a **receipt**. Calendar writes are auto-approved. Send, spend, and delete wait for a yes.

**Voice** reads the reply already on screen. It uses this computer's voice, or Sonia (British) when an Azure speech key is set. If neither can speak, it says so. Ring and Cube views are not built. No account is required. Phone calls are refused.

## Try it

You need [Node.js](https://nodejs.org) 20 or newer. In this folder, run:

```bash
npm install
npm run dev
```

Open [http://localhost:4721](http://localhost:4721).

1. A short boot plays. Press **Skip** if you want the main screen now.
2. You should see a dark screen and a blue wireframe orb. Face is online. Brain says **Vault** when no key is set, or **grok-4.7** when a key is set. Voice says **Not live** until a speaker is available, or **This computer** if this browser can speak. **Mic** and **Speak** sit next to **Send**.
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

- It does not invent words to speak. **Speak** only reads the reply already on screen, and only when a voice is available.
- It does not send a real email, even after you press yes
- It does not spend real money
- It does not open a live browser
- It does not invent facts that are not in the vault
- Ring and Cube views are not built
- It does not edit the vault notes

## Voice

**Mic** and **Speak** are on the talk box. They do not choose the words. The brain still writes the reply.

Fallback, in order:

1. **Azure Speech**, if `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are set. The default voice is **Sonia** (`en-GB-SoniaNeural`), a British neural voice. Ryan and Libby are the other choices (`AZURE_SPEECH_VOICE`). Azure's free F0 tier includes 0.5 million neural characters a month. The key stays on the server. The reply text is sent to Microsoft to make the audio.
2. **This computer's voice**, through the browser. A British voice is used when the computer has one. If it only has another English voice, the line says so. Nothing is sent off the computer.
3. **Not live.** If Azure is not set and this browser cannot speak, the line under the box says the speaker is not live. The orb does not pretend to talk.

Listening uses the browser's own speech recognition, set to British English (`en-GB`). Chrome and Edge can do this. The mic audio is not uploaded. If this browser cannot listen, **Mic** says so.

**Speak** reads the last vault answer or Hands reply. If there is nothing to read, it says there is nothing to say. With no Azure key, it tries this computer's voice. If that fails, it says nothing was played.

To try it:

1. Look at the line under the talk box, and at the Voice status lamp.
2. Press **Mic** in Chrome or Edge, allow the microphone, and ask a question. The words land in the box and send.
3. Press **Speak** to hear that reply again.
4. To use Sonia, copy the Azure lines from `.env.example` into `.env.local`, then restart `npm run dev`. If the key is missing or rejected, Jarvis says so.

## Tests

```bash
npm test
```
