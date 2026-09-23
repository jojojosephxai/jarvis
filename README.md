# Jarvis

Jarvis is a personal assistant you open in a browser. This version is the **Face**: a near-black screen, a cyan energy orb, and a box where you can talk.

The brain and the voice are **not live** for ordinary chat. If you type a normal sentence, the screen keeps your words and shows a stub receipt. It will not answer or speak.

**Hands** are live for a few tasks. A calendar save, a link, or a send, spend, or delete shows a **plan** and then a **receipt**. Calendar writes are auto-approved. Send, spend, and delete wait for a yes.

No account is required. Phone calls are not part of this version.

## Try it

You need [Node.js](https://nodejs.org) 20 or newer. In this folder, run:

```bash
npm install
npm run dev
```

Open [http://localhost:4721](http://localhost:4721).

1. A short boot plays. Press **Skip** if you want the main screen now.
2. You should see a dark screen, a blue wireframe orb that grows and shrinks, and three status lines: Face online, Brain not wired, Voice not live. The note under them says Hands can still run.
3. Press **Graph**. You should see the notes from the `vault` folder, a note count, and a connection count. Click a note to read a short preview. The brain still does not answer from it.
4. Press **Orb** to bring the orb back. **Ring** and **Cube** say they are not built yet.
5. You can also type `graph` or `orb` and press **Send**. The view changes, and the receipt says the brain is still not wired.
6. Type anything else, such as `Who are you?`, and press **Send**. Your line shows up, then a stub receipt. There is no chat answer.

A refresh clears those lines. They stay on this screen only.

On a phone using the same Wi-Fi as the computer, the server is open on port **4721**. On Windows, run `ipconfig` in a terminal and look for the IPv4 address, then open `http://that-address:4721` in Safari. If Windows asks about a firewall, allow Node on private networks.

## Hands

7. Type `Put soccer practice on my calendar tomorrow at 4pm` and press **Send**. A plan says **Auto-approved**, then a receipt says the event was saved on the demo calendar on this computer. The event also shows above the talk log.
8. Type `Open https://example.com` and press **Send**. The receipt status is **stub**. Browser automation is not running, so the page was not opened. The link works only if you click **Open this link yourself**.
9. Type `Send an email to my coach that practice moved to 5` and press **Send**. Nothing is sent. Press **No, don't** for a declined receipt. Press **Yes, do it** only if you want to try. After a yes, the receipt still says no mail was sent, because no mail hand is connected. Typing yes in the box does not send it.
10. `Spend $12 on pizza` waits the same way. After a yes, no money is spent.
11. `Delete soccer practice from my calendar` waits for a yes. **Yes, do it** removes that demo event. **No, don't** leaves it.

## What this screen does

- Dark suit-style HUD
- **Orb** and **Graph** buttons, or type `orb` / `graph`
- Talk box
- Honest stub receipt when you send a normal sentence
- A plan and a receipt when Hands run
- A yes/no gate before send, spend, or delete

Graph reads the `vault` folder. It does not create notes and it does not change them. How to open that folder in Obsidian is in [VAULT.md](VAULT.md). A line is drawn when one note links to another with `[[wikilinks]]`, when notes share a tag, or when a note has a parent note. It will not draw more than 40 notes. If that folder is missing, the graph says so and draws nothing.

The demo calendar is saved in `data/calendar.json` on this computer only. It is not Apple Calendar or Google Calendar.

## What it does not do yet

- It does not answer questions
- It does not speak
- It does not send a real email, even after you press yes
- It does not spend real money
- It does not open a live browser
- Ring and Cube views are not built
- It does not edit the vault notes

Answering is later brain work. A Grok key in `.env.local` does nothing on this screen yet. Hands still run without that key.

## Tests

```bash
npm test
```
