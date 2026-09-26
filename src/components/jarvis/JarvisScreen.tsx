"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Armory } from "@/components/armory/Armory";
import { BrainGraph } from "@/components/graph/BrainGraph";
import { ScreenHelp } from "@/components/help/ScreenHelp";
import { accentHex, HudFrame } from "@/components/hud/HudFrame";
import { ButlerPanel, type ButlerPhase, type KeptCard } from "@/components/jarvis/ButlerPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askJarvis } from "@/lib/ask";
import { describeCalendar, focusDeadline, formatClock, loadCalendar, remainingLabel, saveCalendar } from "@/lib/calendar";
import { frameFromVideo, grabScreenStill } from "@/lib/capture";
import {
  interpret,
  isInterrupt,
  type ClockPosition,
  type GraphDensity,
  type HudAction,
  type HudColor,
  type Pending,
  type SuitAction,
} from "@/lib/commands";
import { FOLDERS, findNotes, folderColor, getNote, linkedNotes, type Note } from "@/lib/notes";
import { reactorLabel, type ReactorModel } from "@/lib/reactor";
import { scoreReflex, type ReflexScores } from "@/lib/reflex";
import { createEar, speakText, stopSpeaking } from "@/lib/speech";

type JarvisScreenProps = {
  notes: readonly Note[];
};

type InspectCard = {
  title: string;
  file: string;
  folder: string;
  blurb: string;
  x: number;
  y: number;
};

const INTRO =
  "Good evening, sir. I'm Jarvis \u2014 your second brain, running on grok-4. I hold your notes, your calendar, and a focus timer. Pull up a file and I bring it forward. Read it yourself, or say read it out loud. I score a request before I answer, and I can look once if you ask. Click a node to fly. Double-click to open it. Drag to pan.";

const RAIL = ["click = fly", "drag = pan", "shift = orbit", "wheel = zoom", "double = open", "right = inspect"] as const;

export function JarvisScreen({ notes }: JarvisScreenProps) {
  const [clockPosition, setClockPosition] = useState<ClockPosition>("top");
  const [hudColor, setHudColor] = useState<HudColor>("cyan");
  const [density, setDensity] = useState<GraphDensity>("dense");
  const [model, setModel] = useState<ReactorModel>("grok-4");
  const [armoryOpen, setArmoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [phase, setPhase] = useState<ButlerPhase>("idle");
  const [line, setLine] = useState(INTRO);
  const [draft, setDraft] = useState("");
  const [handsFree, setHandsFree] = useState(false);
  const [card, setCard] = useState<KeptCard | null>(null);
  const [reflex, setReflex] = useState<ReflexScores | null>(null);
  const [status, setStatus] = useState("Standing by");
  const [graphReady, setGraphReady] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [focusEnds, setFocusEnds] = useState<number | null>(null);
  const [focusLabel, setFocusLabel] = useState<string | null>(null);
  const [eyesOn, setEyesOn] = useState(false);
  const [inspect, setInspect] = useState<InspectCard | null>(null);

  const pendingRef = useRef<Pending | null>(null);
  const phaseRef = useRef<ButlerPhase>("idle");
  const handsFreeRef = useRef(false);
  const handleRef = useRef<(text: string) => void>(() => undefined);
  const replyRef = useRef<(text: string) => void>(() => undefined);
  const openNoteRef = useRef<Note | null>(null);
  const eyeVideo = useRef<HTMLVideoElement | null>(null);
  const eyeStream = useRef<MediaStream | null>(null);
  const focusEndsRef = useRef<number | null>(null);

  function reply(next: string) {
    setLine(next);
    setPhase("speaking");
    phaseRef.current = "speaking";
    speakText(next, () => {
      const follow: ButlerPhase = handsFreeRef.current ? "listening" : "idle";
      phaseRef.current = follow;
      setPhase(follow);
    });
  }

  function hush(next: string) {
    stopSpeaking();
    setLine(next);
    const follow: ButlerPhase = handsFreeRef.current ? "listening" : "idle";
    phaseRef.current = follow;
    setPhase(follow);
  }

  function applyAction(action: HudAction) {
    switch (action.type) {
      case "clock":
        setClockPosition(action.position);
        return;
      case "color":
        setHudColor(action.color);
        return;
      case "density":
        setDensity(action.density);
        return;
      case "armory":
        setArmoryOpen(action.open);
        return;
      case "help":
        setHelpOpen(action.open);
        return;
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  }

  function remember(note: Note, keepCard: boolean) {
    openNoteRef.current = note;
    setSelectedId(note.id);
    setFocusId(note.id);
    setFocusTick((tick) => tick + 1);
    setInspect(null);
    if (!keepCard) {
      return;
    }
    setCard({
      title: note.title,
      file: note.file,
      folder: note.folder,
      body: note.body,
      links: linkedNotes(notes, note.id).map((item) => ({ id: item.id, title: item.title })),
    });
  }

  function flyTo(id: string) {
    const note = getNote(notes, id);
    if (!note) {
      return;
    }
    setSelectedId(note.id);
    setFocusId(note.id);
    setFocusTick((tick) => tick + 1);
    setInspect(null);
    setStatus(`Flew to ${note.file}`);
  }

  function openNote(id: string) {
    const note = getNote(notes, id);
    if (!note) {
      return;
    }
    remember(note, true);
    setStatus(`Opened ${note.file}`);
    reply(`Here is ${note.title}, sir. Read it yourself, or say read it out loud.`);
  }

  function inspectNote(id: string, x: number, y: number) {
    const note = getNote(notes, id);
    if (!note) {
      return;
    }
    const blurb = note.body.split(". ")[0] ?? note.body;
    const width = 256;
    const height = 170;
    let left = x + 20;
    let top = y + 20;
    if (left + width > window.innerWidth - 12) {
      left = Math.max(12, x - width - 20);
    }
    if (top + height > window.innerHeight - 12) {
      top = Math.max(12, y - height - 20);
    }
    setInspect({
      title: note.title,
      file: note.file,
      folder: note.folder,
      blurb,
      x: left,
      y: top,
    });
    setStatus(`Inspect ${note.file}`);
  }

  async function answerFromNotes(mode: "today" | "pull" | "ask", query: string) {
    setPhase("thinking");
    phaseRef.current = "thinking";
    setLine("Thinking, sir.");

    const dateLabel = new Date().toLocaleDateString("en-GB", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    let picked = findNotes(notes, query).slice(0, 4);
    let question = query;

    if (mode === "today") {
      const today = getNote(notes, "today");
      picked = today ? [today, ...linkedNotes(notes, "today")].slice(0, 4) : [];
      question = `What is today? It is ${dateLabel}.`;
      if (today) {
        remember(today, false);
      }
    } else if (mode === "pull") {
      const top = picked[0];
      if (!top) {
        reply("I don't have a note by that name, sir.");
        return;
      }
      remember(top, true);
      setStatus(`Pulled up ${top.file}`);
      reply(`Here is ${top.title}, sir. Read it yourself, or say read it out loud.`);
      return;
    } else if (picked[0]) {
      remember(picked[0], false);
    }

    const spoken = await askJarvis({
      question,
      notes: picked.map((note) => ({ title: note.title, body: note.body })),
      model,
    });
    const top = picked[0];
    if (top) {
      setCard({
        title: top.title,
        file: top.file,
        folder: top.folder,
        body: spoken,
        links: linkedNotes(notes, top.id).map((item) => ({ id: item.id, title: item.title })),
      });
      setStatus(`Answered from ${top.file}`);
    }
    reply(spoken);
  }

  async function runSuit(action: SuitAction) {
    switch (action.type) {
      case "read": {
        const note = openNoteRef.current;
        if (!note) {
          reply("Pull up a note first, sir.");
          return;
        }
        setStatus(`Read ${note.file}`);
        reply(note.body);
        return;
      }
      case "focus-start": {
        const ends = focusDeadline(action.minutes);
        focusEndsRef.current = ends;
        setFocusEnds(ends);
        setFocusLabel(formatClock(action.minutes * 60_000));
        setStatus(`Focus ${action.minutes}:00`);
        reply(`Focus for ${action.minutes} minutes, sir.`);
        return;
      }
      case "focus-stop": {
        focusEndsRef.current = null;
        setFocusEnds(null);
        setFocusLabel(null);
        setStatus("Focus stopped");
        reply("Focus stopped, sir.");
        return;
      }
      case "focus-check": {
        const ends = focusEndsRef.current;
        if (ends === null) {
          reply("No focus is running, sir.");
          return;
        }
        const label = remainingLabel(ends);
        setStatus(`Focus ${label}`);
        reply(`${label} left on the focus, sir.`);
        return;
      }
      case "calendar-check": {
        const items = loadCalendar();
        setStatus(items.length === 0 ? "Calendar clear" : `${items.length} on the calendar`);
        reply(describeCalendar(items));
        return;
      }
      case "calendar-book": {
        const items = loadCalendar();
        const next = [{ id: crypto.randomUUID(), title: action.title, when: action.when }, ...items].slice(0, 24);
        saveCalendar(next);
        setStatus(`Booked ${action.title}`);
        reply(`Booked ${action.title} for ${action.when}, sir.`);
        return;
      }
      case "eyes": {
        if (!action.open) {
          closeEyes();
          setStatus("Eyes closed");
          reply("Eyes closed, sir.");
          return;
        }
        await openEyes();
        return;
      }
      case "look":
        await lookAtScreen();
        return;
      case "see":
        await describeEyes();
        return;
      case "model":
        setModel(action.model);
        setStatus(reactorLabel(action.model));
        reply(`Running on ${action.model}, sir.`);
        return;
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  }

  async function openEyes() {
    if (!navigator.mediaDevices?.getUserMedia) {
      reply("This browser has no camera, sir.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      eyeStream.current?.getTracks().forEach((track) => track.stop());
      eyeStream.current = stream;
      setEyesOn(true);
      setStatus("Eyes open");
      reply("Eyes open, sir.");
    } catch {
      reply("The camera stayed closed, sir. Press Eyes in the Armory so the browser can allow it.");
    }
  }

  function closeEyes() {
    eyeStream.current?.getTracks().forEach((track) => track.stop());
    eyeStream.current = null;
    setEyesOn(false);
  }

  async function lookAtScreen() {
    setPhase("thinking");
    phaseRef.current = "thinking";
    setLine("Looking, sir.");
    setStatus("One look at the screen");
    try {
      const image = await grabScreenStill();
      const spoken = await askJarvis({
        question: "What is on this screen? Name the main thing you see.",
        notes: [],
        model,
        image,
      });
      setStatus("Described the screen");
      reply(spoken);
    } catch {
      reply("The screen look was blocked, sir. Press Screen in the Armory so the browser can allow it.");
    }
  }

  async function describeEyes() {
    const video = eyeVideo.current;
    if (!eyesOn || !video || video.videoWidth === 0) {
      reply("My eyes are closed, sir. Say open your eyes first.");
      return;
    }
    setPhase("thinking");
    phaseRef.current = "thinking";
    setLine("Looking, sir.");
    try {
      const image = frameFromVideo(video);
      const spoken = await askJarvis({
        question: "What do you see through the camera?",
        notes: [],
        model,
        image,
      });
      setStatus("Described the camera");
      reply(spoken);
    } catch {
      reply("I could not use that frame, sir.");
    }
  }

  async function handleUtterance(raw: string) {
    setReflex(scoreReflex(raw, notes.map((note) => note.title), { pending: pendingRef.current !== null }));
    const result = interpret(raw, pendingRef.current);
    switch (result.kind) {
      case "ask":
        pendingRef.current = result.pending;
        setStatus("Waiting on you");
        reply(result.line);
        return;
      case "apply":
        pendingRef.current = null;
        applyAction(result.action);
        setStatus(result.line);
        reply(result.line);
        return;
      case "cancel":
        pendingRef.current = null;
        setStatus("Stopped");
        hush(result.line);
        return;
      case "quiet":
        setStatus("Quiet");
        hush(result.line);
        return;
      case "idle":
      case "unknown":
        reply(result.line);
        return;
      case "note":
        pendingRef.current = null;
        await answerFromNotes(result.mode, result.query);
        return;
      case "suit":
        pendingRef.current = null;
        await runSuit(result.action);
        return;
      default: {
        const exhaustive: never = result;
        return exhaustive;
      }
    }
  }

  useEffect(() => {
    handleRef.current = (text: string) => {
      void handleUtterance(text);
    };
    replyRef.current = reply;
  });

  useEffect(() => {
    if (!handsFree) {
      return;
    }
    const ear = createEar({
      onPhrase: (text) => {
        handleRef.current(text);
      },
      onError: () => {
        setLine("I cannot hear the microphone, sir. You can still type.");
      },
      shouldAccept: (text) => {
        if (isInterrupt(text)) {
          return true;
        }
        if (phaseRef.current === "speaking" || phaseRef.current === "thinking") {
          return false;
        }
        return /\\bjarvis\\b/.test(text) || pendingRef.current !== null;
      },
    });
    if (!ear) {
      handsFreeRef.current = false;
      setHandsFree(false);
      setLine("This browser has no microphone ear, sir. You can still type.");
      return;
    }
    return () => ear.stop();
  }, [handsFree]);

  useEffect(() => {
    if (focusEnds === null) {
      return;
    }
    const id = window.setInterval(() => {
      const ends = focusEndsRef.current;
      if (ends === null) {
        return;
      }
      const left = ends - Date.now();
      if (left <= 0) {
        focusEndsRef.current = null;
        setFocusEnds(null);
        setFocusLabel(null);
        setStatus("Focus complete");
        replyRef.current("Focus is complete, sir.");
        return;
      }
      setFocusLabel(formatClock(left));
    }, 250);
    return () => window.clearInterval(id);
  }, [focusEnds]);

  useEffect(() => {
    const video = eyeVideo.current;
    const stream = eyeStream.current;
    if (!eyesOn || !video || !stream) {
      return;
    }
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [eyesOn]);

  useEffect(() => {
    return () => {
      eyeStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function submit() {
    const text = draft.trim();
    if (!text) {
      return;
    }
    setDraft("");
    void handleUtterance(text);
  }

  function toggleEar() {
    const next = !handsFreeRef.current;
    handsFreeRef.current = next;
    setHandsFree(next);
    if (next) {
      reply("Hands free engaged, sir. Say Jarvis and I shall answer.");
      return;
    }
    stopSpeaking();
    reply("Hands free is off, sir.");
  }

  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = findNotes(notes, search);
    const top = found[0];
    if (!top) {
      reply("I don't have a note by that name, sir.");
      return;
    }
    flyTo(top.id);
  }

  function readOpenNote() {
    const note = openNoteRef.current;
    if (!note) {
      reply("Pull up a note first, sir.");
      return;
    }
    setStatus(`Read ${note.file}`);
    reply(note.body);
  }

  return (
    <HudFrame color={hudColor} clockPosition={clockPosition} model={model}>
      <div className="absolute inset-0">
        <ul className="sr-only">
          {notes.map((note) => (
            <li key={note.id}>{note.file}</li>
          ))}
        </ul>
        <BrainGraph
          notes={notes}
          density={density}
          accent={accentHex(hudColor)}
          selectedId={selectedId}
          focusId={focusId}
          focusTick={focusTick}
          onFly={flyTo}
          onOpen={openNote}
          onInspect={inspectNote}
          onClear={() => {
            setSelectedId(null);
            setInspect(null);
          }}
          onReady={() => setGraphReady(true)}
          onError={(message) => setGraphError(message)}
        />
        <form onSubmit={runSearch} className="absolute top-16 left-3 z-20 flex w-56 gap-2">
          <label htmlFor="note-search" className="sr-only">
            Find a note
          </label>
          <Input
            id="note-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a note"
            className="h-8 border-[color:var(--hud)]/40 bg-black/60 text-[var(--hud-ink)] placeholder:text-[var(--hud-dim)]"
          />
          <Button type="submit" variant="outline" className="h-8 border-[color:var(--hud)]/50 text-[var(--hud)]">
            Fly
          </Button>
        </form>
        <ul className="absolute top-28 left-3 z-20 font-mono text-[10px] tracking-wide text-[var(--hud-dim)]">
          {FOLDERS.map((folder) => (
            <li key={folder} className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full" style={{ backgroundColor: folderColor(folder) }} />
              {folder}
            </li>
          ))}
        </ul>
        <ul className="pointer-events-none absolute top-1/2 right-4 z-20 hidden -translate-y-1/2 flex-col gap-2 text-right font-mono text-[10px] tracking-[0.14em] text-[var(--hud-dim)] uppercase md:flex">
          {RAIL.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
        {focusLabel ? (
          <p
            data-testid="focus-timer"
            className="absolute top-16 right-3 z-20 font-mono text-xs tracking-wide text-[var(--hud)] uppercase"
          >
            Focus {focusLabel}
          </p>
        ) : null}
        {eyesOn ? (
          <div
            data-testid="eyes-preview"
            className="absolute top-40 left-3 z-20 w-36 overflow-hidden rounded-xl border border-[color:var(--hud)]/40 bg-black/70"
          >
            <video ref={eyeVideo} autoPlay muted playsInline className="h-24 w-full object-cover" />
            <p className="px-2 py-1 font-mono text-[10px] tracking-wide text-[var(--hud)] uppercase">Eyes</p>
          </div>
        ) : null}
        {inspect ? (
          <aside
            data-testid="inspect-card"
            className="absolute z-50 w-64 rounded-xl border border-[color:var(--hud)]/40 bg-black/85 p-3 text-[var(--hud-ink)]"
            style={{ left: inspect.x, top: inspect.y }}
          >
            <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--hud-dim)] uppercase">{inspect.folder}</p>
            <p className="text-sm text-[var(--hud)]">{inspect.title}</p>
            <p className="mt-1 font-mono text-[10px] text-[var(--hud-dim)]">{inspect.file}</p>
            <p className="mt-2 text-xs leading-5">{inspect.blurb}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setInspect(null)}
              className="mt-2 h-8 border-[color:var(--hud)]/50 text-[var(--hud)]"
            >
              Close
            </Button>
          </aside>
        ) : null}
        {!graphReady && !graphError ? (
          <p className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-sm tracking-[0.16em] text-[var(--hud)] uppercase">
            Bringing the notes online, sir.
          </p>
        ) : null}
        {graphError ? (
          <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-sm text-[var(--hud-ink)]">{graphError}</p>
        ) : null}
        {armoryOpen ? (
          <div className="absolute top-44 left-3 z-30 w-80">
            <Armory
              model={model}
              eyesOn={eyesOn}
              focusLabel={focusLabel}
              onClose={() => setArmoryOpen(false)}
              onVault={() => {
                setArmoryOpen(false);
                setDraft("pull up ");
                reply("Which file, sir? science.md is a good start.");
              }}
              onCalendar={() => {
                setArmoryOpen(false);
                void handleUtterance("check the calendar");
              }}
              onFocus={() => {
                setArmoryOpen(false);
                void handleUtterance(focusEndsRef.current ? "stop the focus timer" : "start a focus timer");
              }}
              onEyes={() => {
                setArmoryOpen(false);
                void handleUtterance(eyesOn ? "close your eyes" : "open your eyes");
              }}
              onLook={() => {
                setArmoryOpen(false);
                void handleUtterance("look at my screen");
              }}
            />
          </div>
        ) : null}
        {helpOpen ? (
          <div className="absolute top-44 right-3 z-30 w-72">
            <ScreenHelp onClose={() => setHelpOpen(false)} />
          </div>
        ) : null}
      </div>
      <ButlerPanel
        phase={phase}
        line={line}
        draft={draft}
        handsFree={handsFree}
        card={card}
        reflex={reflex}
        status={status}
        onDraft={setDraft}
        onSubmit={submit}
        onToggleEar={toggleEar}
        onDismissCard={() => setCard(null)}
        onOpenLink={openNote}
        onReadAloud={readOpenNote}
      />
    </HudFrame>
  );
}
