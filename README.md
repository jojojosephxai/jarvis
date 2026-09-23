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
3. Press **Graph**. The orb is replaced by an empty note map. It says the vault is not wired yet, with **0 notes · 0 connections**. No sample notes are drawn.
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

Graph stays empty until vault notes exist. It does not invent a map. When a vault folder is set with `OBSIDIAN_VAULT_PATH`, Graph reads those markdown notes, draws links from wikilinks, tags, and folder parents, and lets you open a preview. It will not draw more than 40 notes.

## What it does not do yet

- It does not answer questions
- It does not speak
- It does not send email
- It does not write a calendar
- Ring and Cube views are not built
- It does not create the vault. That stays a separate notes task.

Answering is later brain work. Demo brain and calendar code is still in the repo. The Face does not call it. A Grok key in `.env.local` does nothing on this screen yet.

## Tests

```bash
npm test
```
