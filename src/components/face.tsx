"use client";

import { useEffect, useRef, useState } from "react";

import { BootScreen } from "@/components/boot-screen";
import { orbLabel, Reactor, type OrbMode } from "@/components/reactor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { makeId } from "@/lib/ids";

const BOOT_KEY = "jarvis-boot";

const STUB_OUTCOME =
  "Brain is not wired yet. Voice is not live. Your words stayed on this screen. Nothing was answered, sent, or saved.";

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
  | { kind: "stub"; id: string; heard: string; at: string };

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
  const [booting, setBooting] = useState(true);
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

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const at = new Date().toISOString();
    setItems((current) =>
      [
        ...current,
        { kind: "you" as const, id: makeId("you"), text: trimmed, at },
        { kind: "stub" as const, id: makeId("stub"), heard: trimmed, at },
      ].slice(-40),
    );
    setDraft("");
    setOrb("ack");
    if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    ackTimer.current = window.setTimeout(() => setOrb("standby"), 900);
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
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
          <div className="optic-frame">
            <span className="tick tick-tl" />
            <span className="tick tick-tr" />
            <span className="tick tick-bl" />
            <span className="tick tick-br" />
            <Reactor mode={orb} />
          </div>
          <p className="orb-state">{orbLabel(orb)}</p>
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
                <span className="lamp" />
                Not wired
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
          <p className="status-note">Brain and voice are off. Sending keeps your words here and does not get an answer.</p>
        </section>
        <section className="comms" aria-label="Talk">
          <div className="comms-head">
            <div className="comms-title">
              <h2>Talk</h2>
              <p>Stub</p>
            </div>
            {items.length > 0 ? (
              <Button type="button" variant="ghost" className="h-11 px-3" onClick={() => setItems([])}>
                Clear
              </Button>
            ) : null}
          </div>
          <div className="talk-log">
            {items.length === 0 ? (
              <p className="empty-talk">Nothing said yet. Type below. You will get a receipt, and Jarvis will not answer.</p>
            ) : (
              <div className="talk-list" aria-live="polite">
                {items.map((item) => (
                  <LogItemView key={item.id} item={item} />
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
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
            />
            <Button
              type="submit"
              className="h-12 shrink-0 rounded-none px-4 text-base"
              disabled={draft.trim() === ""}
            >
              Send
            </Button>
          </form>
        </section>
      </div>
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
            <p>Stub receipt</p>
            <p>Not live</p>
          </div>
          <h3>face.hear</h3>
          <p className="stub-lead">Heard on this screen only.</p>
          <dl>
            <div>
              <dt>You said</dt>
              <dd>{item.heard}</dd>
            </div>
          </dl>
          <p className="stub-outcome">{STUB_OUTCOME}</p>
          <time dateTime={item.at}>{formatStamp(item.at)}</time>
        </article>
      );
    default: {
      const neverItem: never = item;
      return neverItem;
    }
  }
}
