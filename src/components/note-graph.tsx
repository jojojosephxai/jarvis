"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { frameAroundPoint, frameAroundPoints, layoutGalaxy, type Frame } from "@/lib/graph-layout";
import { degreeOf, matchGraphNode, matchingNodes, shortestPath, topHubs } from "@/lib/graph-nav";
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
const COOL = ["#7ee7ff", "#49d4ff", "#6d8cff", "#5eead4", "#9bb6ff", "#8fd3ff", "#3ec6e0", "#b7d4ff"];
const STARS = Array.from({ length: 36 }, (_, index) => ({
  x: 48 + ((index * 137) % 904),
  y: 36 + ((index * 89 + 23) % 568),
}));
const TYPE_FILTERS = ["all", "note", "folder"] as const;

type TypeFilter = (typeof TYPE_FILTERS)[number];
type FrameMode = "fit" | "node" | "path" | "matches";

export type GraphCue = {
  token: number;
  focusQuery?: string;
  pathFrom?: string;
  pathTo?: string;
};

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

function typeLabel(filter: TypeFilter): string {
  switch (filter) {
    case "all":
      return "All";
    case "note":
      return "Notes";
    case "folder":
      return "Folders";
    default: {
      const neverFilter: never = filter;
      return neverFilter;
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

function folderToken(folder: string): string {
  return folder === "" ? "root" : folder;
}

function folderFromToken(token: string): string {
  return token === "root" ? "" : token;
}

function folderChoiceLabel(token: string): string {
  if (token === "root") return "Vault root";
  return token;
}

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const mx = (x1 + x2) / 2 - dy * 0.16;
  const my = (y1 + y2) / 2 + dx * 0.16;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

function polar(cx: number, cy: number, radius: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
}

function arc(cx: number, cy: number, radius: number, start: number, end: number): string {
  const from = polar(cx, cy, radius, start);
  const to = polar(cx, cy, radius, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${large} 1 ${to.x} ${to.y}`;
}

function nodeVisible(node: GraphNode, typeFilter: TypeFilter, folderFilter: string): boolean {
  if (typeFilter === "note" && node.kind !== "note") return false;
  if (typeFilter === "folder" && node.kind !== "folder") return false;
  if (folderFilter === "all") return true;
  const folder = folderFromToken(folderFilter);
  if (node.kind === "note") return node.folder === folder;
  return node.id === (folder ? `folder:${folder}` : "folder:");
}

function optionLabel(node: GraphNode): string {
  return node.kind === "folder" ? `${node.title} folder` : node.title;
}

export function NoteGraph({ cue = null }: { cue?: GraphCue | null }) {
  const [payload, setPayload] = useState<NoteGraphPayload | null>(null);
  const [failed, setFailed] = useState(false);

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

  return <GraphBody payload={payload} cue={cue} />;
}

function GraphBody({ payload, cue }: { payload: NoteGraphPayload; cue: GraphCue | null }) {
  switch (payload.status) {
    case "not-wired":
    case "missing":
    case "empty":
      return <GraphEmpty payload={payload} />;
    case "ready":
      return <GraphReady payload={payload} cue={cue} />;
    default: {
      const neverStatus: never = payload.status;
      return neverStatus;
    }
  }
}

function GraphEmpty({ payload }: { payload: NoteGraphPayload }) {
  return (
    <div className="graph-stage graph-stage-empty">
      <svg className="graph-empty-rings" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <GalaxyRings />
      </svg>
      <p className="graph-stats">
        {payload.noteCount} notes · {payload.connectionCount} connections
      </p>
      <p className="status-note">{payload.detail || EMPTY.detail}</p>
    </div>
  );
}

function GraphReady({ payload, cue }: { payload: NoteGraphPayload; cue: GraphCue | null }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [repel, setRepel] = useState(130);
  const [link, setLink] = useState(150);
  const [pathFromId, setPathFromId] = useState("");
  const [pathToId, setPathToId] = useState("");
  const [frameMode, setFrameMode] = useState<FrameMode>("fit");
  const [cueNote, setCueNote] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seenCue, setSeenCue] = useState(0);

  if (cue && cue.token !== seenCue) {
    setSeenCue(cue.token);
    setTypeFilter("all");
    setFolderFilter("all");
    if (cue.pathFrom && cue.pathTo) {
      const from = matchGraphNode(payload.nodes, cue.pathFrom);
      const to = matchGraphNode(payload.nodes, cue.pathTo);
      if (!from || !to) {
        setCueNote("Those names are not both in the vault. Nothing was invented.");
        setPathFromId("");
        setPathToId("");
        setFrameMode("fit");
      } else {
        setCueNote("");
        setQuery("");
        setPathFromId(from.id);
        setPathToId(to.id);
        setSelectedId(from.id);
        setFrameMode("path");
      }
    } else if (cue.focusQuery) {
      const found = matchingNodes(payload.nodes, cue.focusQuery);
      setQuery(cue.focusQuery);
      setPathFromId("");
      setPathToId("");
      const first = found[0];
      if (!first) {
        setCueNote("No note matches that search. Nothing was invented.");
        setFrameMode("fit");
      } else {
        setCueNote("");
        setSelectedId(first.id);
        setFrameMode(found.length === 1 ? "node" : "matches");
      }
    } else {
      setCueNote("");
      setFrameMode("fit");
    }
  }

  const points = useMemo(
    () =>
      layoutGalaxy(payload.nodes, payload.edges, {
        repel,
        link,
        width: WIDTH,
        height: HEIGHT,
      }),
    [payload.nodes, payload.edges, repel, link],
  );
  const pointById = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);
  const hubs = useMemo(() => topHubs(payload.nodes, payload.edges, 5), [payload.nodes, payload.edges]);
  const matches = useMemo(() => matchingNodes(payload.nodes, query), [payload.nodes, query]);
  const matchIds = useMemo(() => new Set(matches.map((node) => node.id)), [matches]);
  const route = useMemo(() => {
    if (!pathFromId || !pathToId || pathFromId === pathToId) return null;
    return shortestPath(payload.edges, pathFromId, pathToId);
  }, [payload.edges, pathFromId, pathToId]);
  const routeIds = useMemo(() => (route ? new Set(route) : null), [route]);
  const visibleNodes = useMemo(
    () => payload.nodes.filter((node) => nodeVisible(node, typeFilter, folderFilter)),
    [payload.nodes, typeFilter, folderFilter],
  );
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const folderChoices = useMemo(() => {
    const folders = new Set<string>();
    for (const node of payload.nodes) {
      if (node.kind === "note") folders.add(folderToken(node.folder));
    }
    return [...folders].sort((a, b) => a.localeCompare(b));
  }, [payload.nodes]);
  const pathChoices = useMemo(
    () => [...payload.nodes].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)),
    [payload.nodes],
  );
  const selected = payload.nodes.find((node) => node.id === selectedId) ?? null;
  const reasons = [...new Set(payload.edges.map((edge) => edge.reason))];
  const searching = query.trim().length > 0;
  const routeOn = Boolean(route && route.length > 1);

  const frame = useMemo(() => {
    const visiblePoints = points.filter((point) => visibleIds.has(point.id));
    switch (frameMode) {
      case "node": {
        const point = selectedId ? pointById.get(selectedId) : undefined;
        if (!point || !selectedId || !visibleIds.has(selectedId)) return frameAroundPoints(visiblePoints, 120, 96);
        return frameAroundPoint(point, 520, 360);
      }
      case "path": {
        const pathPoints = (route ?? [])
          .map((id) => pointById.get(id))
          .filter((point): point is { id: string; x: number; y: number } => Boolean(point));
        if (pathPoints.length === 0) return frameAroundPoints(visiblePoints, 120, 96);
        return frameAroundPoints(pathPoints, 130, 100);
      }
      case "matches": {
        const matched = visiblePoints.filter((point) => matchIds.has(point.id));
        return frameAroundPoints(matched.length > 0 ? matched : visiblePoints, 120, 96);
      }
      case "fit":
        return frameAroundPoints(visiblePoints, 120, 100);
      default: {
        const neverMode: never = frameMode;
        return neverMode;
      }
    }
  }, [frameMode, matchIds, pointById, points, route, selectedId, visibleIds]);

  function showNode(id: string, mode: FrameMode) {
    setTypeFilter("all");
    setFolderFilter("all");
    setSelectedId(id);
    setFrameMode(mode);
  }

  function onSearch(value: string) {
    setQuery(value);
    setCueNote("");
    const found = matchingNodes(payload.nodes, value);
    if (!value.trim()) {
      setFrameMode("fit");
      return;
    }
    const first = found[0];
    if (!first) {
      setFrameMode("fit");
      return;
    }
    setTypeFilter("all");
    setFolderFilter("all");
    setSelectedId(first.id);
    setFrameMode(found.length === 1 ? "node" : "matches");
  }

  function choosePath(which: "from" | "to", id: string) {
    const nextFrom = which === "from" ? id : pathFromId;
    const nextTo = which === "to" ? id : pathToId;
    if (which === "from") setPathFromId(id);
    else setPathToId(id);
    setCueNote("");
    if (nextFrom && nextTo) {
      setTypeFilter("all");
      setFolderFilter("all");
      setFrameMode("path");
      setSelectedId(nextTo);
    }
  }

  const showAllLabels = visibleNodes.length <= 24;

  return (
    <div className="graph-stage">
      <GalaxyBay
        query={query}
        matchCount={searching ? matches.length : null}
        typeFilter={typeFilter}
        folderFilter={folderFilter}
        folderChoices={folderChoices}
        repel={repel}
        link={link}
        pathFromId={pathFromId}
        pathToId={pathToId}
        pathChoices={pathChoices}
        route={route}
        sameEnds={Boolean(pathFromId && pathToId && pathFromId === pathToId)}
        cueNote={cueNote}
        hubs={hubs}
        selectedId={selectedId}
        focusDisabled={selectedId === null}
        onSearch={onSearch}
        onType={setTypeFilter}
        onFolder={setFolderFilter}
        onRepel={setRepel}
        onLink={setLink}
        onFit={() => setFrameMode("fit")}
        onFocus={() => {
          if (selectedId) setFrameMode("node");
        }}
        onPath={choosePath}
        onClearPath={() => {
          setPathFromId("");
          setPathToId("");
          setCueNote("");
          setFrameMode("fit");
        }}
        onHub={(id) => showNode(id, "node")}
      />
      <div className="graph-canvas">
        <p className="graph-stats">
          {payload.noteCount} notes · {payload.connectionCount} connections
          {payload.hiddenCount > 0 ? ` · ${payload.hiddenCount} not drawn` : ""}
          {visibleNodes.length !== payload.nodes.length ? ` · showing ${visibleNodes.length}` : ""}
        </p>
        <svg className="graph-svg" viewBox={viewBox(frame)} role="group" aria-label="Vault notes">
          <GalaxyRings />
          <g aria-hidden="true">
            {STARS.map((star) => (
              <circle key={`${star.x}-${star.y}`} cx={star.x} cy={star.y} r="1.1" fill="rgba(126, 231, 255, 0.28)" />
            ))}
          </g>
          {payload.edges.map((edge) => {
            if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return null;
            const from = pointById.get(edge.from);
            const to = pointById.get(edge.to);
            if (!from || !to) return null;
            const hot = routeOn ? onRoute(edge, route) : selectedId !== null && (edge.from === selectedId || edge.to === selectedId);
            const dim = (searching && !matchIds.has(edge.from) && !matchIds.has(edge.to)) || (routeOn && !hot);
            const d = edgePath(from.x, from.y, to.x, to.y);
            return (
              <g key={edge.id} opacity={dim ? 0.12 : 1}>
                <path d={d} fill="none" stroke={hot ? "rgba(216, 247, 255, 0.35)" : "rgba(73, 212, 255, 0.2)"} strokeWidth={hot ? 7 : 4} />
                <path
                  d={d}
                  fill="none"
                  stroke={hot ? "#f4fdff" : "rgba(126, 231, 255, 0.72)"}
                  strokeWidth={hot ? 2.4 : 1.35}
                  strokeDasharray={dashFor(edge.reason)}
                />
              </g>
            );
          })}
          {visibleNodes.map((node) => {
            const point = pointById.get(node.id);
            if (!point) return null;
            const active = node.id === selectedId;
            const color = colorFor(node);
            const degree = degreeOf(node.id, payload.edges);
            const neighbor = selectedId !== null && payload.edges.some((edge) => {
              return (
                (edge.from === selectedId && edge.to === node.id) ||
                (edge.to === selectedId && edge.from === node.id)
              );
            });
            const onPath = routeIds?.has(node.id) ?? false;
            const labelOn = showAllLabels || active || neighbor || onPath || node.kind === "folder" || matchIds.has(node.id);
            const radius = (node.kind === "folder" ? 8 : 5.5) + Math.min(degree, 8) * 1.2;
            const dim = (searching && !matchIds.has(node.id)) || (routeOn && !onPath && !active);
            const labelLeft = point.x > frame.x + frame.w * 0.68;
            return (
              <g
                key={node.id}
                className="graph-node"
                opacity={dim ? 0.16 : 1}
                tabIndex={0}
                role="button"
                aria-pressed={active}
                aria-label={node.kind === "folder" ? `${node.title} folder` : node.title}
                onClick={() => {
                  setSelectedId(node.id);
                  setFrameMode("node");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedId(node.id);
                    setFrameMode("node");
                  }
                }}
              >
                <circle cx={point.x} cy={point.y} r={radius + 12} fill="transparent" />
                <circle cx={point.x} cy={point.y} r={radius + 6} fill={color} opacity={active || onPath ? 0.22 : 0.1} />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={radius}
                  fill={node.kind === "folder" ? "rgba(4, 16, 24, 0.35)" : active ? color : "#07141c"}
                  stroke={active ? "#f4fdff" : color}
                  strokeWidth={active ? 2.6 : 1.7}
                />
                {node.kind === "folder" ? (
                  <circle cx={point.x} cy={point.y} r={radius + 3.5} fill="none" stroke={color} strokeWidth="1" />
                ) : null}
                {labelOn ? (
                  <text
                    x={labelLeft ? point.x - radius - 8 : point.x + radius + 8}
                    y={point.y + 4}
                    fill="#e7f8ff"
                    fontSize="13"
                    textAnchor={labelLeft ? "end" : "start"}
                  >
                    {shortTitle(node.title)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {visibleNodes.length === 0 ? <p className="galaxy-empty-filter">No notes match this filter.</p> : null}
        {reasons.length > 0 ? (
          <ul className="graph-legend">
            {reasons.map((reason) => (
              <li key={reason}>{reasonLabel(reason)}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <Inspector
        node={selected}
        detail={payload.detail}
        degree={selected ? degreeOf(selected.id, payload.edges) : 0}
        onPath={selected ? Boolean(routeIds?.has(selected.id)) : false}
      />
    </div>
  );
}

function viewBox(frame: Frame): string {
  return `${frame.x} ${frame.y} ${frame.w} ${frame.h}`;
}

function onRoute(edge: GraphEdge, route: string[] | null): boolean {
  if (!route) return false;
  for (let index = 0; index < route.length - 1; index += 1) {
    const from = route[index];
    const to = route[index + 1];
    if (!from || !to) continue;
    if ((edge.from === from && edge.to === to) || (edge.from === to && edge.to === from)) return true;
  }
  return false;
}

function GalaxyRings() {
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const rings = [78, 150, 230, 320, 430];
  return (
    <g aria-hidden="true" className="galaxy-rings">
      {rings.map((radius) => (
        <circle
          key={radius}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgba(73, 212, 255, 0.16)"
          strokeDasharray="2 9"
        />
      ))}
      <path d={arc(cx, cy, 250, 200, 250)} fill="none" stroke="#7ee7ff" strokeWidth="1.6" />
      <path d={arc(cx, cy, 250, 20, 70)} fill="none" stroke="rgba(73, 212, 255, 0.85)" strokeWidth="1.4" />
      <path d={arc(cx, cy, 360, 300, 345)} fill="none" stroke="rgba(126, 231, 255, 0.55)" strokeWidth="1.2" />
      <path d={arc(cx, cy, 168, 110, 160)} fill="none" stroke="#49d4ff" strokeWidth="1.3" />
      <line x1={cx - 28} y1={cy} x2={cx - 10} y2={cy} stroke="rgba(215, 246, 255, 0.45)" strokeWidth="1" />
      <line x1={cx + 10} y1={cy} x2={cx + 28} y2={cy} stroke="rgba(215, 246, 255, 0.45)" strokeWidth="1" />
      <line x1={cx} y1={cy - 28} x2={cx} y2={cy - 10} stroke="rgba(215, 246, 255, 0.45)" strokeWidth="1" />
      <line x1={cx} y1={cy + 10} x2={cx} y2={cy + 28} stroke="rgba(215, 246, 255, 0.45)" strokeWidth="1" />
    </g>
  );
}

function GalaxyBay({
  query,
  matchCount,
  typeFilter,
  folderFilter,
  folderChoices,
  repel,
  link,
  pathFromId,
  pathToId,
  pathChoices,
  route,
  sameEnds,
  cueNote,
  hubs,
  selectedId,
  focusDisabled,
  onSearch,
  onType,
  onFolder,
  onRepel,
  onLink,
  onFit,
  onFocus,
  onPath,
  onClearPath,
  onHub,
}: {
  query: string;
  matchCount: number | null;
  typeFilter: TypeFilter;
  folderFilter: string;
  folderChoices: string[];
  repel: number;
  link: number;
  pathFromId: string;
  pathToId: string;
  pathChoices: GraphNode[];
  route: string[] | null;
  sameEnds: boolean;
  cueNote: string;
  hubs: { node: GraphNode; degree: number }[];
  selectedId: string | null;
  focusDisabled: boolean;
  onSearch: (value: string) => void;
  onType: (filter: TypeFilter) => void;
  onFolder: (filter: string) => void;
  onRepel: (value: number) => void;
  onLink: (value: number) => void;
  onFit: () => void;
  onFocus: () => void;
  onPath: (which: "from" | "to", id: string) => void;
  onClearPath: () => void;
  onHub: (id: string) => void;
}) {
  return (
    <aside className="galaxy-bay" aria-label="Graph controls">
      <label className="galaxy-field" htmlFor="graph-search">
        <span className="line-label">Search notes</span>
        <Input
          id="graph-search"
          value={query}
          autoComplete="off"
          placeholder="Find a note"
          className="h-10 rounded-none border-border bg-card px-2 text-sm md:text-sm"
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>
      {matchCount !== null ? (
        <p className="galaxy-note">{matchCount === 0 ? "No note matches that search." : `${matchCount} match${matchCount === 1 ? "" : "es"}`}</p>
      ) : null}
      <div className="galaxy-filters" role="group" aria-label="Type">
        {TYPE_FILTERS.map((filter) => (
          <Button
            key={filter}
            type="button"
            variant={typeFilter === filter ? "default" : "outline"}
            aria-pressed={typeFilter === filter}
            className="h-9 rounded-none px-2 text-xs"
            onClick={() => onType(filter)}
          >
            {typeLabel(filter)}
          </Button>
        ))}
      </div>
      <label className="galaxy-field" htmlFor="graph-folder">
        <span className="line-label">Folder</span>
        <select
          id="graph-folder"
          className="galaxy-select"
          value={folderFilter}
          onChange={(event) => onFolder(event.target.value)}
        >
          <option value="all">All folders</option>
          {folderChoices.map((token) => (
            <option key={token} value={token}>
              {folderChoiceLabel(token)}
            </option>
          ))}
        </select>
      </label>
      <div className="galaxy-actions">
        <Button type="button" variant="outline" className="h-9 rounded-none px-3 text-xs" onClick={onFit}>
          Fit
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-none px-3 text-xs"
          disabled={focusDisabled}
          onClick={onFocus}
        >
          Focus
        </Button>
      </div>
      <label className="galaxy-field" htmlFor="graph-repel">
        <span className="line-label">
          Repel <span>{repel}</span>
        </span>
        <input
          id="graph-repel"
          className="galaxy-range"
          type="range"
          min={40}
          max={240}
          value={repel}
          onChange={(event) => onRepel(Number(event.target.value))}
        />
        <span className="galaxy-hint">How hard notes push apart.</span>
      </label>
      <label className="galaxy-field" htmlFor="graph-link">
        <span className="line-label">
          Link length <span>{link}</span>
        </span>
        <input
          id="graph-link"
          className="galaxy-range"
          type="range"
          min={48}
          max={280}
          value={link}
          onChange={(event) => onLink(Number(event.target.value))}
        />
        <span className="galaxy-hint">How long the lines want to be.</span>
      </label>
      <div className="galaxy-field">
        <span className="line-label">Path</span>
        <label className="sr-only" htmlFor="path-from">
          Path from
        </label>
        <select
          id="path-from"
          className="galaxy-select"
          value={pathFromId}
          onChange={(event) => onPath("from", event.target.value)}
        >
          <option value="">From</option>
          {pathChoices.map((node) => (
            <option key={`from-${node.id}`} value={node.id}>
              {optionLabel(node)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="path-to">
          Path to
        </label>
        <select
          id="path-to"
          className="galaxy-select"
          value={pathToId}
          onChange={(event) => onPath("to", event.target.value)}
        >
          <option value="">To</option>
          {pathChoices.map((node) => (
            <option key={`to-${node.id}`} value={node.id}>
              {optionLabel(node)}
            </option>
          ))}
        </select>
        {pathFromId || pathToId ? (
          <Button type="button" variant="ghost" className="h-8 rounded-none px-2 text-xs" onClick={onClearPath}>
            Clear path
          </Button>
        ) : null}
        {sameEnds ? <p className="galaxy-note">Pick two different notes.</p> : null}
        {!sameEnds && pathFromId && pathToId && !route ? (
          <p className="galaxy-note">No path between those notes.</p>
        ) : null}
        {route && route.length > 1 ? (
          <p className="galaxy-note">{route.length - 1} steps highlighted.</p>
        ) : null}
        {cueNote ? <p className="galaxy-note">{cueNote}</p> : null}
      </div>
      <div className="galaxy-field">
        <span className="line-label">Most connected</span>
        {hubs.length === 0 ? (
          <p className="galaxy-note">No connections yet.</p>
        ) : (
          <ol className="galaxy-hubs">
            {hubs.map((hub) => (
              <li key={hub.node.id}>
                <button
                  type="button"
                  aria-current={hub.node.id === selectedId ? "true" : undefined}
                  onClick={() => onHub(hub.node.id)}
                >
                  <span>{hub.node.title}</span>
                  <span>{hub.degree}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}

function Inspector({
  node,
  detail,
  degree,
  onPath,
}: {
  node: GraphNode | null;
  detail: string;
  degree: number;
  onPath: boolean;
}) {
  if (!node) {
    return (
      <aside className="graph-inspector" aria-label="Inspector">
        <p className="line-label">Inspector</p>
        <h3>Click a note</h3>
        <p className="stub-lead">Notes are the dots. Lines are folder parents, links, or shared tags.</p>
        <p className="status-note inspector-note">{detail}</p>
      </aside>
    );
  }

  const place = node.kind === "folder" ? "Folder" : node.folder || "Vault root";
  const path = node.kind === "folder" ? node.folder || "vault" : node.id;
  return (
    <aside className="graph-inspector" aria-label="Inspector">
      <p className="line-label">Inspector</p>
      <h3>{node.title}</h3>
      <p className="stub-lead">{place}</p>
      <p className="line-label">Path</p>
      <p className="line-text">{path}</p>
      {node.tags.length > 0 ? <p className="stub-lead">{node.tags.map((tag) => `#${tag}`).join(" ")}</p> : null}
      <p className="line-text">{node.excerpt || "This note has no body text."}</p>
      <p className="stub-outcome">
        {degree} connection{degree === 1 ? "" : "s"}
        {onPath ? " · on the highlighted path" : ""}
      </p>
      <p className="stub-lead">
        {node.kind === "folder"
          ? "This dot is the folder, not a note."
          : "Preview only. Ask in Talk if you want the brain to read this note."}
      </p>
    </aside>
  );
}
