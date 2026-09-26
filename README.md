# Jarvis

A local Iron Man board with a dense cloud of notes, the way Zubair puts a butler beside a second brain. Ask in plain language. For the clock, the color, and the graph, Jarvis asks one short question, then waits. Say **ok** or **change** to apply it. Say **stop** to cancel. Say **be quiet** or **hold on** and he stops talking.

The phrases he already understands are in [PHRASES.md](PHRASES.md). Those do not need another code change.

There is no phone, no texts, and no clicking around other websites. The graph uses the real files in the `notes` folder, and each node is labeled with its `.md` name.

- Drag to pan. Hold Shift, or the right mouse button, to turn it. Scroll to zoom.
- Click a node to fly to it. Double-click to open the file. Right-click to inspect it.
- Pull up a note, then say **read it out loud**.
- **check the calendar** and **book science fair friday** stay on this computer.
- **start a focus timer** counts down on the board. Say **stop the focus timer** to end it.
- **open your eyes** asks the browser for the camera. **look at my screen** takes one picture and describes it. He does not click anything.
- **switch to grok 3** changes the reactor core. Grok 4, Grok 3, and Grok 2 are the choices.
- Before he answers, a small score line shows vault, finished, address, action, and inside.

## Run it

```bash
npm install
npm run dev
```

Open [http://localhost:4721](http://localhost:4721).

## Grok key

Put the key in `.env.local` in this folder. It stays on the machine and is not saved in the project.

```bash
XAI_API_KEY=your-key-here
XAI_MODEL=grok-4
XAI_VOICE_ID=rex
```

Restart `npm run dev` after you add it. `rex` is the Grok voice. If the key is missing, or Grok does not answer, Jarvis still answers from the notes and uses the computer speaker.
