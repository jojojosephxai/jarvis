"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { BootScreen } from "@/components/boot-screen";
import { NoteGraph, type GraphCue } from "@/components/note-graph";
import { PlanCard } from "@/components/plan-card";
import { ReceiptCard } from "@/components/receipt-card";
import { OrbStage } from "@/components/orb-stage";
import { type OrbMode } from "@/components/reactor";
import { resolveOrbMode } from "@/lib/orb-mode";
import { useVoice } from "@/components/use-voice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VoiceButtons, VoiceStatus } from "@/components/voice-controls";
import { makeId } from "@/lib/ids";
import {
  isHandPlan,
  isMorningBrief,
  isReceipt,
  type CalendarEvent,
  type ChatResponse,
  type HandPlan,
  type MorningBrief,
  type Receipt,
} from "@/lib/types";
import type { MouthKind } from "@/lib/voice/types";
import { FACE_VIEWS, decideFaceMode, viewLabel, type FaceView } from "@/lib/view-intent";

const BOOT_KEY = "jarvis-boot";

type BrainLabel = "Vault" | "grok-4.7" | "Brain wiring";

function markBootDone() {
  try {
    sessionStorage.setItem(BOOT_KEY, "1");
    document.documentElement.dataset.boot = "done";
  } catch {
    // Session storage can be blocked. The boot still ends.
  }
}

type LogItem =
  | { kind: "you"; id: string; text: string; at: string }
  | { kind: "stub"; id: string; heard: string; at: string; view: FaceView }
  | { kind: "answer"; id: string; text: string; notice?: string; at: string; failed?: boolean }
  | { kind: "hand"; id: string; at: string; reply: string; plan?: HandPlan; receipts: Receipt[] }
  | { kind: "brief"; id: string; at: string; brief: MorningBrief };

function stubOutcome(view: FaceView): string {
  return `View is now ${viewLabel(view)}. That change stays on this screen.`;
}

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function Face() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [draft, setDraft] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [ackOn, setAckOn] = useState(false);
  const [working, setWorking] = useState(false);
  const [viewMode, setViewMode] = useState<FaceView>("graph");
  const [cue, setCue] = useState<GraphCue | null>(null);
  const cueToken = useRef(0);
  const [talkOpen, setTalkOpen] = useState(false);
  const [booting, setBooting] = useState(true);
  const [pending, setPending] = useState(false);
  const [brainLabel, setBrainLabel] = useState<BrainLabel>("Vault");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bootTimer = useRef<number | null>(null);
  const ackTimer = useRef<number | null>(null);
  const pendingRef = useRef(false);
  const speakingRef = useRef(false);
  const voice = useVoice((active) => {
    speakingRef.current = active;
    setSpeaking(active);
  });
  const orb = resolveOrbMode({
    speaking,
    working,
    listening: voice.listening,
    ack: ackOn,
  });

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = document.documentElement.dataset.boot === "done";
    const delay = seen ? 0 : reduce ? 400 : 2200;
    bootTimer.current = window.setTimeout(() => {
      markBootDone();
      setBooting(false);
    }, delay);
    void loadCalendar(setEvents);
    return () => {
      if (bootTimer.current !== null) window.clearTimeout(bootTimer.current);
      if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then((response) => response.json())
      .then((payload: unknown) => {
        if (cancelled) return;
        if (!payload || typeof payload !== "object") {
          setBrainLabel("Brain wiring");
          return;
        }
        const mode = (payload as { mode?: unknown }).mode;
        if (mode === "grok") setBrainLabel("grok-4.7");
        else if (mode === "demo") setBrainLabel("Vault");
        else setBrainLabel("Brain wiring");
      })
      .catch(() => {
        if (!cancelled) setBrainLabel("Brain wiring");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function endBoot() {
    if (bootTimer.current !== null) {
      window.clearTimeout(bootTimer.current);
      bootTimer.current = null;
    }
    markBootDone();
    setBooting(false);
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items]);

  function clearAckTimer() {
    if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    ackTimer.current = null;
  }

  function pulseOrb() {
    if (speakingRef.current || pendingRef.current) return;
    setAckOn(true);
    clearAckTimer();
    ackTimer.current = window.setTimeout(() => setAckOn(false), 900);
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }

  function startJob() {
    pendingRef.current = true;
    setPending(true);
    setWorking(false);
    setAckOn(true);
    clearAckTimer();
    ackTimer.current = window.setTimeout(() => {
      setAckOn(false);
      if (pendingRef.current) setWorking(true);
    }, 900);
  }

  function startHands() {
    pendingRef.current = true;
    setPending(true);
    clearAckTimer();
    setAckOn(false);
    setWorking(true);
  }

  function finishJob() {
    pendingRef.current = false;
    setPending(false);
    setWorking(false);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pendingRef.current) return;
    voice.stop();
    const decision = decideFaceMode(trimmed);
    const at = new Date().toISOString();
    setTalkOpen(true);
    setViewMode(decision.view);
    if (decision.exclusive) {
      if (decision.view === "graph") {
        cueToken.current += 1;
        setCue({
          token: cueToken.current,
          focusQuery: decision.focusQuery,
          pathFrom: decision.pathFrom,
          pathTo: decision.pathTo,
        });
      }
      setItems((current) =>
        [
          ...current,
          { kind: "you" as const, id: makeId("you"), text: trimmed, at },
          { kind: "stub" as const, id: makeId("stub"), heard: trimmed, at, view: decision.view },
        ].slice(-40),
      );
      setDraft("");
      pulseOrb();
      return;
    }

    setItems((current) => [...current, { kind: "you" as const, id: makeId("you"), text: trimmed, at }].slice(-40));
    setDraft("");
    startJob();
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: trimmed }] }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isChatResponse(payload)) {
        const error =
          payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "Brain wiring: the brain did not answer. Nothing was invented.";
        setItems((current) =>
          [
            ...current,
            { kind: "answer" as const, id: makeId("ans"), text: error, at, failed: true },
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
        if (touchesCalendar(payload.plan?.tool, payload.receipts)) void loadCalendar(setEvents);
        await voice.speak(payload.reply);
        return;
      }
      const brief = payload.brief;
      if (brief && isMorningBrief(brief)) {
        setItems((current) =>
          [...current, { kind: "brief" as const, id: makeId("brief"), at, brief }].slice(-40),
        );
        return;
      }
      setItems((current) =>
        [
          ...current,
          {
            kind: "answer" as const,
            id: makeId("ans"),
            text: payload.reply,
            notice: payload.notice,
            at,
          },
        ].slice(-40),
      );
      await voice.speak(payload.reply);
    } catch {
      setItems((current) =>
        [
          ...current,
          {
            kind: "answer" as const,
            id: makeId("ans"),
            text: "Brain wiring: I couldn't reach the brain. Check that the server is running, then try again.",
            at,
            failed: true,
          },
        ].slice(-40),
      );
    } finally {
      finishJob();
    }
  }

  async function runBrief() {
    if (pendingRef.current) return;
    setViewMode("orb");
    setTalkOpen(true);
    const at = new Date().toISOString();
    setItems((current) =>
      [...current, { kind: "you" as const, id: makeId("you"), text: "Morning brief", at }].slice(-40),
    );
    startJob();
    try {
      const response = await fetch("/api/brief");
      const payload: unknown = await response.json();
      if (!response.ok || !isMorningBrief(payload)) {
        const error =
          payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "The morning brief did not load. Nothing was invented from the calendar or the vault.";
        setItems((current) =>
          [...current, { kind: "answer" as const, id: makeId("ans"), text: error, at, failed: true }].slice(-40),
        );
        return;
      }
      setItems((current) =>
        [...current, { kind: "brief" as const, id: makeId("brief"), at, brief: payload }].slice(-40),
      );
    } catch {
      setItems((current) =>
        [
          ...current,
          {
            kind: "answer" as const,
            id: makeId("ans"),
            text: "The morning brief did not load. Check that the server is running, then try again. Nothing was invented.",
            at,
            failed: true,
          },
        ].slice(-40),
      );
    } finally {
      finishJob();
    }
  }

  async function decide(itemId: string, plan: HandPlan, decision: "yes" | "no") {
    if (plan.state !== "waiting" || plan.gate !== "confirm" || pendingRef.current) return;
    startHands();
    try {
      const response = await fetch("/api/hands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: plan.tool, input: plan.input, decision }),
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
      await voice.speak(payload.reply);
    } catch {
      // The plan stays waiting so it can be tried again.
    } finally {
      finishJob();
    }
  }

  return (
    <div className="hud">
      {booting ? <BootScreen onSkip={endBoot} brainLabel={brainLabel} mouth={voice.mouth} /> : null}
      <header className="hud-top">
        <div>
          <p className="hud-mark">J.A.R.V.I.S.</p>
        </div>
        <dl className="hud-status" aria-label="Status">
          <div>
            <dt>Face</dt>
            <dd>Online</dd>
          </div>
          <div>
            <dt>Brain</dt>
            <dd>{brainLabel}</dd>
          </div>
          <div>
            <dt>Voice</dt>
            <dd>{voiceLamp(voice.mouth)}</dd>
          </div>
        </dl>
      </header>
      <div className="hud-stage">
        <OpticStage view={viewMode} orb={orb} cue={cue} brainTag={brainLabel} levelRef={voice.levelRef} />
        <div className="mode-rail" role="group" aria-label="View">
          {FACE_VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              className="mode-rail-item"
              data-active={viewMode === view ? "true" : "false"}
              aria-pressed={viewMode === view}
              onClick={() => setViewMode(view)}
            >
              {viewLabel(view)}
            </button>
          ))}
        </div>
      </div>
      <section className="talk-drawer" data-open={talkOpen ? "true" : "false"} aria-label="Talk">
        {talkOpen ? (
          <div className="talk-log">
            <div className="comms-head">
              <div className="comms-title">
                <h2>Talk</h2>
                <p>{pending ? "Reading" : "Vault"}</p>
              </div>
              <div className="comms-actions">
                <Button
                  type="button"
                  variant="ghost"
                  className="hud-chip h-9 rounded-none px-3"
                  disabled={pending}
                  onClick={() => void runBrief()}
                >
                  Morning brief
                </Button>
                {items.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="hud-chip h-9 rounded-none px-3"
                    onClick={() => {
                      voice.stop();
                      setItems([]);
                    }}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>
            {events.length > 0 ? (
              <div className="talk-calendar" aria-label="Demo calendar">
                <p className="talk-calendar-label">Calendar · {events.length}</p>
                <ul>
                  {events.map((event) => (
                    <li key={event.id}>
                      <span>{event.title}</span>
                      <span>{event.when}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {items.length === 0 ? (
              <p className="empty-talk">Notes, or Morning brief.</p>
            ) : (
              <div className="talk-list" aria-live="polite">
                {items.map((item) => (
                  <LogItemView
                    key={item.id}
                    item={item}
                    pending={pending}
                    onDecide={(choice) => {
                      if (item.kind === "hand" && item.plan) void decide(item.id, item.plan, choice);
                    }}
                  />
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>
        ) : null}
        <div className="talk-bar">
          <Button
            type="button"
            variant="ghost"
            className="talk-toggle h-8 rounded-none px-2.5"
            aria-expanded={talkOpen}
            onClick={() => setTalkOpen((open) => !open)}
          >
            Talk
            {items.length > 0 ? <span className="talk-count">{items.length}</span> : null}
          </Button>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <label className="sr-only" htmlFor="talk">
              Talk to Jarvis
            </label>
            <Input
              id="talk"
              ref={inputRef}
              value={draft}
              maxLength={2000}
              autoComplete="off"
              enterKeyHint="send"
              placeholder="Type here"
              className="h-8 min-w-0 flex-1 rounded-none border-border bg-card px-2.5 text-sm md:text-sm"
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => inputRef.current?.scrollIntoView({ block: "nearest" })}
              disabled={pending}
            />
            <VoiceButtons
              listening={voice.listening}
              pending={pending}
              onMic={() => {
                voice.pressMic((text, isFinal) => {
                  if (isFinal) {
                    void send(text);
                    return;
                  }
                  setDraft(text);
                });
              }}
              onSpeak={() => {
                void voice.speak(lastSpoken(items));
              }}
            />
            <Button
              type="submit"
              className="h-8 shrink-0 rounded-none px-3 text-sm"
              disabled={pending || draft.trim() === ""}
            >
              Send
            </Button>
          </form>
        </div>
        {voice.notice || voice.listening ? (
          <div className="voice-line">
            <VoiceStatus line={voice.line} notice={voice.notice} mouth={voice.mouth} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function lastSpoken(items: LogItem[]): string {
  for (const item of [...items].reverse()) {
    if (item.kind === "brief" && item.brief.reply.trim()) return item.brief.reply;
    if (item.kind === "hand" && item.reply.trim()) return item.reply;
    if (item.kind === "answer" && !item.failed && item.text.trim()) return item.text;
  }
  return "";
}

function voiceLamp(mouth: MouthKind | "unknown"): string {
  switch (mouth) {
    case "unknown":
      return "Checking";
    case "grok":
      return "Altair";
    case "azure":
      return "British";
    case "browser":
      return "This computer";
    case "not-live":
      return "Not live";
    default: {
      const neverMouth: never = mouth;
      return neverMouth;
    }
  }
}

function OpticStage({
  view,
  orb,
  cue,
  brainTag,
  levelRef,
}: {
  view: FaceView;
  orb: OrbMode;
  cue: GraphCue | null;
  brainTag: string;
  levelRef: RefObject<number>;
}) {
  switch (view) {
    case "orb":
      return <OrbStage mode={orb} brainTag={brainTag} levelRef={levelRef} />;
    case "graph":
      return <NoteGraph cue={cue} brainTag={brainTag} mode={orb} />;
    default: {
      const neverView: never = view;
      return neverView;
    }
  }
}

function LogItemView({
  item,
  pending,
  onDecide,
}: {
  item: LogItem;
  pending: boolean;
  onDecide: (decision: "yes" | "no") => void;
}) {
  switch (item.kind) {
    case "you":
      return (
        <article className="you-line">
          <p className="line-label">You</p>
          <p className="line-text">{item.text}</p>
          <time dateTime={item.at}>{formatStamp(item.at)}</time>
        </article>
      );
    case "stub":
      return (
        <article className="stub-receipt">
          <div className="stub-head">
            <p>View</p>
            <p>This screen</p>
          </div>
          <h3>face.view</h3>
          <p className="stub-lead">View changed on this screen only.</p>
          <dl>
            <div>
              <dt>You said</dt>
              <dd>{item.heard}</dd>
            </div>
            <div>
              <dt>View</dt>
              <dd>{viewLabel(item.view)}</dd>
            </div>
          </dl>
          <p className="stub-outcome">{stubOutcome(item.view)}</p>
          <time dateTime={item.at}>{formatStamp(item.at)}</time>
        </article>
      );
    case "answer":
      return (
        <div className="talk-list">
          <p className="line-text">{item.text}</p>
          {item.notice ? <p className="stub-lead">{item.notice}</p> : null}
        </div>
      );
    case "brief":
      return <BriefCard at={item.at} brief={item.brief} />;
    case "hand":
      return (
        <div className="talk-list">
          <p className="line-text">{item.reply}</p>
          {item.plan ? (
            <PlanCard
              plan={item.plan}
              pending={pending}
              onDecide={item.plan.state === "waiting" && item.plan.gate === "confirm" ? onDecide : undefined}
            />
          ) : null}
          {item.receipts.map((receipt) => (
            <ReceiptCard key={receipt.id} receipt={receipt} />
          ))}
        </div>
      );
    default: {
      const neverItem: never = item;
      return neverItem;
    }
  }
}

function BriefCard({ brief, at }: { brief: MorningBrief; at: string }) {
  return (
    <article className="stub-receipt brief-card">
      <div className="stub-head">
        <p>Morning brief</p>
        <p>{brief.heading}</p>
      </div>
      <h3>daily.brief</h3>
      <p className="stub-lead">Demo calendar</p>
      <p className="stub-outcome">{brief.calendarNote}</p>
      {brief.events.length > 0 ? (
        <ul>
          {brief.events.map((event, index) => (
            <li key={`${event.title}-${event.when}-${index}`}>
              {event.title} — {event.when}
            </li>
          ))}
        </ul>
      ) : (
        <p className="stub-lead">No events are listed.</p>
      )}
      <p className="stub-lead">Vault priorities</p>
      <p className="stub-outcome">{brief.vaultNote}</p>
      {brief.priorities.length > 0 ? (
        <ul>
          {brief.priorities.map((item, index) => (
            <li key={`${item.note}-${index}`}>
              {item.note}: {item.line}
            </li>
          ))}
        </ul>
      ) : (
        <p className="stub-lead">No priority lines are listed.</p>
      )}
      {brief.gaps.length > 0 ? (
        <>
          <p className="stub-lead">Not written down</p>
          <ul>
            {brief.gaps.map((gap, index) => (
              <li key={`${gap.note}-${gap.field}-${index}`}>
                {gap.note}: {gap.field}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="stub-outcome">{brief.mail}</p>
      {brief.checked.length > 0 ? <p className="stub-lead">Notes checked: {brief.checked.join(", ")}.</p> : null}
      {brief.escalate ? <p className="stub-lead">{brief.escalate}</p> : null}
      <time dateTime={at}>{formatStamp(at)}</time>
    </article>
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
    // The talk log still shows the receipt if a later hand runs.
  }
}
