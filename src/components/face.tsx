"use client";

import { useEffect, useRef, useState } from "react";

import { BootScreen } from "@/components/boot-screen";
import { NoteGraph } from "@/components/note-graph";
import { orbLabel, Reactor, type OrbMode } from "@/components/reactor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { makeId } from "@/lib/ids";
import { FACE_VIEWS, parseViewIntent, viewLabel, type FaceView } from "@/lib/view-intent";

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
  | { kind: "answer"; id: string; text: string; notice?: string; at: string; failed?: boolean };

function isAnswerPayload(value: unknown): value is { reply: string; notice?: string } {
  if (!value || typeof value !== "object") return false;
  const record = value as { reply?: unknown; notice?: unknown; mode?: unknown };
  return (
    typeof record.reply === "string" &&
    (record.mode === "grok" || record.mode === "demo") &&
    (record.notice === undefined || typeof record.notice === "string")
  );
}

function stageLabel(view: FaceView, orb: OrbMode): string {
  switch (view) {
    case "orb":
      return orbLabel(orb);
    case "graph":
      return "Graph";
    case "ring":
      return "Ring later";
    case "cube":
      return "Cube later";
    default: {
      const neverView: never = view;
      return neverView;
    }
  }
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
  const [orb, setOrb] = useState<OrbMode>("standby");
  const [viewMode, setViewMode] = useState<FaceView>("orb");
  const [booting, setBooting] = useState(true);
  const [pending, setPending] = useState(false);
  const [brainLabel, setBrainLabel] = useState<BrainLabel>("Vault");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bootTimer = useRef<number | null>(null);
  const ackTimer = useRef<number | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = document.documentElement.dataset.boot === "done";
    const delay = seen ? 0 : reduce ? 400 : 2200;
    bootTimer.current = window.setTimeout(() => {
      markBootDone();
      setBooting(false);
    }, delay);
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

  function pushItems(next: LogItem[]) {
    setItems((current) => [...current, ...next].slice(-40));
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const view = parseViewIntent(trimmed);
    const at = new Date().toISOString();
    setDraft("");
    setOrb("ack");
    if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);

    if (view) {
      setViewMode(view);
      pushItems([
        { kind: "you", id: makeId("you"), text: trimmed, at },
        { kind: "stub", id: makeId("stub"), heard: trimmed, at, view },
      ]);
      ackTimer.current = window.setTimeout(() => setOrb("standby"), 900);
      if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
      return;
    }

    pushItems([{ kind: "you", id: makeId("you"), text: trimmed, at }]);
    setPending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: trimmed }] }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isAnswerPayload(payload)) {
        const error =
          payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "Brain wiring: the brain did not answer. Nothing was invented.";
        pushItems([
          {
            kind: "answer",
            id: makeId("ans"),
            text: error,
            at: new Date().toISOString(),
            failed: true,
          },
        ]);
        return;
      }
      pushItems([
        {
          kind: "answer",
          id: makeId("ans"),
          text: payload.reply,
          notice: payload.notice,
          at: new Date().toISOString(),
        },
      ]);
    } catch {
      pushItems([
        {
          kind: "answer",
          id: makeId("ans"),
          text: "Brain wiring: I couldn't reach the brain. Check that the server is running, then try again.",
          at: new Date().toISOString(),
          failed: true,
        },
      ]);
    } finally {
      setPending(false);
      setOrb("standby");
      if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
    }
  }

  return (
    <div className="hud">
      {booting ? <BootScreen onSkip={endBoot} /> : null}
      <header className="hud-top">
        <div>
          <p className="hud-mark">Jarvis</p>
          <p className="hud-kicker">Face</p>
        </div>
        <p className="hud-link">This computer</p>
      </header>
      <div className="hud-stage">
        <section className="optic" aria-label="Status">
          <div className="view-switch" role="group" aria-label="View">
            {FACE_VIEWS.map((view) => (
              <Button
                key={view}
                type="button"
                variant={viewMode === view ? "default" : "outline"}
                aria-pressed={viewMode === view}
                className="view-button h-11 rounded-none px-3"
                onClick={() => setViewMode(view)}
              >
                {viewLabel(view)}
              </Button>
            ))}
          </div>
          <OpticStage view={viewMode} orb={orb} />
          <p className="orb-state">{stageLabel(viewMode, orb)}</p>
          <dl className="status-grid">
            <div>
              <dt>Face</dt>
              <dd>
                <span className="lamp lamp-on" />
                Online
              </dd>
            </div>
            <div>
              <dt>Brain</dt>
              <dd>
                <span className={brainLabel === "Brain wiring" ? "lamp" : "lamp lamp-on"} />
                {brainLabel}
              </dd>
            </div>
            <div>
              <dt>Voice</dt>
              <dd>
                <span className="lamp" />
                Not live
              </dd>
            </div>
          </dl>
          <p className="status-note">
            Voice is not live. Questions are answered from the vault notes. Jarvis names those notes and says when a fact is missing.
          </p>
        </section>
        <section className="comms" aria-label="Talk">
          <div className="comms-head">
            <div className="comms-title">
              <h2>Talk</h2>
              <p>{pending ? "Reading" : "Vault"}</p>
            </div>
            {items.length > 0 ? (
              <Button type="button" variant="ghost" className="h-11 px-3" onClick={() => setItems([])}>
                Clear
              </Button>
            ) : null}
          </div>
          <div className="talk-log">
            {items.length === 0 ? (
              <p className="empty-talk">
                Ask about the notes. Jarvis answers only from the vault and names the notes it used. Orb and Graph still switch the view.
              </p>
            ) : (
              <div className="talk-list" aria-live="polite">
                {items.map((item) => (
                  <LogItemView key={item.id} item={item} />
                ))}
                {pending ? <p className="empty-talk">Reading the vault notes.</p> : null}
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
              className="h-12 min-w-0 flex-1 rounded-none border-border bg-card px-3 text-base md:text-base"
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => inputRef.current?.scrollIntoView({ block: "nearest" })}
              disabled={pending}
            />
            <Button
              type="submit"
              className="h-12 shrink-0 rounded-none px-4 text-base"
              disabled={pending || draft.trim() === ""}
            >
              Send
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}

function OpticStage({ view, orb }: { view: FaceView; orb: OrbMode }) {
  switch (view) {
    case "orb":
      return (
        <div className="optic-frame">
          <span className="tick tick-tl" />
          <span className="tick tick-tr" />
          <span className="tick tick-bl" />
          <span className="tick tick-br" />
          <Reactor mode={orb} />
        </div>
      );
    case "graph":
      return <NoteGraph />;
    case "ring":
    case "cube":
      return <ViewStub view={view} />;
    default: {
      const neverView: never = view;
      return neverView;
    }
  }
}

function ViewStub({ view }: { view: "ring" | "cube" }) {
  return (
    <div className="view-stub">
      <p>{viewLabel(view)} is not built yet.</p>
      <p>Orb and Graph are the views that work.</p>
    </div>
  );
}

function LogItemView({ item }: { item: LogItem }) {
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
          <p className="stub-outcome">View is now {viewLabel(item.view)}. That change stays on this screen.</p>
          <time dateTime={item.at}>{formatStamp(item.at)}</time>
        </article>
      );
    case "answer":
      return (
        <article className="stub-receipt">
          <div className="stub-head">
            <p>Jarvis</p>
            <p>{item.failed ? "Brain wiring" : "Vault"}</p>
          </div>
          <p className="stub-outcome">{item.text}</p>
          {item.notice ? <p className="stub-lead">{item.notice}</p> : null}
          <time dateTime={item.at}>{formatStamp(item.at)}</time>
        </article>
      );
    default: {
      const neverItem: never = item;
      return neverItem;
    }
  }
}
