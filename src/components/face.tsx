"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { NoteGraph, type GraphCue } from "@/components/note-graph";
import { OrbStage, type OrbPlace } from "@/components/orb-stage";
import { useVoice } from "@/components/use-voice";
import { makeId } from "@/lib/ids";
import { resolveOrbMode, type OrbMode } from "@/lib/orb-mode";
import {
  isHandPlan,
  isMorningBrief,
  isReceipt,
  type CalendarEvent,
  type ChatResponse,
  type HandPlan,
  type Receipt,
} from "@/lib/types";
import type { MouthKind } from "@/lib/voice/types";
import { decideFaceMode } from "@/lib/view-intent";

const BOOT_KEY = "jarvis-boot";
const EXAMPLES = ["remind me…", "good morning", "show swim times"] as const;

let greetedThisLoad = false;

type LogItem =
  | { kind: "you"; id: string; text: string; at: string }
  | { kind: "jarvis"; id: string; text: string; at: string; sources?: string[]; failed?: boolean }
  | { kind: "hand"; id: string; at: string; reply: string; plan?: HandPlan; receipts: Receipt[]; cancelled?: boolean };

type Job = {
  objective: string;
  steps: string[];
  abort: AbortController;
};

type LogTab = "chat" | "tasks" | "log";

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

function voiceName(mouth: MouthKind | "unknown"): string {
  switch (mouth) {
    case "grok":
      return "Altair";
    case "azure":
      return "British";
    case "browser":
      return "This computer";
    case "unknown":
      return "Checking";
    case "not-live":
      return "Not live";
    default: {
      const neverMouth: never = mouth;
      return neverMouth;
    }
  }
}

function orbPlace(working: boolean, mode: OrbMode): OrbPlace {
  if (working) return "corner";
  if (mode === "listening" || mode === "speaking") return "center";
  return "dock";
}

export function Face() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [draft, setDraft] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [ackOn, setAckOn] = useState(false);
  const [working, setWorking] = useState(false);
  const [skill, setSkill] = useState<string | null>(null);
  const [cue, setCue] = useState<GraphCue | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<LogTab>("chat");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [intro, setIntro] = useState<"in" | "out">("in");
  const [wake, setWake] = useState(false);
  const [liveLine, setLiveLine] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const cueToken = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const bootTimer = useRef<number | null>(null);
  const ackTimer = useRef<number | null>(null);
  const pendingRef = useRef(false);
  const speakingRef = useRef(false);
  const voice = useVoice((active) => {
    speakingRef.current = active;
    setSpeaking(active);
  });
  const speakRef = useRef(voice.speak);
  speakRef.current = voice.speak;
  const orb = resolveOrbMode({
    speaking,
    working,
    listening: voice.listening,
    ack: ackOn,
  });
  const place = orbPlace(working, orb);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = window.requestAnimationFrame(() => setIntro("out"));
    bootTimer.current = window.setTimeout(() => {
      markBootDone();
      void greet();
    }, reduce ? 200 : 1600);
    void loadCalendar(setEvents);
    return () => {
      window.cancelAnimationFrame(frame);
      if (bootTimer.current !== null) window.clearTimeout(bootTimer.current);
      if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!wake) return;
    let stopped = false;
    let busy = false;
    const start = () => {
      if (stopped || busy) return;
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
    if (!working) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      stopWork();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [working, job]);

  async function greet() {
    if (greetedThisLoad) return;
    greetedThisLoad = true;
    const line = greetingLine(new Date());
    setLiveLine(line);
    const result = await speakRef.current(line);
    if (result.blocked) setWake(true);
  }

  function clearAckTimer() {
    if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    ackTimer.current = null;
  }

  function beginWork(objective: string, steps: string[] = [], skillName: string | null = null) {
    const abort = new AbortController();
    pendingRef.current = true;
    setPending(true);
    setJob({ objective, steps, abort });
    setSkill(skillName);
    setAckOn(true);
    clearAckTimer();
    ackTimer.current = window.setTimeout(() => {
      setAckOn(false);
      if (pendingRef.current) setWorking(true);
    }, 300);
    return abort;
  }

  function finishJob() {
    pendingRef.current = false;
    setPending(false);
    setWorking(false);
    setSkill(null);
    setJob(null);
    setAckOn(false);
    clearAckTimer();
  }

  function stopWork() {
    job?.abort.abort();
    finishJob();
  }

  function pushCue(next: Omit<GraphCue, "token">) {
    cueToken.current += 1;
    setCue({ token: cueToken.current, ...next });
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pendingRef.current) return;
    voice.stop();
    const decision = decideFaceMode(trimmed);
    const at = new Date().toISOString();
    if (decision.exclusive) {
      if (decision.view === "graph") {
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
    const abort = beginWork(trimmed);
    let reply = "";
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: trimmed }] }),
        signal: abort.signal,
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isChatResponse(payload)) {
        setItems((current) =>
          [
            ...current,
            {
              kind: "jarvis" as const,
              id: makeId("ans"),
              text: "Jarvis did not answer. Nothing was invented.",
              at,
              failed: true,
            },
          ].slice(-40),
        );
        return;
      }
      if (isHandsTurn(payload)) {
        setItems((current) =>
          [
            ...current,
            {
              kind: "hand" as const,
              id: makeId("hand"),
              at,
              reply: payload.reply,
              plan: payload.plan,
              receipts: payload.receipts,
            },
          ].slice(-40),
        );
        if (payload.plan?.state === "waiting") setTab("tasks");
        if (touchesCalendar(payload.plan?.tool, payload.receipts)) void loadCalendar(setEvents);
        reply = payload.reply;
        return;
      }
      const brief = payload.brief;
      if (brief && isMorningBrief(brief)) {
        setItems((current) =>
          [
            ...current,
            {
              kind: "jarvis" as const,
              id: makeId("brief"),
              text: brief.reply,
              sources: brief.sources,
              at,
            },
          ].slice(-40),
        );
        reply = brief.reply;
        return;
      }
      setItems((current) =>
        [
          ...current,
          {
            kind: "jarvis" as const,
            id: makeId("ans"),
            text: payload.reply,
            sources: payload.sources,
            at,
          },
        ].slice(-40),
      );
      reply = payload.reply;
    } catch (error) {
      if (abort.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        setItems((current) =>
          [
            ...current,
            {
              kind: "jarvis" as const,
              id: makeId("ans"),
              text: "Stopped. I do not know if that finished.",
              at,
            },
          ].slice(-40),
        );
        return;
      }
      setItems((current) =>
        [
          ...current,
          {
            kind: "jarvis" as const,
            id: makeId("ans"),
            text: "I couldn't reach Jarvis. Try again.",
            at,
            failed: true,
          },
        ].slice(-40),
      );
    } finally {
      finishJob();
    }
    if (reply.trim()) {
      setLiveLine(reply);
      await voice.speak(reply);
    }
  }

  async function decide(itemId: string, plan: HandPlan, decision: "yes" | "no") {
    if (plan.state !== "waiting" || plan.gate !== "confirm" || pendingRef.current) return;
    const name = plan.tool.trim().replace(/\./g, "-").toUpperCase();
    const abort = beginWork(plan.title || plan.tool, plan.steps, name);
    let reply = "";
    try {
      const response = await fetch("/api/hands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: plan.tool, input: plan.input, decision }),
        signal: abort.signal,
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isHandResponse(payload)) return;
      setItems((current) =>
        current.map((item) =>
          item.kind === "hand" && item.id === itemId
            ? { ...item, reply: payload.reply, plan: payload.plan, receipts: payload.receipts }
            : item,
        ),
      );
      if (touchesCalendar(payload.plan.tool, payload.receipts)) void loadCalendar(setEvents);
      reply = payload.reply;
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
        if (touchesCalendar(plan.tool, [])) void loadCalendar(setEvents);
        return;
      }
    } finally {
      finishJob();
    }
    if (reply.trim()) {
      setLiveLine(reply);
      await voice.speak(reply);
    }
  }

  function showCalendar() {
    const at = new Date().toISOString();
    const text =
      events.length === 0
        ? "Nothing is saved on the calendar."
        : events.map((event) => `${event.title} — ${event.when}`).join("\n");
    setTab("chat");
    setItems((current) => [...current, { kind: "jarvis" as const, id: makeId("cal"), text, at }].slice(-40));
    setLiveLine(events[0] ? `${events[0].title}, ${events[0].when}` : "Nothing is saved on the calendar.");
  }

  const micHint = voice.notice && /microphone/i.test(voice.notice) ? voice.notice : "";
  const caption = voice.listening ? draft : speaking ? liveLine : micHint;
  const waitingHand = items.find(
    (item) => item.kind === "hand" && !item.cancelled && item.plan?.state === "waiting" && item.plan.gate === "confirm",
  );

  return (
    <div className="face" data-intro={intro}>
      <div className="face-stage" data-orb={place}>
        <NoteGraph cue={cue} suspendEscape={working} />
        <OrbStage mode={orb} levelRef={voice.levelRef} skill={skill} place={place} onCornerClick={stopWork} />
      </div>
      <header className="face-header face-chrome">
        <p className="face-brand">JARVIS</p>
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
      {working && job ? (
        <WorkingPanel job={job} onStop={stopWork} />
      ) : (
        <>
          <div className="face-bottom face-chrome">
            {wake ? <p className="wake-hint">click to wake Jarvis</p> : null}
            {caption ? <p className="face-caption">{caption}</p> : null}
            <form
              className="face-ask glass"
              onSubmit={(event) => {
                event.preventDefault();
                void send(draft);
              }}
            >
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
                enterKeyHint="send"
                placeholder={EXAMPLES.map((example) => `“${example}”`).join("   ")}
                disabled={pending}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="submit" className="ask-go" aria-label="Send">
                <ArrowIcon />
              </button>
            </form>
            <div className="tool-row" role="group" aria-label="Tools">
              <ToolButton
                label="Hands"
                onClick={() => {
                  if (waitingHand) {
                    setTab("tasks");
                    return;
                  }
                  inputRef.current?.focus();
                }}
              >
                <HandIcon />
              </ToolButton>
              <ToolButton label="Calendar" onClick={showCalendar}>
                <CalendarIcon />
              </ToolButton>
              <ToolButton label="School" onClick={() => pushCue({ focusHub: "School" })}>
                <SchoolIcon />
              </ToolButton>
              <ToolButton label="Vault" onClick={() => pushCue({ fit: true })}>
                <VaultIcon />
              </ToolButton>
              <ToolButton
                label="Voice"
                on={voice.listening}
                onClick={() => {
                  voice.pressMic((text, isFinal) => {
                    if (isFinal) {
                      void send(text);
                      return;
                    }
                    setDraft(text);
                  });
                }}
              >
                <MicIcon />
              </ToolButton>
              <ToolButton label="Settings" on={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>
                <GearIcon />
              </ToolButton>
            </div>
          </div>
          {settingsOpen ? (
            <aside className="face-settings glass" aria-label="Settings">
              <p>Voice</p>
              <p>{voiceName(voice.mouth)}</p>
            </aside>
          ) : null}
          <ChatCard
            items={items}
            tab={tab}
            pending={pending}
            chatRef={chatRef}
            onTab={setTab}
            onDecide={(id, plan, choice) => void decide(id, plan, choice)}
          />
        </>
      )}
    </div>
  );
}

function WorkingPanel({ job, onStop }: { job: Job; onStop: () => void }) {
  return (
    <section className="face-work glass" aria-label="Task">
      <p className="work-kicker">Task</p>
      <h2 className="work-title">{job.objective}</h2>
      {job.steps.length > 0 ? (
        <ul className="work-steps">
          {job.steps.map((step) => (
            <li key={step}>
              <span>{step}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="work-foot">
        <p className="work-kicker">{job.steps.length > 0 ? `${job.steps.length} steps` : "Working"}</p>
        <button type="button" className="work-stop" onClick={onStop}>
          Stop
        </button>
      </div>
    </section>
  );
}

function ChatCard({
  items,
  tab,
  pending,
  chatRef,
  onTab,
  onDecide,
}: {
  items: LogItem[];
  tab: LogTab;
  pending: boolean;
  chatRef: RefObject<HTMLDivElement | null>;
  onTab: (tab: LogTab) => void;
  onDecide: (id: string, plan: HandPlan, choice: "yes" | "no") => void;
}) {
  return (
    <section className="face-chat glass face-chrome" aria-label="Chat">
      <div className="chat-tabs" role="tablist">
        {(["chat", "tasks", "log"] as const).map((name) => (
          <button key={name} type="button" role="tab" data-active={tab === name ? "true" : "false"} onClick={() => onTab(name)}>
            {name}
          </button>
        ))}
      </div>
      <div className="chat-log" ref={chatRef}>
        {tab === "chat" ? <ChatLines items={items} /> : null}
        {tab === "tasks" ? <TaskLines items={items} pending={pending} onDecide={onDecide} /> : null}
        {tab === "log" ? <LogLines items={items} /> : null}
      </div>
    </section>
  );
}

function ChatLines({ items }: { items: LogItem[] }) {
  const rows = items.filter((item) => item.kind === "you" || item.kind === "jarvis" || item.kind === "hand");
  if (rows.length === 0) return <p className="face-hint">Ask when you are ready.</p>;
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
          return (
            <article key={item.id} className="chat-line">
              <p className="chat-meta">Jarvis · {formatStamp(item.at)}</p>
              <p>{item.text}</p>
              {item.sources && item.sources.length > 0 ? <p className="chat-sources">Sources: {item.sources.join(", ")}</p> : null}
            </article>
          );
        }
        return (
          <article key={item.id} className="chat-line">
            <p className="chat-meta">Jarvis · {formatStamp(item.at)}</p>
            <p>{item.reply}</p>
          </article>
        );
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
  const hands = items.filter((item) => item.kind === "hand");
  if (hands.length === 0) return <p className="face-hint">No task is waiting.</p>;
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
  if (items.length === 0) return <p className="face-hint">Nothing yet.</p>;
  return (
    <>
      {items.map((item) => {
        const text = item.kind === "you" ? item.text : item.kind === "jarvis" ? item.text : item.reply;
        const who = item.kind === "you" ? "You" : "Jarvis";
        return (
          <article key={item.id} className="chat-line">
            <p className="chat-meta">
              {formatStamp(item.at)} · {who}
            </p>
            <p>{text}</p>
          </article>
        );
      })}
    </>
  );
}

function ToolButton({
  label,
  on,
  onClick,
  children,
}: {
  label: string;
  on?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="tool-btn" aria-label={label} title={label} data-on={on ? "true" : "false"} onClick={onClick}>
      {children}
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

function isChatResponse(value: unknown): value is ChatResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ChatResponse> & { receipts?: unknown };
  return (
    typeof record.reply === "string" &&
    (record.mode === "grok" || record.mode === "demo") &&
    Array.isArray(record.receipts) &&
    record.receipts.every(isReceipt) &&
    (record.plan === undefined || isHandPlan(record.plan))
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

function touchesCalendar(tool: string | undefined, receipts: Receipt[]): boolean {
  return tool?.startsWith("calendar.") === true || receipts.some((receipt) => receipt.tool.startsWith("calendar."));
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<CalendarEvent>;
  return typeof event.id === "string" && typeof event.title === "string" && typeof event.when === "string";
}

async function loadCalendar(setEvents: (events: CalendarEvent[]) => void) {
  try {
    const response = await fetch("/api/calendar");
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return;
    const list = (payload as { events?: unknown }).events;
    if (!Array.isArray(list)) return;
    setEvents(list.filter(isCalendarEvent));
  } catch {
    // The chat card still opens if the calendar cannot be read.
  }
}
