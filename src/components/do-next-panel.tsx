"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DoNextItem } from "@/lib/do-next.server";

type PanelState = { status: "loading" } | { status: "error" } | { status: "ready"; items: DoNextItem[] };

export function DoNextPanel() {
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/do-next", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      if (!Array.isArray(data?.items) || data.items.length > 6 || data.items.some((item: DoNextItem) =>
        !item || typeof item.task !== "string" || typeof item.due !== "string" || typeof item.bot !== "string")) throw new Error("Invalid response");
      return controller.signal.aborted ? null : { status: "ready" as const, items: data.items as DoNextItem[] };
    } catch {
      return controller.signal.aborted ? null : { status: "error" as const };
    }
  }, []);

  useEffect(() => {
    void load().then(next => { if (next) setState(next); });
    return () => request.current?.abort();
  }, [load]);

  return (
    <section className="do-next-panel" aria-labelledby="do-next-title" aria-busy={state.status === "loading"}>
      <div className="do-next-heading">
        <h2 id="do-next-title">Do next</h2>
        <button type="button" aria-label="Refresh do next" disabled={state.status === "loading"} onClick={() => {
          setState({ status: "loading" });
          void load().then(next => { if (next) setState(next); });
        }}>Refresh</button>
      </div>
      <div className="do-next-content" aria-live="polite">
        {state.status === "loading" ? <p className="do-next-state">Loading…</p> :
          state.status === "error" ? <p className="do-next-state">{"Couldn't load."}</p> :
          state.items.length === 0 ? <p className="do-next-state">Nothing due.</p> : (
            <ol className="do-next-items">
              {state.items.map((item, index) => (
                <li key={index}>
                  <p className="do-next-task">{item.task}</p>
                  <div className="do-next-meta">
                    <span>{item.bot}</span>
                    {item.due ? <time dateTime={item.due}>{item.due.slice(0, 10)}</time> : <span>Date unavailable</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
      </div>
    </section>
  );
}
