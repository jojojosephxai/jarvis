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
2. You should see a dark screen, a blue orb, and three status lines: Face online, Brain not wired, Voice not live.
3. Type anything and press **Send**.
4. Your line shows up, then a stub receipt. It says the brain is not wired yet. There is no chat answer.

A refresh clears those lines. They stay on this screen only.

On a phone using the same Wi-Fi as the computer, the server is open on port **4721**. On Windows, run `ipconfig` in a terminal and look for the IPv4 address, then open `http://that-address:4721` in Safari. If Windows asks about a firewall, allow Node on private networks.

## What this screen does

- Dark suit-style HUD and the orb
- Talk box
- Honest stub receipt when you send

## What it does not do yet

- It does not answer questions
- It does not speak
- It does not send email
- It does not write a calendar

Answering is later brain work. Demo brain and calendar code is still in the repo. The Face does not call it. A Grok key in `.env.local` does nothing on this screen yet.

## Tests

```bash
npm test
```
