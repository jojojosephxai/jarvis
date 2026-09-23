"use client";

import { useEffect, useMemo, useState } from "react";

import type { GraphEdge, GraphNode, GraphStatus, NoteGraphPayload } from "@/lib/note-graph";

const EMPTY: NoteGraphPayload = {
  status: "not-wired",
  detail: "",
  nodes: [],
  edges: [],
  noteCount: 0,
  connectionCount: 0,
  hiddenCount: 0,
  capped: false,
};

function isNode(value: unknown): value is GraphNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<GraphNode>;
  return (
    typeof node.id === "string" &&
    typeof node.title === "string" &&
    typeof node.folder === "string" &&
    typeof node.excerpt === "string" &&
    Array.isArray(node.tags) &&
    node.tags.every((tag) => typeof tag === "string")
  );
}

function isEdge(value: unknown): value is GraphEdge {
  if (!value || typeof value !== "object") return false;
  const edge = value as Partial<GraphEdge>;
  return (
    typeof edge.id === "string" &&
    typeof edge.from === "string" &&
    typeof edge.to === "string" &&
    (edge.reason === "wikilink" || edge.reason === "tag" || edge.reason === "folder")
  );
}

function isStatus(value: unknown): value is GraphStatus {
  return value === "ready" || value === "not-wired" || value === "missing" || value === "empty";
}

function isPayload(value: unknown): value is NoteGraphPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<NoteGraphPayload>;
  return (
    isStatus(payload.status) &&
    typeof payload.detail === "string" &&
    typeof payload.noteCount === "number" &&
    typeof payload.connectionCount === "number" &&
    typeof payload.hiddenCount === "number" &&
    typeof payload.capped === "boolean" &&
    Array.isArray(payload.nodes) &&
    payload.nodes.every(isNode) &&
    Array.isArray(payload.edges) &&
    payload.edges.every(isEdge)
  );
}

type Point = { id: string; x: number; y: number };

function placeNodes(nodes: GraphNode[], edges: GraphEdge[]): Point[] {
  const count = nodes.length;
  const points = nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(count, 1) - Math.PI / 2;
    const ring = count === 1 ? 0 : 34;
    return {
      id: node.id,
      x: 100 + Math.cos(angle) * ring,
      y: 70 + Math.sin(angle) * ring * 0.72,
    };
  });
  const index = new Map(points.map((point) => [point.id, point]));
  for (let step = 0; step < 28; step += 1) {
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];
        if (!a || !b) continue;
        const dx = a.x - b.x || 0.01;
        const dy = a.y - b.y || 0.01;
        const dist = Math.hypot(dx, dy);
        const push = Math.min(2.2, 18 / dist);
        a.x += (dx / dist) * push;
        a.y += (dy / dist) * push;
        b.x -= (dx / dist) * push;
        b.y -= (dy / dist) * push;
      }
    }
    for (const edge of edges) {
      const a = index.get(edge.from);
      const b = index.get(edge.to);
      if (!a || !b) continue;
      a.x += (b.x - a.x) * 0.04;
      a.y += (b.y - a.y) * 0.04;
      b.x += (a.x - b.x) * 0.04;
      b.y += (a.y - b.y) * 0.04;
    }
    for (const point of points) {
      point.x += (100 - point.x) * 0.03;
      point.y += (70 - point.y) * 0.03;
      point.x = Math.min(186, Math.max(14, point.x));
      point.y = Math.min(126, Math.max(14, point.y));
    }
  }
  return points;
}

function dashFor(reason: GraphEdge["reason"]): string | undefined {
  switch (reason) {
    case "wikilink":
      return undefined;
    case "tag":
      return "3 2";
    case "folder":
      return "1 2";
    default: {
      const neverReason: never = reason;
      return neverReason;
    }
  }
}

function reasonLabel(reason: GraphEdge["reason"]): string {
  switch (reason) {
    case "wikilink":
      return "Wikilink";
    case "tag":
      return "Tag";
    case "folder":
      return "Folder";
    default: {
      const neverReason: never = reason;
      return neverReason;
    }
  }
}

export function NoteGraph() {
  const [payload, setPayload] = useState<NoteGraphPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/graph")
      .then((response) => response.json())
      .then((body: unknown) => {
        if (cancelled) return;
        if (!isPayload(body)) {
          setFailed(true);
          return;
        }
        setPayload(body);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="graph-panel">
        <p className="graph-stats">0 notes · 0 connections</p>
        <p className="status-note">The note graph could not be loaded. No notes were invented.</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="graph-panel">
        <p className="status-note">Reading notes…</p>
      </div>
    );
  }

  return <GraphBody payload={payload} selectedId={selectedId} onSelect={setSelectedId} />;
}

function GraphBody({
  payload,
  selectedId,
  onSelect,
}: {
  payload: NoteGraphPayload;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  switch (payload.status) {
    case "not-wired":
    case "missing":
    case "empty":
      return <GraphEmpty payload={payload} />;
    case "ready":
      return <GraphReady payload={payload} selectedId={selectedId} onSelect={onSelect} />;
    default: {
      const neverStatus: never = payload.status;
      return neverStatus;
    }
  }
}

function GraphEmpty({ payload }: { payload: NoteGraphPayload }) {
  return (
    <div className="graph-panel">
      <div className="optic-frame graph-empty-frame" aria-hidden="true">
        <span className="tick tick-tl" />
        <span className="tick tick-tr" />
        <span className="tick tick-bl" />
        <span className="tick tick-br" />
      </div>
      <p className="graph-stats">
        {payload.noteCount} notes · {payload.connectionCount} connections
      </p>
      <p className="status-note">{payload.detail || EMPTY.detail}</p>
    </div>
  );
}

function GraphReady({
  payload,
  selectedId,
  onSelect,
}: {
  payload: NoteGraphPayload;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const points = useMemo(() => placeNodes(payload.nodes, payload.edges), [payload.nodes, payload.edges]);
  const pointById = new Map(points.map((point) => [point.id, point]));
  const selected = payload.nodes.find((node) => node.id === selectedId) ?? null;
  const reasons = [...new Set(payload.edges.map((edge) => edge.reason))];

  return (
    <div className="graph-panel">
      <p className="graph-stats">
        {payload.noteCount} notes · {payload.connectionCount} connections
        {payload.hiddenCount > 0 ? ` · ${payload.hiddenCount} not drawn` : ""}
      </p>
      <svg className="graph-svg" viewBox="0 0 200 140" aria-hidden="true">
        {payload.edges.map((edge) => {
          const from = pointById.get(edge.from);
          const to = pointById.get(edge.to);
          if (!from || !to) return null;
          return (
            <line
              key={edge.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="rgba(120, 220, 255, 0.7)"
              strokeWidth="0.6"
              strokeDasharray={dashFor(edge.reason)}
            />
          );
        })}
        {payload.nodes.map((node) => {
          const point = pointById.get(node.id);
          if (!point) return null;
          const active = node.id === selectedId;
          return (
            <g key={node.id} onClick={() => onSelect(node.id)} className="graph-node">
              <circle
                cx={point.x}
                cy={point.y}
                r={active ? 4.2 : 3.1}
                fill={active ? "#d8f7ff" : "#071820"}
                stroke="#7ee7ff"
                strokeWidth="0.7"
              />
              <text x={point.x + 5} y={point.y + 2} fill="#d7f3ff" fontSize="4.2">
                {node.title.length > 18 ? `${node.title.slice(0, 17)}…` : node.title}
              </text>
            </g>
          );
        })}
      </svg>
      {reasons.length > 0 ? (
        <ul className="graph-legend">
          {reasons.map((reason) => (
            <li key={reason}>{reasonLabel(reason)}</li>
          ))}
        </ul>
      ) : null}
      <div className="graph-picks">
        {payload.nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className={node.id === selectedId ? "graph-pick graph-pick-on" : "graph-pick"}
            onClick={() => onSelect(node.id)}
          >
            {node.title}
          </button>
        ))}
      </div>
      {selected ? (
        <article className="graph-inspector">
          <p className="line-label">Preview</p>
          <h3>{selected.title}</h3>
          <p className="stub-lead">{selected.folder || "Top of the vault"}</p>
          {selected.tags.length > 0 ? <p className="stub-lead">{selected.tags.map((tag) => `#${tag}`).join(" ")}</p> : null}
          <p className="line-text">{selected.excerpt || "This note has no body text."}</p>
          <p className="stub-outcome">Preview only. The brain does not answer from this note yet.</p>
        </article>
      ) : (
        <p className="status-note">Select a note to preview it.</p>
      )}
      <p className="status-note">{payload.detail}</p>
    </div>
  );
}
