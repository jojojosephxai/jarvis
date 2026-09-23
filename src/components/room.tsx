"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { BootScreen } from "@/components/boot-screen";
import { Presence, presenceLabel } from "@/components/presence";
import { ReceiptCard } from "@/components/receipt-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { makeId } from "@/lib/ids";
import {
  getThreadServerSnapshot,
  getThreadSnapshot,
  saveThread,
  subscribeThread,
  type ThreadEntry,
} from "@/lib/thread-storage";
import type { BrainMode, CalendarEvent, ChatResponse, Receipt } from "@/lib/types";

type PresenceMode = "idle" | "thinking" | "speaking";
type ShownMode = BrainMode | "unknown";

const BOOT_KEY = "jarvis-boot";

const SUGGESTIONS = [
  "Put soccer practice on my calendar tomorrow at 4pm",
  "What do my notes say about the science fair?",
  "What's on my calendar?",
];

function isReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<Receipt>;
  return (
    typeof receipt.id === "string" &&
    typeof receipt.tool === "string" &&
    typeof receipt.title === "string" &&
    typeof receipt.outcome === "string" &&
    typeof receipt.at === "string" &&
    (receipt.status === "done" || receipt.status === "demo" || receipt.status === "failed") &&
    !!receipt.input &&
    typeof receipt.input === "object"
  );
}

function isChatResponse(value: unknown): value is ChatResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ChatResponse> & { receipts?: unknown };
  return (
    typeof record.reply === "string" &&
    (record.mode === "grok" || record.mode === "demo") &&
    Array.isArray(record.receipts) &&
    record.receipts.every(isReceipt)
  );
}

function errorText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<CalendarEvent>;
  return typeof event.id === "string" && typeof event.title === "string" && typeof event.when === "string";
}

function brainLabel(mode: ShownMode): string {
  switch (mode) {
    case "grok":
      return "Brain: Grok";
    case "demo":
      return "Brain: demo";
    case "unknown":
      return "Brain: …";
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

export function Room() {
  const items = useSyncExternalStore(subscribeThread, getThreadSnapshot, getThreadServerSnapshot);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [presence, setPresence] = useState<PresenceMode>("idle");
  const [mode, setMode] = useState<ShownMode>("unknown");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendarNote, setCalendarNote] = useState("");
  const [booting, setBooting] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const speakTimer = useRef<number | null>(null);
  const bootTimer = useRef<number | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = document.documentElement.dataset.boot === "done";
    bootTimer.current = window.setTimeout(() => finishBoot(), seen ? 0 : reduce ? 500 : 2900);
    void loadStatus();
    void loadCalendar();
    return () => {
      if (bootTimer.current !== null) window.clearTimeout(bootTimer.current);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items, pending, events.length]);

  useEffect(() => {
    return () => {
      if (speakTimer.current !== null) window.clearTimeout(speakTimer.current);
    };
  }, []);

  function finishBoot() {
    if (bootTimer.current !== null) {
      window.clearTimeout(bootTimer.current);
      bootTimer.current = null;
    }
    try {
      sessionStorage.setItem(BOOT_KEY, "1");
      document.documentElement.dataset.boot = "done";
    } catch {
      // Session storage can be blocked. The boot still ends.
    }
    setBooting(false);
  }

  function showSpeaking(text: string) {
    if (speakTimer.current !== null) window.clearTimeout(speakTimer.current);
    setPresence("speaking");
    const ms = Math.min(6000, Math.max(1200, text.length * 36));
    speakTimer.current = window.setTimeout(() => setPresence("idle"), ms);
  }

  async function loadStatus() {
    try {
      const response = await fetch("/api/status");
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object") return;
      const next = (payload as { mode?: unknown }).mode;
      if (next === "grok" || next === "demo") setMode(next);
    } catch {
      setMode("unknown");
    }
  }

  async function loadCalendar() {
    try {
      const response = await fetch("/api/calendar");
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object") return;
      const list = (payload as { events?: unknown }).events;
      if (!Array.isArray(list)) return;
      setEvents(list.filter(isCalendarEvent));
      setCalendarNote("");
    } catch {
      setCalendarNote("The demo calendar couldn't be loaded.");
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    const userEntry: ThreadEntry = {
      id: makeId("msg"),
      role: "user",
      text: trimmed,
      at: new Date().toISOString(),
      receipts: [],
    };
    const history = [...items, userEntry].slice(-30);
    saveThread(history);
    setDraft("");
    setPending(true);
    setPresence("thinking");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-12).map((entry) => ({
            role: entry.role,
            content: entry.text,
          })),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isChatResponse(payload)) {
        const message = errorText(payload) ?? "The brain hit a problem.";
        saveThread([...getThreadSnapshot(), failedEntry(message)]);
        setPresence("idle");
        return;
      }

      setMode(payload.mode);
      saveThread([
        ...getThreadSnapshot(),
        {
          id: makeId("msg"),
          role: "assistant",
          text: payload.reply,
          at: new Date().toISOString(),
          receipts: payload.receipts,
          notice: payload.notice,
        },
      ]);
      if (payload.receipts.some((receipt) => receipt.tool.startsWith("calendar."))) {
        void loadCalendar();
      }
      showSpeaking(payload.reply);
    } catch {
      saveThread([
        ...getThreadSnapshot(),
        failedEntry("I couldn't reach the brain. Check that the server is running, then try again."),
      ]);
      setPresence("idle");
    } finally {
      setPending(false);
      if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
    }
  }

  function clearChat() {
    saveThread([]);
    setPresence("idle");
  }

  return (
    <div className="room">
      {booting ? <BootScreen onSkip={finishBoot} /> : null}
      <header className="room-header">
        <div>
          <p className="room-mark">Jarvis</p>
          <p className="room-parts">
            <span>Face</span>
            <span aria-hidden="true"> · </span>
            <span>Brain</span>
            <span aria-hidden="true"> · </span>
            <span>Hands</span>
          </p>
        </div>
        <p className="room-mode">{brainLabel(mode)}</p>
      </header>
      <div className="room-stage">
        <aside className="face-pane" aria-label="Face">
          <Presence mode={presence} />
          <div className="face-copy">
            <p className="face-name">Jarvis</p>
            <p className="face-state">{presenceLabel(presence)}</p>
          </div>
        </aside>
        <section className="talk-pane" aria-label="Talk">
          {items.length > 0 ? (
            <div className="talk-tools">
              <Button type="button" variant="ghost" className="h-9 px-2" onClick={clearChat}>
                Clear chat
              </Button>
            </div>
          ) : null}
          <div className="thread">
            {events.length > 0 ? (
              <details className="calendar-slip" open>
                <summary>Demo calendar ({events.length})</summary>
                <ul>
                  {events.map((event) => (
                    <li key={event.id}>
                      <span>{event.title}</span>
                      <span>{event.when}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {calendarNote ? <p className="thread-note">{calendarNote}</p> : null}
            {items.length === 0 ? (
              <div className="empty-room">
                <p>The room is quiet.</p>
                <p>Ask Jarvis to do something. If the hands run a tool, a receipt shows up under the reply.</p>
                <div className="suggestions">
                  {SUGGESTIONS.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="outline"
                      className="suggestion h-auto min-h-11 justify-start px-3 py-2 text-left text-sm whitespace-normal"
                      onClick={() => void send(suggestion)}
                      disabled={pending}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="messages" aria-live="polite">
                {items.map((entry) => (
                  <div key={entry.id} className={entry.role === "user" ? "turn turn-user" : "turn"}>
                    <p className="turn-label">{entry.role === "user" ? "You" : "Jarvis"}</p>
                    <p className={entry.failed ? "turn-text turn-failed" : "turn-text"}>{entry.text}</p>
                    {entry.notice ? <p className="thread-note">{entry.notice}</p> : null}
                    {entry.receipts.length > 0 ? (
                      <div className="receipt-stack">
                        {entry.receipts.map((receipt) => (
                          <ReceiptCard key={receipt.id} receipt={receipt} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {pending ? <p className="thread-note">Working on that.</p> : null}
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <label className="sr-only" htmlFor="ask">
              Message Jarvis
            </label>
            <Input
              id="ask"
              ref={inputRef}
              value={draft}
              maxLength={2000}
              autoComplete="off"
              placeholder="Ask Jarvis"
              className="h-12 min-w-0 flex-1 border-border bg-card px-3 text-base md:text-base"
              onChange={(event) => setDraft(event.target.value)}
              disabled={pending}
            />
            <Button type="submit" className="h-12 shrink-0 px-4 text-base" disabled={pending || draft.trim() === ""}>
              Send
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}

function failedEntry(text: string): ThreadEntry {
  return {
    id: makeId("msg"),
    role: "assistant",
    text,
    at: new Date().toISOString(),
    receipts: [],
    failed: true,
  };
}
