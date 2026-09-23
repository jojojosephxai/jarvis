# Jarvis

Jarvis is a personal assistant you open in a browser. This version is the **Face**: a near-black screen, a cyan energy orb, and a box where you can talk.

The brain and the voice are **not live**. If you type, the screen keeps your words and shows a stub receipt. It will not answer, speak, send email, or run a tool.

## Try it

You need [Node.js](https://nodejs.org) 20 or newer. In this folder, run:

```bash
npm install
npm run dev
```

Open [http://localhost:4721](http://localhost:4721).

1. A short boot plays. Press **Skip** if you want the main screen now.
2. You should see a dark screen, a blue wireframe orb that grows and shrinks, and three status lines: Face online, Brain not wired, Voice not live.
3. Press **Graph**. You should see the notes from the `vault` folder, a note count, and a connection count. Click a note to read a short preview. The brain still does not answer from it.
4. Press **Orb** to bring the orb back. **Ring** and **Cube** say they are not built yet.
5. You can also type `graph` or `orb` and press **Send**. The view changes, and the receipt says the brain is still not wired.
6. Type anything else and press **Send**. Your line shows up, then a stub receipt. There is no chat answer.

A refresh clears those lines. They stay on this screen only.

On a phone using the same Wi-Fi as the computer, the server is open on port **4721**. On Windows, run `ipconfig` in a terminal and look for the IPv4 address, then open `http://that-address:4721` in Safari. If Windows asks about a firewall, allow Node on private networks.

## What this screen does

- Dark suit-style HUD
- **Orb** and **Graph** buttons, or type `orb` / `graph`
- Talk box
- Honest stub receipt when you send

Graph reads the `vault` folder. It does not create notes and it does not change them. How to open that folder in Obsidian is in [VAULT.md](VAULT.md). A line is drawn when one note links to another with `[[wikilinks]]`, when notes share a tag, or when a note has a parent note. It will not draw more than 40 notes. If that folder is missing, the graph says so and draws nothing.

## What it does not do yet

- It does not answer questions
- It does not speak
- It does not send email
- It does not write a calendar
- Ring and Cube views are not built
- It does not edit the vault notes

Answering is later brain work. Demo brain and calendar code is still in the repo. The Face does not call it. A Grok key in `.env.local` does nothing on this screen yet.

## Tests

```bash
npm test
```
