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

const WIDTH = 1000;
const HEIGHT = 640;
const COOL = ["#7ee7ff", "#49b8ff", "#6d8cff", "#5eead4", "#9bb6ff", "#8fd3ff", "#3ec6e0", "#b7d4ff"];

function isKind(value: unknown): value is GraphNode["kind"] {
  return value === "note" || value === "folder";
}

function isNode(value: unknown): value is GraphNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<GraphNode>;
  return (
    typeof node.id === "string" &&
    typeof node.title === "string" &&
    typeof node.folder === "string" &&
    typeof node.excerpt === "string" &&
    isKind(node.kind) &&
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
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const folders = nodes.filter((node) => node.kind === "folder");
  const notes = nodes.filter((node) => node.kind === "note");
  const folderIndex = new Map(folders.map((node, index) => [node.id, index]));
  const points = nodes.map((node) => {
    if (node.kind === "folder") {
      const index = folderIndex.get(node.id) ?? 0;
      const angle = (Math.PI * 2 * index) / Math.max(folders.length, 1) - Math.PI / 2;
      const ring = folders.length <= 1 ? 0 : 78;
      return { id: node.id, x: cx + Math.cos(angle) * ring, y: cy + Math.sin(angle) * ring };
    }
    const index = notes.findIndex((note) => note.id === node.id);
    const angle = (Math.PI * 2 * index) / Math.max(notes.length, 1) - Math.PI / 2;
    const ring = Math.min(250, 150 + notes.length * 3);
    return {
      id: node.id,
      x: cx + Math.cos(angle) * ring,
      y: cy + Math.sin(angle) * ring * 0.78,
    };
  });
  const index = new Map(points.map((point) => [point.id, point]));
  const steps = Math.min(40, 18 + nodes.length);
  for (let step = 0; step < steps; step += 1) {
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];
        if (!a || !b) continue;
        const dx = a.x - b.x || 0.2;
        const dy = a.y - b.y || 0.2;
        const dist = Math.hypot(dx, dy);
        const minDist = 86;
        const push = dist < minDist ? (minDist - dist) * 0.045 : 520 / (dist * dist);
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
      a.x += (b.x - a.x) * 0.03;
      a.y += (b.y - a.y) * 0.03;
      b.x += (a.x - b.x) * 0.03;
      b.y += (a.y - b.y) * 0.03;
    }
    for (const point of points) {
      point.x += (cx - point.x) * 0.01;
      point.y += (cy - point.y) * 0.01;
      point.x = Math.min(WIDTH - 48, Math.max(48, point.x));
      point.y = Math.min(HEIGHT - 36, Math.max(36, point.y));
    }
  }
  return points;
}

function dashFor(reason: GraphEdge["reason"]): string | undefined {
  switch (reason) {
    case "wikilink":
      return undefined;
    case "tag":
      return "7 5";
    case "folder":
      return "2 5";
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

function colorFor(node: GraphNode): string {
  if (node.kind === "folder") return "#d7f6ff";
  let hash = 0;
  for (let index = 0; index < node.id.length; index += 1) {
    hash = (hash * 33 + node.id.charCodeAt(index)) >>> 0;
  }
  return COOL[hash % COOL.length] ?? "#7ee7ff";
}

function shortTitle(title: string): string {
  if (title.length <= 22) return title;
  return `${title.slice(0, 21)}…`;
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
      <div className="graph-stage graph-stage-empty">
        <p className="graph-stats">0 notes · 0 connections</p>
        <p className="status-note">The note graph could not be loaded. No notes were invented.</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="graph-stage graph-stage-empty">
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
    <div className="graph-stage graph-stage-empty">
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
  const showAllLabels = payload.nodes.length <= 24;
  const neighborIds = new Set<string>();
  if (selectedId) {
    neighborIds.add(selectedId);
    for (const edge of payload.edges) {
      if (edge.from === selectedId) neighborIds.add(edge.to);
      if (edge.to === selectedId) neighborIds.add(edge.from);
    }
  }

  return (
    <div className="graph-stage">
      <div className="graph-canvas">
        <p className="graph-stats">
          {payload.noteCount} notes · {payload.connectionCount} connections
          {payload.hiddenCount > 0 ? ` · ${payload.hiddenCount} not drawn` : ""}
        </p>
        <svg className="graph-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label="Vault notes">
          {payload.edges.map((edge) => {
            const from = pointById.get(edge.from);
            const to = pointById.get(edge.to);
            if (!from || !to) return null;
            const hot = selectedId !== null && (edge.from === selectedId || edge.to === selectedId);
            return (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={hot ? "#d8f7ff" : "rgba(110, 206, 240, 0.55)"}
                strokeWidth={hot ? 2.4 : 1.35}
                strokeDasharray={dashFor(edge.reason)}
              />
            );
          })}
          {payload.nodes.map((node) => {
            const point = pointById.get(node.id);
            if (!point) return null;
            const active = node.id === selectedId;
            const color = colorFor(node);
            const labelOn = showAllLabels || active || neighborIds.has(node.id) || node.kind === "folder";
            const radius = node.kind === "folder" ? (active ? 18 : 15) : active ? 15 : 12;
            const labelLeft = point.x > WIDTH * 0.68;
            return (
              <g
                key={node.id}
                className="graph-node"
                tabIndex={0}
                role="button"
                aria-pressed={active}
                aria-label={node.kind === "folder" ? `${node.title} folder` : node.title}
                onClick={() => onSelect(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(node.id);
                  }
                }}
              >
                <circle cx={point.x} cy={point.y} r={radius + 10} fill="transparent" />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={radius}
                  fill={node.kind === "folder" ? "rgba(4, 16, 24, 0.2)" : active ? color : "#07141c"}
                  stroke={active ? "#f4fdff" : color}
                  strokeWidth={active ? 3 : 2}
                />
                {labelOn ? (
                  <text
                    x={labelLeft ? point.x - radius - 8 : point.x + radius + 8}
                    y={point.y + 5}
                    fill="#e7f8ff"
                    fontSize="16"
                    textAnchor={labelLeft ? "end" : "start"}
                  >
                    {shortTitle(node.title)}
                  </text>
                ) : null}
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
      </div>
      <Inspector node={selected} detail={payload.detail} />
    </div>
  );
}

function Inspector({ node, detail }: { node: GraphNode | null; detail: string }) {
  if (!node) {
    return (
      <aside className="graph-inspector" aria-label="Inspector">
        <p className="line-label">Inspector</p>
        <h3>Click a node</h3>
        <p className="stub-lead">Notes are the dots. Lines are folder parents, and links or tags when a note has them.</p>
        <p className="status-note inspector-note">{detail}</p>
      </aside>
    );
  }

  const place = node.kind === "folder" ? "Folder" : node.folder || "Top of the vault";
  return (
    <aside className="graph-inspector" aria-label="Inspector">
      <p className="line-label">Inspector</p>
      <h3>{node.title}</h3>
      <p className="stub-lead">{place}</p>
      {node.tags.length > 0 ? <p className="stub-lead">{node.tags.map((tag) => `#${tag}`).join(" ")}</p> : null}
      <p className="line-text">{node.excerpt || "This note has no body text."}</p>
      <p className="stub-outcome">
        {node.kind === "folder"
          ? "This dot is the folder, not a note. The brain does not answer from it."
          : "Preview only. The brain does not answer from this note yet."}
      </p>
    </aside>
  );
}
