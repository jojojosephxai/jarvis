"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

import { NoteGraph, type GraphCue } from "@/components/note-graph";
import { matchGraphNode } from "@/lib/graph-nav";
import type { GraphNode } from "@/lib/note-graph";
import { parseGraphCommand } from "@/lib/graph-command";
import { mentionsCalendar } from "@/lib/intent";
import { OrbStage } from "@/components/orb-stage";
import { useVoice } from "@/components/use-voice";
import { finishedHistory } from "@/lib/thread-storage";
import { makeId } from "@/lib/ids";
import { resolveOrbMode, type OrbMode } from "@/lib/orb-mode";
import {
  isHandPlan,
  isMorningBrief,
  isReceipt,
  type ChatResponse,
  type ChatMessageInput,
  type HandPlan,
  type Receipt,
} from "@/lib/types";
import { decideFaceMode } from "@/lib/view-intent";
import { butlerSpeech, MIC_BLOCKED_NOTICE } from "@/lib/voice/policy";
import { createSentenceQueue, unspokenTail } from "@/lib/voice/sentence-queue";
import { prepareSpeech, ChatSession, readFastVoicePreference, FAST_VOICE_STORAGE_KEY, type PreparedSpeech } from "@/lib/voice/session";
import { stripReplySources, stripReplyTiming } from "@/lib/reply-text";

const BOOT_KEY = "jarvis-boot";
const EXAMPLES = ["remind me…", "good morning", "show swim times"] as const;
const CALENDAR_NOTICE = "Calendar isn't connected yet";

function calendarOnly(text: string): boolean {
  const trimmed = text.trim().replace(/[.!]+$/g, "");
  return /^calendar (isn'?t|is not|not) connected( yet)?$/i.test(trimmed);
}

function collapseCalendar(items: LogItem[]): LogItem[] {
  let seen = false;
  const rows: LogItem[] = [];
  for (const item of items) {
    if (item.kind === "jarvis" && calendarOnly(item.text)) {
      if (seen) continue;
      seen = true;
      rows.push({ ...item, text: CALENDAR_NOTICE });
      continue;
    }
    rows.push(item);
  }
  return rows;
}

let greetedThisLoad = false;

type LogItem =
  | { kind: "you"; id: string; text: string; at: string }
  | { kind: "jarvis"; id: string; text: string; at: string; sources?: string[]; failed?: boolean; pending?: boolean; tokenMs?: number; voiceMs?: number; model?: string }
  | { kind: "hand"; id: string; at: string; reply: string; plan?: HandPlan; receipts: Receipt[]; cancelled?: boolean; tokenMs?: number; voiceMs?: number; model?: string };

function dropUnaskedCalendar(text: string, asked: boolean): string {
  if (asked) return text;
  const parts = text.split(/(?<=[.!?])\s+/).filter((part) => !/calendar (isn'?t|is not|not) connected/i.test(part));
  const next = parts.join(" ").trim();
  if (next) return next;
  return calendarOnly(text) ? "" : text;
}

type WorkStep = {
  id: string;
  label: string;
  state: "running" | "done";
  startedAt: number;
  endedAt: number | null;
};

type Job = {
  id: number;
  objective: string;
  steps: WorkStep[];
  context: string[];
  model: string | null;
  progress: number | null;
  abort: AbortController;
};

const STUB_TASKS = new Set(["browser.open", "browser.task", "message.send", "money.spend", "item.delete"]);

type LogTab = "chat" | "tasks" | "log" | "inspector";

function markBootDone() {
  try {
    sessionStorage.setItem(BOOT_KEY, "1");
    document.documentElement.dataset.boot = "done";
  } catch {
    // Session storage can be blocked. The intro still ends.
  }
}

function greetingLine(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning, Joseph.";
  if (hour < 17) return "Good afternoon, Joseph.";
  return "Good evening, Joseph.";
}

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function replyForChat(text: string, sources: string[] | undefined): { body: string; chips: string[] } {
  const chips = [...new Set(sources ?? [])];
  return { body: stripReplySources(stripReplyTiming(text), chips), chips };
}

function inTimeOrder(items: LogItem[]): LogItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.at.localeCompare(b.item.at) || a.index - b.index)
    .map((row) => row.item);
}

export function Face({ realtimeAllowed = false }: { realtimeAllowed?: boolean }) {
  const [graphOpen, setGraphOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const replySpeaking = useRef(false);
  const [items, setItems] = useState<LogItem[]>([]);
  const [draft, setDraft] = useState("");
  const [spokenReplies, setSpokenReplies] = useState(true);
  const [realtimeListening, setRealtimeListening] = useState(false);
  const [fastVoice, setFastVoice] = useState(false);
  const [voiceMinutes, setVoiceMinutes] = useState(0);
  const [fastVoiceLog, setFastVoiceLog] = useState("");
  const chatSession = useRef<ChatSession | null>(null);
  const [showTiming, setShowTiming] = useState(true);
  const [micDismissed, setMicDismissed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLElement>(null);
  const [sourceNodes, setSourceNodes] = useState<GraphNode[]>([]);
  const [askFocus, setAskFocus] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ackOn, setAckOn] = useState(false);
  const [working, setWorking] = useState(false);
  const [skill, setSkill] = useState<string | null>(null);
  const [cue, setCue] = useState<GraphCue | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [taskFade, setTaskFade] = useState<Job | null>(null);
  const [tab, setTab] = useState<LogTab>("chat");
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [windowWidth, setWindowWidth] = useState(1024);
  const [inspectorHost, setInspectorHost] = useState<HTMLDivElement | null>(null);
  const [resizing, setResizing] = useState(false);
  const showTab = useCallback((next: LogTab) => {
    setTab(next);
    setSidebarCollapsed(false);
    try { localStorage.setItem("jarvis-sidebar-collapsed", "false"); } catch {}
  }, []);
  const inspect = useCallback(() => showTab("inspector"), [showTab]);
  function resizeSidebar(width: number) {
    const next = Math.max(300, Math.min(window.innerWidth / 2, width));
    setSidebarWidth(next);
    try { localStorage.setItem("jarvis-sidebar-width", String(next)); } catch {}
  }
  useEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);
  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try { localStorage.setItem("jarvis-sidebar-collapsed", String(next)); } catch {}
  }
  const [intro, setIntro] = useState<"in" | "out">("in");
  const [wake, setWake] = useState(false);
  const [liveLine, setLiveLine] = useState("");
  const [captionHold, setCaptionHold] = useState("");
  const [preview, setPreview] = useState<"" | "listening" | "speaking" | "working">("");
  const [pending, setPending] = useState(false);
  const cueToken = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const bootTimer = useRef<number | null>(null);
  const ackTimer = useRef<number | null>(null);
  const fadeTimer = useRef<number | null>(null);
  const pendingRef = useRef(false);
  const jobGen = useRef(0);
  const userSpoke = useRef(false);
  const speakingRef = useRef(false);
  const voice = useVoice((active) => {
    if (!active && replySpeaking.current && spokenReplies) return;
    speakingRef.current = active;
    setSpeaking(active);
  }, spokenReplies);
  const speakRef = useRef(voice.speak);
  speakRef.current = voice.speak;
  const liveOrb = resolveOrbMode({
    speaking,
    working: working && Boolean(skill),
    listening: voice.listening || realtimeListening,
    thinking: pending && !speaking,
    ack: ackOn,
  });
  const orb: OrbMode =
    preview === "listening" ? "listening" : preview === "speaking" ? "speaking" : preview === "working" ? "working" : liveOrb;
  const shownSkill =
    preview === "working"
      ? skill ?? "calendar"
      : preview === "speaking" || preview === "listening"
        ? skill ?? "brain"
        : skill;
  const jobRef = useRef<Job | null>(null);
  jobRef.current = job;
  const previewAbort = useRef(new AbortController());
  const previewStarted = useRef(0);
  const previewJob: Job | null =
    preview === "working"
      ? {
          id: -1,
          objective: "Check the calendar",
          steps: [{ id: "preview", label: "Working", state: "running", startedAt: previewStarted.current || performance.now(), endedAt: null }],
          context: [],
          model: null,
          progress: null,
          abort: previewAbort.current,
        }
      : null;
  const shownTask = job ?? taskFade ?? previewJob;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const face = params.get("face");
    const hub = params.get("hub");
    const timer = window.setTimeout(() => {
      try {
        const savedWidth = Number(localStorage.getItem("jarvis-sidebar-width"));
        if (Number.isFinite(savedWidth) && savedWidth >= 300) setSidebarWidth(savedWidth);
        setSidebarCollapsed(localStorage.getItem("jarvis-sidebar-collapsed") === "true");
        setRailCollapsed(localStorage.getItem("jarvis-rail-collapsed") === "true");
        setSpokenReplies(localStorage.getItem("jarvis-spoken-replies") !== "false");
        setFastVoice(readFastVoicePreference(localStorage));
        setShowTiming(localStorage.getItem("jarvis-show-timing") !== "false");
        setMicDismissed(localStorage.getItem("jarvis-mic-blocked-dismissed") === "true");
      } catch {}
      if (face === "listening" || face === "speaking" || face === "working") {
        if (face === "working") previewStarted.current = performance.now();
        if (face === "speaking") setLiveLine("It is evening on the Eastern clock.");
        setPreview(face);
      }
      if (!hub) return;
      cueToken.current += 1;
      setCue({ token: cueToken.current, focusHub: hub });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    let frame = 0;
    const tick = () => {
      const ready = document.querySelector(".face-column");
      const failed = document.querySelector(".graph-stage-empty");
      if (ready || failed || performance.now() - started > 2500) {
        setIntro("out");
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    bootTimer.current = window.setTimeout(() => {
      markBootDone();
      void greet();
    }, reduce ? 200 : 1600);
    return () => {
      window.cancelAnimationFrame(frame);
      if (bootTimer.current !== null) window.clearTimeout(bootTimer.current);
      if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
      if (fadeTimer.current !== null) window.clearTimeout(fadeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!wake) return;
    let stopped = false;
    let busy = false;
    const start = () => {
      if (stopped || busy || userSpoke.current) return;
      busy = true;
      const line = greetingLine(new Date());
      setLiveLine(line);
      void speakRef.current(line).then((result) => {
        busy = false;
        if (stopped) return;
        setWake(result.blocked);
      });
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    return () => {
      stopped = true;
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, [wake]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [items, tab]);

  useEffect(() => {
    if (!settingsOpen) return;
    settingsPanelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !settingsRef.current?.contains(event.target) && !settingsPanelRef.current?.contains(event.target)) setSettingsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setSettingsOpen(false);
      settingsRef.current?.querySelector<HTMLButtonElement>(".tool-btn")?.focus();
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!working) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      event.stopPropagation();
      setGraphOpen(false);
      stopWork();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [working, job]);

  async function greet() {
    if (greetedThisLoad) return;
    greetedThisLoad = true;
    if (userSpoke.current) return;
    const line = greetingLine(new Date());
    setLiveLine(line);
    const result = await speakRef.current(line);
    if (userSpoke.current) return;
    if (result.blocked) setWake(true);
  }

  function clearAckTimer() {
    if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    ackTimer.current = null;
  }

  function beginWork(objective: string, label: string, skillName: string | null = null) {
    const abort = new AbortController();
    const id = jobGen.current + 1;
    jobGen.current = id;
    pendingRef.current = true;
    setPending(true);
    setJob({
      id,
      objective,
      steps: [{ id: "fetch", label, state: "running", startedAt: performance.now(), endedAt: null }],
      context: [],
      model: null,
      progress: null,
      abort,
    });
    setSkill(skillName);
    setAckOn(true);
    clearAckTimer();
    ackTimer.current = window.setTimeout(() => {
      setAckOn(false);
      if (pendingRef.current) setWorking(true);
    }, 300);
    return { abort, id };
  }

  function settleJob(id: number, context: string[], model: string | null) {
    if (id !== jobGen.current) return;
    const endedAt = performance.now();
    setJob((current) => {
      if (!current || current.id !== id) return current;
      return {
        ...current,
        context,
        model,
        steps: current.steps.map((step) => (step.state === "running" ? { ...step, state: "done", endedAt } : step)),
      };
    });
  }

  function finishJob(id?: number) {
    if (id !== undefined && id !== jobGen.current) return;
    const ending = jobRef.current;
    if (ending) {
      setTaskFade(ending);
      if (fadeTimer.current !== null) window.clearTimeout(fadeTimer.current);
      fadeTimer.current = window.setTimeout(() => {
        fadeTimer.current = null;
        setTaskFade((shown) => (shown && shown.id === ending.id ? null : shown));
      }, 280);
    }
    pendingRef.current = false;
    setPending(false);
    setWorking(false);
    setSkill(null);
    setJob(null);
    setAckOn(false);
    clearAckTimer();
  }

  function stopWork() {
    jobGen.current += 1;
    job?.abort.abort();
    chatSession.current?.cancel();
    setRealtimeListening(false);
    replySpeaking.current = false;
    voice.stop();
    finishJob();
  }

  async function speakThenFinish(id: number, abort: AbortController, line: string) {
    try {
      if (line.trim() && id === jobGen.current && !abort.signal.aborted) {
        replySpeaking.current = true;
        const queue = createSentenceQueue<PreparedSpeech>(async (chunk, prepared) => {
          setLiveLine(chunk);
          await speakRef.current(chunk, { prepared });
        }, abort.signal, spokenReplies ? prepareSpeech : undefined);
        queue.enqueue(line);
        await queue.drain();
      }
    } finally {
      if (id === jobGen.current) {
        replySpeaking.current = false;
        setSpeaking(false);
        finishJob(id);
      }
    }
  }

  function pushCue(next: Omit<GraphCue, "token">) {
    cueToken.current += 1;
    setCue({ token: cueToken.current, ...next });
  }

  function applyGraph(payload: ChatResponse) {
      const graph = payload.graph;
      if (graph?.action === "layout") {
        setGraphOpen(graph.value === "graph");
        if (graph.value === "side") setSidebarCollapsed(true);
        if (graph.value === "center" || graph.value === "home") setSidebarCollapsed(false);
      }
      if (graph && (graph.action === "filter" || graph.action === "search" || graph.action === "focus" || graph.action === "clear")) {
        setGraphOpen(true);
        setSkill("graph");
        if (graph.action === "clear") pushCue({ clear: true });
        else if (graph.action === "filter") pushCue({ filterHub: graph.value });
        else if (graph.action === "search") pushCue({ search: graph.value });
        else if (["School", "Swim", "Jarvis", "Health", "People", "Journal", "Projects", "Me"].includes(graph.value)) {
          pushCue({ focusHub: graph.value });
        } else pushCue({ focusQuery: graph.value });
      }
  }

  function session() {
    if (!chatSession.current) chatSession.current = new ChatSession({
      realtimeAllowed, onFallback: setFastVoiceLog, onMinutes: setVoiceMinutes, onListening: setRealtimeListening,
      onSpeaking: (active, level) => {
        setSpeaking(active);
        speakingRef.current = active;
        if (level !== undefined) voice.levelRef.current = level;
      },
    });
    chatSession.current.setEnabled(fastVoice && spokenReplies);
    return chatSession.current;
  }
  useEffect(() => {
    const refresh = () => chatSession.current?.updateHistory();
    window.addEventListener("jarvis-board-changed", refresh);
    return () => { window.removeEventListener("jarvis-board-changed", refresh); chatSession.current?.close(); };
  }, []);

  async function pressMicrophone() {
    if (realtimeListening) {
      chatSession.current?.stopMicrophone(); setRealtimeListening(false); return;
    }
    if (fastVoice && realtimeAllowed && voice.micPermission === "granted") {
      let answerId = "";
      let micJob: { id: number; abort: AbortController } | null = null;
      const update = (text: string, sources?: string[], finished = false) => {
        if (!answerId || !micJob || micJob.id !== jobGen.current) return;
        setLiveLine(text);
        setItems(current => current.map(item => item.id === answerId && item.kind === "jarvis" ? { ...item, text, sources: sources ?? item.sources, pending: !finished } : item));
      };
      const messages = finishedHistory(items);
      const started = await session().startMicrophone(messages, {
        sentence: () => {}, transcript: text => update(text), brain: response => update(response.reply, response.sources),
        thinking: active => { setWorking(false); if (active) setSkill(null); },
      }, text => {
        answerId = makeId("ans");
        micJob = beginWork(text, "Thinking");
        setDraft(""); setTab("chat");
        const at = new Date().toISOString();
        setItems(current => [...current,
          { kind: "you", id: makeId("you"), text, at } as LogItem,
          { kind: "jarvis", id: answerId, text: "", at, model: "voice", pending: true } as LogItem,
        ].slice(-40));
      }, (payload, standard) => {
        if (!micJob || micJob.id !== jobGen.current) return;
        applyGraph(payload);
        if (isHandsTurn(payload)) {
          const hand: LogItem = { kind: "hand", id: answerId, at: new Date().toISOString(), reply: payload.reply, plan: payload.plan, receipts: payload.receipts, model: "voice" };
          setItems(current => current.map(item => item.id === answerId ? hand : item));
          if (payload.plan?.state === "waiting") setTab("tasks");
        } else update(payload.reply, payload.sources, true);
        if (standard) {setRealtimeListening(false);void speakThenFinish(micJob.id, micJob.abort, payload.reply);}
        else finishJob(micJob.id);
      });
      setRealtimeListening(started);
      if (started) return;
    }
    voice.pressMic((text, isFinal) => { if (isFinal) void send(text); else setDraft(text); });
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (pendingRef.current) {
      if (!fastVoice || !realtimeAllowed) return;
      stopWork();
    }
    userSpoke.current = true;
    replySpeaking.current = false;
    voice.stop();
    const decision = decideFaceMode(trimmed);
    const at = new Date().toISOString();
    if (decision.exclusive && !parseGraphCommand(trimmed)) {
      if (decision.view === "graph") {
        setGraphOpen(true);
        pushCue({
          focusQuery: decision.focusQuery,
          pathFrom: decision.pathFrom,
          pathTo: decision.pathTo,
          fit: !decision.focusQuery && !decision.pathFrom,
        });
        setDraft("");
        return;
      }
      const reply = "The orb is already on the graph.";
      setItems((current) =>
        [
          ...current,
          { kind: "you" as const, id: makeId("you"), text: trimmed, at },
          { kind: "jarvis" as const, id: makeId("ans"), text: reply, at },
        ].slice(-40),
      );
      setDraft("");
      setTab("chat");
      setLiveLine(reply);
      return;
    }

    setItems((current) => [...current, { kind: "you" as const, id: makeId("you"), text: trimmed, at }].slice(-40));
    setDraft("");
    setTab("chat");
    const graphAsk = parseGraphCommand(trimmed);
    const skillName = graphAsk ? "graph" : mentionsCalendar(trimmed) ? "calendar" : "brain";
    const { abort, id } = beginWork(trimmed, graphAsk ? "Graph" : "Thinking", skillName);
    let spoken = "";
    let realtimeReply = false;
    const askedAt = performance.now();
    let tokenAt = 0;
    let timed = false;
    const answerId = makeId("ans");
    let liveId = answerId;
    const pendingTiming: { tokenMs?: number; voiceMs?: number; model?: string } = {};
    const stampTiming = (voiceAt: number | null) => {
      if (timed) return;
      timed = true;
      const now = performance.now();
      const tokenMs = Math.max(0, Math.round((tokenAt || now) - askedAt));
      const voiceMs = voiceAt !== null ? Math.max(0, Math.round(voiceAt - askedAt)) : undefined;
      pendingTiming.tokenMs = tokenMs;
      pendingTiming.voiceMs = voiceMs;
      const targetId = liveId;
      setItems((current) =>
        current.map((item) => (item.id === targetId && (item.kind === "jarvis" || item.kind === "hand") ? { ...item, tokenMs, voiceMs } : item)),
      );
    };
    const upsertJarvis = (text: string, sources?: string[], failed = false, pending = true) => {
      text = stripReplyTiming(text);
      const at = new Date().toISOString();
      setItems((current) => {
        const index = current.findIndex((item) => item.id === answerId && item.kind === "jarvis");
        if (index >= 0) {
          const prev = current[index];
          if (prev?.kind !== "jarvis") return current;
          const next = current.slice();
          next[index] = {
            ...prev,
            text,
            sources: sources ?? prev.sources,
            failed,
            pending,
            model: pendingTiming.model ?? prev.model,
            tokenMs: pendingTiming.tokenMs ?? prev.tokenMs,
            voiceMs: pendingTiming.voiceMs ?? prev.voiceMs,
          };
          return next;
        }
        return [
          ...current,
          {
            kind: "jarvis" as const,
            id: answerId,
            text,
            at,
            sources,
            failed,
            pending,
            model: pendingTiming.model,
            tokenMs: pendingTiming.tokenMs,
            voiceMs: pendingTiming.voiceMs,
          },
        ].slice(-40);
      });
    };
    let loggedWord = false;
    replySpeaking.current = true;
    let count = 0;
    const queue = createSentenceQueue<PreparedSpeech>(async (sentence, prepared) => {
      setLiveLine(sentence);
      const first = count++ === 0;
      await speakRef.current(sentence, { prepared, ...(first ? {
        onStart: () => {
          if (!tokenAt) tokenAt = performance.now();
          stampTiming(performance.now());
          if (loggedWord) return;
          loggedWord = true;
          console.info(`time-to-first-word ${Math.round(performance.now() - askedAt)}`);
        },
      } : {}) });
    }, abort.signal, spokenReplies ? (text, signal) => prepareSpeech(text, signal, answerId) : undefined);
    const askedCalendar = mentionsCalendar(trimmed);
    let streamed = "";
    let tokenText = "";
    const pushSentence = (text: string) => {
      if (id !== jobGen.current || abort.signal.aborted) return;
      const clean = dropUnaskedCalendar(stripReplyTiming(text).trim(), askedCalendar);
      if (!clean) return;
      if (!tokenAt) tokenAt = performance.now();
      streamed = streamed ? `${streamed} ${clean}` : clean;
      if (!tokenText) upsertJarvis(streamed);
      queue.enqueue(clean);
    };
    try {
      const messages: ChatMessageInput[] = [
        ...finishedHistory(items),
        { role: "user", content: trimmed },
      ].slice(-8) as ChatMessageInput[];
      const result = await session().run(messages, abort.signal, {
        token: (delta) => {
          if (id !== jobGen.current || abort.signal.aborted) return;
          if (!tokenAt) tokenAt = performance.now();
          pendingTiming.tokenMs = Math.max(0, Math.round(tokenAt - askedAt));
          tokenText += delta;
          upsertJarvis(dropUnaskedCalendar(tokenText, askedCalendar));
        },
        sentence: pushSentence,
        transcript: (text) => {
          if (id !== jobGen.current) return;
          if (!tokenAt) tokenAt = performance.now();
          upsertJarvis(text);
          setLiveLine(text);
        },
        brain: (response) => { if (id === jobGen.current) { upsertJarvis(response.reply, response.sources); applyGraph(response); } },
        thinking: (active) => { if (id === jobGen.current) { setWorking(false); if (active) setSkill(null); } },
      }, answerId);
      const payload = result.response;
      realtimeReply = result.path === "realtime";
      if (!payload) {
        upsertJarvis("Jarvis did not answer. Nothing was invented.", undefined, true, false);
        return;
      }
      session().updateHistory(finishedHistory([...items, { kind: "you", text: trimmed }, { kind: "jarvis", text: dropUnaskedCalendar(payload.reply, askedCalendar), sources: payload.sources }]));
      pendingTiming.model = payload.model ?? (payload.mode === "grok" ? "grok-4.7" : "local");
      settleJob(id, loadedContext(payload), payload.mode === "grok" ? "grok-4.7" : null);
      applyGraph(payload);
      if (isHandsTurn(payload)) {
        const reply = dropUnaskedCalendar(stripReplyTiming(payload.reply), askedCalendar);
        if (reply || payload.plan) {
          const handId = makeId("hand");
          liveId = handId;
          const hand: Extract<LogItem, { kind: "hand" }> = {
            kind: "hand",
            id: handId,
            at: new Date().toISOString(),
            reply: reply || stripReplyTiming(payload.reply),
            plan: payload.plan,
            receipts: payload.receipts,
            model: pendingTiming.model,
            tokenMs: pendingTiming.tokenMs,
            voiceMs: pendingTiming.voiceMs,
          };
          setItems((current) => [...current.filter((item) => item.id !== answerId), hand].slice(-40));
        }
        if (payload.plan?.state === "waiting" && payload.plan.tool && !STUB_TASKS.has(payload.plan.tool)) setTab("tasks");
        if (reply) spoken = unspokenTail(reply, streamed);
        return;
      }
      const brief = payload.brief;
      if (brief && isMorningBrief(brief)) {
        upsertJarvis(brief.reply, brief.sources, false, false);
        spoken = unspokenTail(brief.reply, streamed);
        return;
      }
      const reply = dropUnaskedCalendar(stripReplyTiming(payload.reply), askedCalendar);
      if (reply) upsertJarvis(reply, payload.sources, false, false);
      if (reply) spoken = unspokenTail(reply, streamed);
    } catch (error) {
      if (abort.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        upsertJarvis("Stopped. I do not know if that finished.", undefined, true, false);
        return;
      }
      upsertJarvis("I couldn't reach Jarvis. Try again.", undefined, true, false);
    } finally {
      if (spoken && !realtimeReply) queue.enqueue(spoken);
      try { await queue.drain(); }
      finally {
        if (id === jobGen.current) {
          replySpeaking.current = false;
          speakingRef.current = false;
          setSpeaking(false);
          stampTiming(null);
          finishJob(id);
        }
      }
    }
  }

  async function decide(itemId: string, plan: HandPlan, decision: "yes" | "no") {
    if (plan.state !== "waiting" || plan.gate !== "confirm" || pendingRef.current) return;
    userSpoke.current = true;
    const name = plainSkill(plan.tool);
    const { abort, id } = beginWork(handObjective(plan), handStepLabel(plan), name);
    let spoken = "";
    try {
      const response = await fetch("/api/hands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: plan.tool, input: plan.input, decision }),
        signal: abort.signal,
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isHandResponse(payload)) return;
      settleJob(id, [], null);
      setItems((current) =>
        current.map((item) =>
          item.kind === "hand" && item.id === itemId
            ? { ...item, reply: stripReplyTiming(payload.reply), plan: payload.plan, receipts: payload.receipts }
            : item,
        ),
      );
      spoken = butlerSpeech(payload.reply);
    } catch (error) {
      if (abort.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        setItems((current) =>
          current.map((item) =>
            item.kind === "hand" && item.id === itemId
              ? {
                  ...item,
                  cancelled: true,
                  reply:
                    "Stopped. Check the calendar or the note before you confirm this again. I do not know if it already ran.",
                }
              : item,
          ),
        );
        return;
      }
    } finally {
      await speakThenFinish(id, abort, spoken);
    }
  }

  const micHint = voice.notice ?? "";
  const blockedHint = micHint === MIC_BLOCKED_NOTICE;
  const showMicNotice = Boolean(micHint) && !(blockedHint && (micDismissed || voice.micPermission === "granted"));
  const speechLine = orb === "listening" ? draft : orb === "speaking" ? liveLine : "";
  if (speechLine && speechLine !== captionHold) setCaptionHold(speechLine);

  return (
    <div className="face" style={{ "--side": `min(50vw, ${sidebarWidth}px)` } as CSSProperties} data-sidebar-collapsed={sidebarCollapsed} data-resizing={resizing} data-intro={intro} data-mode={orb} data-view={graphOpen ? "graph" : "home"} data-rail-collapsed={railCollapsed} data-timing={showTiming}>
      <div className="face-loader" role="status" aria-hidden={intro === "out"}>
          <span />
          <p>Reading notes</p>
      </div>
      <div className="face-stage" data-orb="center" data-mode={orb}>
        <NoteGraph onNodes={setSourceNodes} inspectorHost={inspectorHost} onInspect={inspect} cue={cue} suspendEscape={working} graphOpen={graphOpen} onHome={() => setGraphOpen(false)} railCollapsed={railCollapsed} onToggleRail={() => {
          const next = !railCollapsed;
          setRailCollapsed(next);
          try { localStorage.setItem("jarvis-rail-collapsed", String(next)); } catch {}
        }} />
        <OrbStage
          mode={orb}
          levelRef={voice.levelRef}
          skill={shownSkill}
          place="center"
          caption={captionHold}
          captionOn={Boolean(speechLine)}
          onCornerClick={stopWork}
        />
      </div>
      <header className="face-header face-chrome" data-region="header">
        <div className="face-header-start">
          <p className="face-brand">JARVIS</p>
          <button type="button" className="view-toggle" onClick={() => setGraphOpen((open) => !open)}>{graphOpen ? "Home" : "Graph"}</button>
        </div>
        <p className="face-product">NEURAL OPERATING SYSTEM · v1</p>
        <p className="face-meta">
          Brain grok-4.7
          <span aria-hidden="true">·</span>
          Voice Altair
          <span aria-hidden="true">·</span>
          <span className="face-online" />
          Online
        </p>
      </header>
      {shownTask && shownTask.steps[0]?.label !== "Thinking" ? <WorkingPanel job={shownTask} leaving={job === null && preview !== "working"} onStop={stopWork} /> : null}
      <div className="face-dock face-chrome">
          <div className="face-bottom">
            {wake ? <p className="wake-hint">click to wake Jarvis</p> : null}
            {showMicNotice ? (
              <div className="mic-notice glass" role="status">
                <p>{micHint}</p>
                <button type="button" aria-label="Dismiss microphone notice" onClick={() => {
                  voice.dismissNotice();
                  if (blockedHint) {
                    setMicDismissed(true);
                    try { localStorage.setItem("jarvis-mic-blocked-dismissed", "true"); } catch {}
                  }
                }}>×</button>
              </div>
            ) : null}
            <form
              className="face-ask glass"
              data-region="ask"
              onSubmit={(event) => {
                event.preventDefault();
                void send(draft);
              }}
            >
              {askFocus && draft.trim() === "" ? (
                <div className="ask-chips">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="ask-chip"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setDraft(example);
                        inputRef.current?.focus();
                      }}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              ) : null}
              <span className="ask-label">ASK</span>
              <label className="sr-only" htmlFor="talk">
                Ask Jarvis
              </label>
              <input
                id="talk"
                ref={inputRef}
                value={draft}
                maxLength={2000}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="send"
                placeholder="Ask Jarvis"
                disabled={pending && !(fastVoice && realtimeAllowed)}
                onFocus={() => setAskFocus(true)}
                onBlur={() => setAskFocus(false)}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="submit" className="ask-go" aria-label="Send">
                <ArrowIcon />
              </button>
            </form>
            <div className="tool-row" role="group" aria-label="Tools">
              <ToolButton
                label="Hands"
                onClick={() => showTab("tasks")}
              >
                <HandIcon />
              </ToolButton>
              <ToolButton label="Calendar" disabled={pending} onClick={() => void send("What is on my calendar today?")}>
                <CalendarIcon />
              </ToolButton>
              <ToolButton label="School" onClick={() => pushCue({ focusHub: "School" })}>
                <SchoolIcon />
              </ToolButton>
              <ToolButton label="Vault" onClick={() => { pushCue({ fit: true }); setGraphOpen(true); }}>
                <VaultIcon />
              </ToolButton>
              <ToolButton
                label={voice.listening || realtimeListening ? "Stop microphone" : "Microphone"}
                tooltip={voice.micPermission === "denied" ? "Microphone blocked (see Settings)" : undefined}
                dimmed={voice.micPermission === "denied"}
                on={voice.listening || realtimeListening}
                onClick={() => void pressMicrophone()}
              >
                <MicIcon />
              </ToolButton>
              <div className="settings-control" ref={settingsRef}>
                <ToolButton label="Settings" expanded={settingsOpen} onClick={() => { if (!settingsOpen && sidebarCollapsed) toggleSidebar(); setSettingsOpen((open) => !open); }}>
                  <GearIcon />
                </ToolButton>
              </div>
            </div>
          </div>
      </div>
      {settingsOpen ? (
        <section ref={settingsPanelRef} id="face-settings" className="face-settings glass" role="dialog" aria-label="Settings">
          <div className="face-block-head">
            <p>Settings</p>
            <button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button>
          </div>
          <label className="face-check">
            <input type="checkbox" checked={spokenReplies} onChange={(event) => {
              setSpokenReplies(event.target.checked);
              chatSession.current?.setEnabled(fastVoice && event.target.checked);
              try { localStorage.setItem("jarvis-spoken-replies", String(event.target.checked)); } catch {}
            }} />
            Spoken replies (Altair)
          </label>
          <label className="face-check">
            <input type="checkbox" checked={showTiming} onChange={(event) => {
              setShowTiming(event.target.checked);
              try { localStorage.setItem("jarvis-show-timing", String(event.target.checked)); } catch {}
            }} />
            Show timing meta
          </label>
          <label className="face-check">
            <input type="checkbox" checked={fastVoice} onChange={(event) => {
              setFastVoice(event.target.checked);
              chatSession.current?.setEnabled(event.target.checked && spokenReplies);
              try { localStorage.setItem(FAST_VOICE_STORAGE_KEY, String(event.target.checked)); } catch {}
            }} />
            Fast voice (beta)
          </label>
          <p className="voice-minutes">Session: {voiceMinutes.toFixed(1)} min</p>
          <p className="mic-permission">Microphone: {voice.micPermission === "granted" ? "allowed" : voice.micPermission === "denied" ? "blocked" : voice.micPermission === "prompt" ? "not requested" : "status unavailable"}</p>
        </section>
      ) : null}
      <ChatCard
        sourceNodes={sourceNodes}
        onSource={source => { pushCue({ openNote: source }); inspect(); }}
        width={Math.min(sidebarWidth, windowWidth / 2)}
        maxWidth={windowWidth / 2}
        collapsed={sidebarCollapsed}
        onCollapse={toggleSidebar}
        onResize={resizeSidebar}
        onResizing={setResizing}
        inspectorRef={setInspectorHost}
        items={items}
        fastVoiceLog={fastVoiceLog}
        tab={tab}
        pending={pending}
        chatRef={chatRef}
        onTab={showTab}
        onDecide={(id, plan, choice) => void decide(id, plan, choice)}
      />
    </div>
  );
}

function WorkingPanel({ job, leaving, onStop }: { job: Job; leaving: boolean; onStop: () => void }) {
  const [now, setNow] = useState(() => performance.now());
  const running = !leaving && job.steps.some((step) => step.state === "running");
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(timer);
  }, [running]);
  const started = job.steps[0]?.startedAt ?? now;
  const ended = running ? now : job.steps.reduce((latest, step) => Math.max(latest, step.endedAt ?? started), started);
  const seconds = Math.max(0, (ended - started) / 1000);

  return (
    <section className={leaving ? "face-task glass is-leaving" : "face-task glass"} aria-label="Task">
      <p className="face-task-title">{job.objective}</p>
      <div className="face-task-row">
        <p>{seconds.toFixed(1)}s</p>
        <button type="button" className="work-stop" onClick={onStop}>
          Stop
        </button>
      </div>
    </section>
  );
}

function ChatCard({
  sourceNodes,
  onSource,
  items,
  fastVoiceLog,
  tab,
  pending,
  chatRef,
  onTab,
  onDecide,
  width,
  maxWidth,
  collapsed,
  onCollapse,
  onResize,
  onResizing,
  inspectorRef,
}: {
  sourceNodes: GraphNode[];
  onSource: (source: string) => void;
  width: number;
  maxWidth: number;
  collapsed: boolean;
  onCollapse: () => void;
  onResize: (width: number) => void;
  onResizing: (active: boolean) => void;
  inspectorRef: (host: HTMLDivElement | null) => void;
  items: LogItem[];
  fastVoiceLog: string;
  tab: LogTab;
  pending: boolean;
  chatRef: RefObject<HTMLDivElement | null>;
  onTab: (tab: LogTab) => void;
  onDecide: (id: string, plan: HandPlan, choice: "yes" | "no") => void;
}) {
  return (
    <aside className="face-sidebar glass face-chrome" aria-label="Workspace sidebar">
      <button type="button" className="sidebar-reopen" aria-label="Open sidebar" aria-expanded={!collapsed} onClick={onCollapse}>‹ <span>{tab}</span></button>
      <div className="sidebar-content" inert={collapsed}>
        <div className="sidebar-resize" role="separator" aria-label="Resize sidebar" aria-orientation="vertical" aria-valuemin={300} aria-valuemax={maxWidth} aria-valuenow={width} tabIndex={0}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); onResizing(true); }}
          onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) onResize(window.innerWidth - event.clientX - 16); }}
          onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); onResizing(false); }}
          onLostPointerCapture={() => onResizing(false)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            onResize(event.key === "Home" ? 300 : event.key === "End" ? window.innerWidth / 2 : width + (event.key === "ArrowLeft" ? 20 : -20));
          }} />
        <div className="sidebar-heading"><p className="face-block-label">Workspace</p><button type="button" className="inspector-back" aria-label="Collapse sidebar" aria-expanded={!collapsed} onClick={onCollapse}>›</button></div>
        <div className="chat-tabs" role="tablist" aria-label="Sidebar">
          {(["chat", "tasks", "log", "inspector"] as const).map((name) => (
            <button key={name} id={`tab-${name}`} aria-controls={`panel-${name}`} type="button" role="tab" tabIndex={tab === name ? 0 : -1} aria-selected={tab === name} data-active={tab === name ? "true" : "false"} onClick={() => onTab(name)}
              onKeyDown={(event) => {
                const tabs = ["chat", "tasks", "log", "inspector"] as const;
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const index = event.key === "Home" ? 0 : event.key === "End" ? 3 : (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 3)) % 4;
                onTab(tabs[index]); document.getElementById(`tab-${tabs[index]}`)?.focus();
              }}>
              {name}
            </button>
          ))}
        </div>
        <div key={tab} className="face-chat chat-log" role="tabpanel" id={`panel-${tab === "inspector" ? "chat" : tab}`} aria-labelledby={`tab-${tab === "inspector" ? "chat" : tab}`} hidden={tab === "inspector"} ref={chatRef}>
          {tab === "chat" ? <ChatLines items={items} sourceNodes={sourceNodes} onSource={onSource} /> : null}
          {tab === "tasks" ? <TaskLines items={items} pending={pending} onDecide={onDecide} /> : null}
          {tab === "log" ? <>{fastVoiceLog ? <p className="chat-timing" role="status">{fastVoiceLog}</p> : null}<LogLines items={items} /></> : null}
        </div>
        <div className="sidebar-inspector" role="tabpanel" id="panel-inspector" aria-labelledby="tab-inspector" hidden={tab !== "inspector"}>
          <button type="button" className="back-to-chat" onClick={() => onTab("chat")}>← Back to chat</button>
          <div className="inspector-host" ref={inspectorRef} />
        </div>
      </div>
    </aside>
  );
}

function TimingLine({ tokenMs, voiceMs, model }: { tokenMs?: number; voiceMs?: number; model?: string }) {
  if (model === "voice") return <p className="chat-timing">voice</p>;
  if (tokenMs === undefined) return null;
  return (
    <p className="chat-timing">
      {model === "grok-4.20-0309-non-reasoning" ? "fast" : model ?? "grok-4.7"} · {((voiceMs ?? tokenMs) / 1000).toFixed(1)}s
    </p>
  );
}

function SourceChips({ chips, nodes, onOpen }: { chips: string[]; nodes: GraphNode[]; onOpen: (source: string) => void }) {
  if (chips.length === 0) return null;
  return (
    <p className="chat-chips">
      {chips.map(chip => {
        const note = matchGraphNode(nodes.filter(node => node.file && !node.anchor), chip);
        return <button type="button" key={chip} className="chat-chip" onClick={() => onOpen(note?.id ?? chip)}>
          {note?.title ?? chip.replace(/\.md$/i, "").replace(/[-_]/g, " ")}
        </button>;
      })}
    </p>
  );
}

function ChatLines({ items, sourceNodes, onSource }: { items: LogItem[]; sourceNodes: GraphNode[]; onSource: (source: string) => void }) {
  const rows = inTimeOrder(collapseCalendar(items.filter((item) => item.kind === "you" || item.kind === "jarvis" || item.kind === "hand")));
  if (rows.length === 0) return <div className="empty-state"><p>No chats yet</p><span>Ask Jarvis below, or use the microphone to start a conversation.</span></div>;
  return (
    <>
      {rows.map((item) => {
        if (item.kind === "you") {
          return (
            <article key={item.id} className="chat-line">
              <p className="chat-meta">You · {formatStamp(item.at)}</p>
              <p>{item.text}</p>
            </article>
          );
        }
        if (item.kind === "jarvis") {
          const shown = replyForChat(item.text, item.sources);
          return (
            <article key={item.id} className="chat-line">
              <p className="chat-meta">Jarvis · {formatStamp(item.at)}</p>
              <p className="chat-reply">{shown.body}</p>
              <SourceChips chips={shown.chips} nodes={sourceNodes} onOpen={onSource} />
              <TimingLine tokenMs={item.tokenMs} voiceMs={item.voiceMs} model={item.model} />
            </article>
          );
        }
        if (item.kind === "hand") {
          const shown = replyForChat(item.reply, undefined);
          return (
            <article key={item.id} className="chat-line">
              <p className="chat-meta">Jarvis · {formatStamp(item.at)}</p>
              <p className="chat-reply">{shown.body}</p>
              <SourceChips chips={shown.chips} nodes={sourceNodes} onOpen={onSource} />
              <TimingLine tokenMs={item.tokenMs} voiceMs={item.voiceMs} model={item.model} />
            </article>
          );
        }
        const neverItem: never = item;
        return neverItem;
      })}
    </>
  );
}

function TaskLines({
  items,
  pending,
  onDecide,
}: {
  items: LogItem[];
  pending: boolean;
  onDecide: (id: string, plan: HandPlan, choice: "yes" | "no") => void;
}) {
  const hands = items.filter((item) => item.kind === "hand" && !isStubTask(item));
  if (hands.length === 0) return <div className="empty-state"><p>No tasks</p><span>Requests that need your approval will appear here.</span></div>;
  return (
    <>
      {hands.map((item) =>
        item.kind === "hand" ? (
          <article key={item.id} className="chat-line">
            <p className="chat-meta">{item.plan?.tool ?? "Task"} · {formatStamp(item.at)}</p>
            <p>{item.cancelled ? item.reply : item.plan?.title || item.reply}</p>
            {item.cancelled
              ? null
              : item.plan?.steps.map((step) => (
                  <p key={step}>{step}</p>
                ))}
            {item.cancelled
              ? null
              : item.receipts.map((receipt) => (
                  <p key={receipt.id}>{receipt.outcome}</p>
                ))}
            {!item.cancelled && item.plan && item.plan.state === "waiting" && item.plan.gate === "confirm" ? (
              <p>
                <button type="button" className="hand-yes" disabled={pending} onClick={() => onDecide(item.id, item.plan as HandPlan, "yes")}>
                  Yes
                </button>
                {"  "}
                <button type="button" className="hand-no" disabled={pending} onClick={() => onDecide(item.id, item.plan as HandPlan, "no")}>
                  No
                </button>
              </p>
            ) : null}
          </article>
        ) : null,
      )}
    </>
  );
}

function LogLines({ items }: { items: LogItem[] }) {
  const rows = inTimeOrder(items).filter(item => (item.kind === "jarvis" || item.kind === "hand") && item.tokenMs !== undefined);
  if (!rows.length) return <div className="empty-state"><p>No timings yet</p></div>;
  return <>{rows.map(item => (item.kind === "jarvis" || item.kind === "hand") ? (
    <p key={item.id} className="turn-metrics" data-ttft={item.tokenMs} data-ttfa={item.voiceMs}>
      TTFT {item.tokenMs} ms · TTFA {item.voiceMs === undefined ? "—" : `${item.voiceMs} ms`}
    </p>
  ) : null)}</>;
}

function ToolButton({
  label,
  on,
  onClick,
  disabled = false,
  expanded,
  tooltip,
  dimmed,
  children,
}: {
  label: string;
  on?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  expanded?: boolean;
  tooltip?: string;
  dimmed?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" className="tool-btn" data-dimmed={dimmed} aria-label={label} aria-disabled={disabled} aria-expanded={expanded} aria-controls={expanded !== undefined ? "face-settings" : undefined} data-on={on ? "true" : "false"} onClick={disabled ? undefined : onClick}>
      {children}
      <span className="tool-tip" role="tooltip">
        {tooltip ?? label}
      </span>
    </button>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function HandIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 7V3.5M8.5 7V3M11 7.5V4.5M6 7.5c-1.6.2-2.5 1.4-2.5 3.1 0 2 1.4 3.4 3.6 3.4h2.2c1.8 0 3.2-1.2 3.2-3V8" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.5" y="3.5" width="11" height="10" />
      <path d="M2.5 6.5h11M5.5 2.5v2M10.5 2.5v2" />
    </svg>
  );
}

function SchoolIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 6.5 8 3.5l6 3L8 9.5 2 6.5zM4.5 8v3.2c1 .8 2.2 1.2 3.5 1.2s2.5-.4 3.5-1.2V8" />
    </svg>
  );
}

function VaultIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="2.5" width="10" height="11" />
      <path d="M6 2.5v11M3 6h3M3 10h3" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="6" y="2" width="4" height="7" rx="2" />
      <path d="M4.5 7.5a3.5 3.5 0 0 0 7 0M8 11v2.5" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2.2v1.6M8 12.2v1.6M2.2 8h1.6M12.2 8h1.6M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12" />
    </svg>
  );
}

function isHandResponse(value: unknown): value is { reply: string; receipts: Receipt[]; plan: HandPlan } {
  if (!value || typeof value !== "object") return false;
  const record = value as { reply?: unknown; receipts?: unknown; plan?: unknown };
  return (
    typeof record.reply === "string" &&
    Array.isArray(record.receipts) &&
    record.receipts.every(isReceipt) &&
    isHandPlan(record.plan)
  );
}

function isHandsTurn(payload: ChatResponse): boolean {
  return Boolean(payload.plan) || payload.receipts.length > 0 || /phone call/i.test(payload.reply);
}

function loadedContext(payload: ChatResponse): string[] {
  const brief = payload.brief;
  if (brief && isMorningBrief(brief)) {
    return brief.sources.length > 0 ? brief.sources : brief.checked;
  }
  return payload.sources ?? [];
}

function isStubTask(item: LogItem): boolean {
  if (item.kind !== "hand") return false;
  if (item.plan && STUB_TASKS.has(item.plan.tool)) return true;
  return item.receipts.length > 0 && item.receipts.every((receipt) => STUB_TASKS.has(receipt.tool));
}

function plainSkill(tool: string): string {
  const head = tool.split(".")[0]?.trim().toLowerCase() ?? "";
  return head || "task";
}

function handObjective(plan: HandPlan): string {
  const title = (plan.input.title ?? "").trim();
  const when = (plan.input.when ?? "").trim();
  const file = (plan.input.file ?? "").trim();
  switch (plan.tool) {
    case "calendar.write":
      if (title && when) return `Save ${title} for ${when}`;
      return title ? `Save ${title}` : "Save the event";
    case "calendar.delete":
      return title ? `Delete ${title}` : "Delete the event";
    case "calendar.list":
      return "Check the calendar";
    case "notes.recall":
      return "Search notes";
    case "notes.keep":
      return file ? `Update ${file}` : "Update a note";
    default:
      return plan.title || "Ask";
  }
}

function handStepLabel(plan: HandPlan): string {
  switch (plan.tool) {
    case "calendar.write":
      return "Saving the event";
    case "calendar.delete":
      return "Deleting the event";
    case "calendar.list":
      return "Checking the calendar";
    case "notes.keep":
      return "Saving the note";
    case "notes.recall":
      return "Searching notes";
    default:
      return "Working";
  }
}
