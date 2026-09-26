# Phrases Jarvis already understands

Say the phrase. For the clock, the color, and the graph, he asks one short question. Then say **ok** or **change**. Say **stop** to cancel that change. Say **be quiet** or **hold on** to stop his voice.

- move the clock — `src/components/hud/HudFrame.tsx`
- make the graph denser — `src/components/graph/BrainGraph.tsx`
- change the HUD color — `src/components/hud/HudFrame.tsx`
- open the armory — `src/components/armory/Armory.tsx`
- close the armory — `src/components/armory/Armory.tsx`
- show screen help — `src/components/help/ScreenHelp.tsx`
- hide screen help — `src/components/help/ScreenHelp.tsx`
- what's today — `src/lib/notes.ts`
- pull up science — `src/components/graph/BrainGraph.tsx`
- read it out loud — `src/lib/speech.ts`
- be quiet — `src/lib/speech.ts`
- check the calendar — `src/lib/calendar.ts`
- book science fair friday — `src/lib/calendar.ts`
- start a focus timer — `src/components/jarvis/JarvisScreen.tsx`
- open your eyes — `src/lib/capture.ts`
- look at my screen — `src/lib/capture.ts`
- switch to grok 3 — `src/components/hud/HudFrame.tsx`

**ok**, **change**, and **stop** are read in `src/lib/commands.ts`.

Click a node to fly to it. Double-click to open it. Drag to pan. Hold Shift, or the right mouse button, to turn the graph. Right-click a node to inspect it. Scroll to zoom.
