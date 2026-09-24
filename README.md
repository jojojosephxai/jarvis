# Jarvis

Jarvis is a personal assistant you open in a browser. This version is the **Face**: a near-black screen with a cyan energy orb in the middle, and a thin strip at the bottom where you can talk.

The **brain** calls **grok-4.7** for normal chat when `XAI_API_KEY` is set. Matching vault notes are context, and Jarvis cites them. If no note matches, Jarvis still answers. It does not skip the model just because the vault was quiet. With no key, a local reader quotes the notes instead. It does not send email.

**Morning brief** reads the demo calendar and the priority lines written in the vault. If the calendar is empty, or a note is blank, the brief says that. It does not invent events or an overnight email, and it does not call Grok.

**Hands** can save a demo calendar event, show a link stub, or ask before send, spend, and delete. Those show a **plan** and then a **receipt**. Calendar writes are auto-approved. Send, spend, and delete wait for a yes.

**Voice** reads the reply already on screen. **Speak** uses the Grok voice **Altair** on the server when `XAI_API_KEY` and `XAI_TTS_VOICE_ID` are set. The key stays on the server. If either is missing, Speak uses this computer's voice. If that cannot speak, it says so. There is no Ring view and no Cube view. No account is required. Phone calls are refused.

## Try it

You need [Node.js](https://nodejs.org) 20 or newer. In this folder, run:

```bash
npm install
npm run dev
```

Open [http://localhost:4721](http://localhost:4721).

1. A short boot plays. Press **Skip** if you want the main screen now.
2. You should see a dark screen and a blue wireframe orb in the middle. It spins, and it grows while it is working. Talk is a thin strip at the bottom, not the middle of the screen. Face is online. Brain says **Vault** when no key is set, or **grok-4.7** when a key is set. Voice says **Altair** when Grok speech is set, **This computer** if only the browser can speak, or **Not live** if nothing can speak. **Mic** and **Speak** sit on that strip next to **Send**.
3. Press **Graph**. You should see the notes from the `vault` folder as a cyan galaxy: real dots, real lines, rings behind them. The count matches the vault. Click a dot and the inspector shows the title, the path, and a short preview. Search finds a note. **Most connected** lists the hubs. **All / Notes / Folders** and the folder menu filter the map. **Repel** and **Link length** move the dots. **Fit** frames them. Pick two notes under **Path** to light the steps between them. Press **Dynamic Orb** to put the orb back in the middle. There is no Ring button and no Cube button.
4. Type `switch to dynamic orb` and press **Send**. The orb comes back, even if the same line also says graph. Type `open the vault` or `path from About to School` to open the graph. A normal question, like a grade or the calendar, leaves the graph and returns to the orb. Press **Talk** if you want to hide that line again.
5. Type this and press **Send**:

   `What grade is Joseph in?`

   With a key, grok-4.7 answers and cites the notes, such as About and School. It says 9th grade. With no key, the local reader quotes those same notes.

   Type `hello` and press **Send**. With a key, that is a normal grok-4.7 reply. It is not a vault refusal.

More questions:

- `What is the science fair project about?` — Goals says the project is how light changes how fast plants grow.
- `What time is swim practice?` — Swim leaves the time blank, and the reply says that.
- `Did you email me overnight?` — the notes do not say that. With no key, Jarvis says the vault does not have it. With a key, grok-4.7 still answers, and it does not claim an email was sent.

A refresh clears the talk lines. They stay on this screen only.

On a phone using the same Wi-Fi as the computer, the server is open on port **4721**. On Windows, run `ipconfig` in a terminal and look for the IPv4 address, then open `http://that-address:4721` in Safari. If Windows asks about a firewall, allow Node on private networks.

## Hands

These still work. They are not vault answers. The orb stays in the middle. The talk strip opens just enough to show the plan.

1. Type `Put soccer practice on my calendar tomorrow at 4pm` and press **Send**. A plan says **Auto-approved**, then a receipt says the event was saved on the demo calendar on this computer. The event also shows in the talk strip.
2. Type `Open https://example.com` and press **Send**. The receipt status is **stub**. Browser automation is not running, so the page was not opened. The link works only if you click **Open this link yourself**.
3. Type `Send an email to my coach that practice moved to 5` and press **Send**. Nothing is sent. Press **No, don't** for a declined receipt. Press **Yes, do it** only if you want to try. After a yes, the receipt still says no mail was sent, because no mail hand is connected. Typing yes in the box does not send it.
4. `Spend $12 on pizza` waits the same way. After a yes, no money is spent.
5. `Delete soccer practice from my calendar` waits for a yes. **Yes, do it** removes that demo event. **No, don't** leaves it.

## What you see

- **Dynamic Orb** or the graph owns the middle. Boot opens on the orb
- **Dynamic Orb** and **Graph** only. There is no Ring button and no Cube button
- Talk is a thin strip. Press **Talk** to open the words. It does not take the center
- Lines on the graph come from folder parents, `[[wikilinks]]`, and shared tags. Notes with no links still connect to their folder. The map will not draw more than 40 notes, and an empty vault stays empty

## Morning brief

1. Press **Talk**, then **Morning brief**. Or type `morning brief` and press **Send**.
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
3. Leave `GROK_MODEL` as `grok-4.7`. The server sends that model id even if the line is changed.
4. Stop the server (Ctrl+C) and run `npm run dev` again.
5. The Brain line should say **grok-4.7**.

Greetings and other questions call grok-4.7. Matching vault notes are sent along as context, and the reply cites them. If nothing in the vault matches, grok-4.7 still answers.

With no key, Jarvis still answers by quoting the notes. A missing key does not block you. Hands still run without a key. The morning brief still does not call Grok.

The key stays on the server. It is not sent to the browser. Do not commit `.env.local`.

`XAI_REASONING` can be `none`, `low`, `medium`, or `high`. grok-4.7 uses `low` when that line is empty.

## Notes and Obsidian

The vault is the `vault` folder. Open that folder in Obsidian. See [VAULT.md](VAULT.md).

Brain and the graph both read that folder. Set `OBSIDIAN_VAULT_PATH` in `.env.local` if the notes live somewhere else.

You can also tell Jarvis to remember something. That writes a line into this folder. See [WRITEBACK.md](WRITEBACK.md).

1. Type `Remember that I like quiet reminders` and press **Send**.
2. Open `vault/Preferences.md`. The new line is there. The reply names the file and does not read the note back. It tells you to ask what changed.
3. Type `what changed` and press **Send**. The reply names `Preferences.md` and the line you saved.

A password or a long rewrite waits for **Yes, do it** before anything is written. Edits you make in Obsidian are not read out on their own. Ask `what changed` when you want that receipt.

If the folder is missing, the reply starts with **Brain wiring** and does not guess. The graph says the folder is missing and draws nothing.

Question answers are not taken from `data/notes`. Those old files are not the vault.

The answer code is `src/lib/grounded-answer.ts` and `src/lib/vault-read.ts`.

The demo calendar is saved in `data/calendar.json` on this computer only. It is not Apple Calendar or Google Calendar.

## What it does not do

- It does not invent words to speak. **Speak** only reads the reply already on screen, and only when a voice is available.
- It does not send a real email, even after you press yes
- It does not spend real money
- It does not open a live browser
- It does not skip grok-4.7 just because a vault note missed, when a key is set
- It does not invent a note citation. Personal facts it cites come from the vault
- There is no Ring view and no Cube view
- It does not read a vault write back unless you ask `what changed`

## Voice

**Mic** and **Speak** are on the talk box. They do not choose the words. The brain still writes the reply.

Fallback, in order:

1. **Grok speech (Altair)**, if `XAI_API_KEY` and `XAI_TTS_VOICE_ID` are set. The server calls `https://api.x.ai/v1/tts`. `XAI_TTS_SPEED` is clamped between 0.7 and 1.5. The key stays on the server. The reply text is sent to xAI to make the audio. The browser only receives the sound.
2. **This computer's voice**, through the browser, when the key or the voice id is missing, or when Grok speech fails. A British voice is used when the computer has one. Nothing is sent off the computer for that fallback.
3. **Not live.** If Grok speech is not set and this browser cannot speak, the line under the box says the speaker is not live. The orb does not pretend to talk.

Listening uses the browser's own speech recognition, set to British English (`en-GB`). Chrome and Edge can do this. The mic audio is not uploaded. If this browser cannot listen, **Mic** says so.

**Speak** reads the last reply. If there is nothing to read, it says there is nothing to say. With no Grok voice, it tries this computer's voice. If that fails, it says nothing was played.

To try it:

1. Look at the line under the talk box, and at the Voice status lamp. With Altair configured it says **Altair**.
2. Press **Mic** in Chrome or Edge, allow the microphone, and ask a question. The words land in the box and send.
3. Press **Speak** to hear that reply again in Altair.
4. Copy `XAI_TTS_VOICE_ID` and `XAI_TTS_SPEED` from `.env.example` into `.env.local` next to `XAI_API_KEY`, then restart `npm run dev`. If the key or voice id is missing, Speak uses this computer's voice.

## Tests

```bash
npm test
```
