"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { JarvisBadge } from "@/components/jarvis-badge";
import { NoteReader, type NoteLink } from "@/components/note-reader";
import type { OrbMode } from "@/components/reactor";
import { Input } from "@/components/ui/input";
import {
  cageRadius,
  frameAroundPoint,
  frameAroundPoints,
  labelEligible,
  labelRank,
  layoutGalaxy,
  layoutOrigin,
  pickLabels,
  projectSpace,
  projectUnit,
  restCamera,
  starField,
  type Camera,
  type Frame,
  type LabelCandidate,
  type LayoutPoint,
} from "@/lib/graph-layout";
import { frameAtZoom, nextZoom, spinCamera, turnedCamera } from "@/lib/graph-turn";
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
const LAYOUT_REPEL = 260;
const LAYOUT_LINK = 230;
const STARS = starField();
const NEON = [
  "#5dff9a",
  "#49d4ff",
  "#ff8a3d",
  "#c084fc",
  "#f472b6",
  "#22d3ee",
  "#a3e635",
  "#fb7185",
  "#818cf8",
  "#fbbf24",
  "#2dd4bf",
  "#e879f9",
];
const TAG_COLOR: Record<string, string> = {
  classes: "#49d4ff",
  person: "#c084fc",
  people: "#c084fc",
  rules: "#5eead4",
  vault: "#5dff9a",
  identity: "#22d3ee",
  decisions: "#ff8a3d",
  fun: "#f472b6",
  goals: "#a3e635",
  health: "#fb7185",
  jarvis: "#49d4ff",
  preferences: "#818cf8",
  projects: "#e879f9",
  routines: "#2dd4bf",
  school: "#fbbf24",
  swim: "#22d3ee",
  tech: "#818cf8",
  voice: "#c084fc",
};

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
    (node.text === undefined || typeof node.text === "string") &&
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
      return "6 6";
    case "folder":
      return undefined;
    default: {
      const neverReason: never = reason;
      return neverReason;
    }
  }
}

function clusterKey(node: GraphNode): string {
  if (node.kind === "folder") return "folder";
  return node.tags[0] ?? "note";
}

function colorFor(node: GraphNode): string {
  if (node.kind === "folder") return "#f4fdff";
  const tag = node.tags[0];
  if (tag) {
    const known = TAG_COLOR[tag];
    if (known) return known;
    let hash = 0;
    for (let index = 0; index < tag.length; index += 1) {
      hash = (hash * 33 + tag.charCodeAt(index)) >>> 0;
    }
    return NEON[hash % NEON.length] ?? "#7ee7ff";
  }
  let hash = 0;
  for (let index = 0; index < node.id.length; index += 1) {
    hash = (hash * 33 + node.id.charCodeAt(index)) >>> 0;
  }
  return NEON[hash % NEON.length] ?? "#8fd3ff";
}

function swatchFor(key: string): string {
  if (key === "folder") return "#f4fdff";
  if (key === "note") return "#8fd3ff";
  return TAG_COLOR[key] ?? colorFor({ id: key, title: key, folder: "", tags: [key], excerpt: "", text: "", kind: "note" });
}

function clusterLabel(key: string): string {
  switch (key) {
    case "folder":
      return "Folder";
    case "note":
      return "Note";
    default:
      return key.slice(0, 1).toUpperCase() + key.slice(1);
  }
}

function displayTitle(node: GraphNode): string {
  const title = node.title.trim();
  if (title.length <= 36) return title;
  return `${title.slice(0, 35)}...`;
}

export function NoteGraph({
  cue = null,
  brainTag = "ONLINE",
  mode = "standby",
}: {
  cue?: GraphCue | null;
  brainTag?: string;
  mode?: OrbMode;
}) {
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
        <p className="status-note">Reading notes...</p>
      </div>
    );
  }

  return <GraphBody payload={payload} cue={cue} brainTag={brainTag} mode={mode} />;
}

function GraphBody({
  payload,
  cue,
  brainTag,
  mode,
}: {
  payload: NoteGraphPayload;
  cue: GraphCue | null;
  brainTag: string;
  mode: OrbMode;
}) {
  switch (payload.status) {
    case "not-wired":
    case "missing":
    case "empty":
      return <GraphEmpty payload={payload} brainTag={brainTag} mode={mode} />;
    case "ready":
      return <GraphReady payload={payload} cue={cue} brainTag={brainTag} mode={mode} />;
    default: {
      const neverStatus: never = payload.status;
      return neverStatus;
    }
  }
}

function GraphEmpty({
  payload,
  brainTag,
  mode,
}: {
  payload: NoteGraphPayload;
  brainTag: string;
  mode: OrbMode;
}) {
  return (
    <div className="graph-stage graph-stage-empty">
      <JarvisBadge mode={mode} brainTag={brainTag} />
      <p className="graph-stats">
        {payload.noteCount} notes · {payload.connectionCount} connections
      </p>
      <p className="status-note">{payload.detail || EMPTY.detail}</p>
    </div>
  );
}

function GraphReady({
  payload,
  cue,
  brainTag,
  mode,
}: {
  payload: NoteGraphPayload;
  cue: GraphCue | null;
  brainTag: string;
  mode: OrbMode;
}) {
  const [query, setQuery] = useState("");
  const [pathFromId, setPathFromId] = useState("");
  const [pathToId, setPathToId] = useState("");
  const [frameMode, setFrameMode] = useState<FrameMode>("fit");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seenCue, setSeenCue] = useState(0);
  const [homeToken, setHomeToken] = useState(0);
  const frameToken = `${frameMode}|${selectedId ?? ""}|${pathFromId}|${pathToId}|${query}|${homeToken}`;

  if (cue && cue.token !== seenCue) {
    setSeenCue(cue.token);
    if (cue.pathFrom && cue.pathTo) {
      const from = matchGraphNode(payload.nodes, cue.pathFrom);
      const to = matchGraphNode(payload.nodes, cue.pathTo);
      if (!from || !to) {
        setPathFromId("");
        setPathToId("");
        setFrameMode("fit");
      } else {
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
        setFrameMode("fit");
      } else {
        setSelectedId(first.id);
        setFrameMode(found.length === 1 ? "node" : "matches");
      }
    } else {
      setSelectedId(null);
      setFrameMode("fit");
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSelectedId(null);
      setFrameMode("fit");
      setHomeToken((token) => token + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const layoutEdges = useMemo(
    () => payload.edges.filter((edge) => edge.reason === "folder"),
    [payload.edges],
  );
  const points = useMemo(
    () =>
      layoutGalaxy(payload.nodes, layoutEdges, {
        repel: LAYOUT_REPEL,
        link: LAYOUT_LINK,
        width: WIDTH,
        height: HEIGHT,
      }),
    [payload.nodes, layoutEdges],
  );
  const matches = useMemo(() => matchingNodes(payload.nodes, query), [payload.nodes, query]);
  const matchIds = useMemo(() => new Set(matches.map((node) => node.id)), [matches]);
  const route = useMemo(() => {
    if (!pathFromId || !pathToId || pathFromId === pathToId) return null;
    return shortestPath(payload.edges, pathFromId, pathToId);
  }, [payload.edges, pathFromId, pathToId]);
  const routeIds = useMemo(() => (route ? new Set(route) : null), [route]);
  const visibleIds = useMemo(() => new Set(payload.nodes.map((node) => node.id)), [payload.nodes]);
  const searching = query.trim().length > 0;
  const routeOn = Boolean(route && route.length > 1);
  const clusters = [...new Set(payload.nodes.map(clusterKey))].sort((a, b) => a.localeCompare(b));
  const hubIds = useMemo(
    () => new Set(topHubs(payload.nodes, payload.edges, 8).map((entry) => entry.node.id)),
    [payload.nodes, payload.edges],
  );
  const selected = payload.nodes.find((node) => node.id === selectedId) ?? null;
  const noteLinks: NoteLink[] = selected
    ? payload.edges.flatMap((edge) => {
        const otherId = edge.from === selected.id ? edge.to : edge.to === selected.id ? edge.from : "";
        if (!otherId) return [];
        const other = payload.nodes.find((node) => node.id === otherId);
        if (!other) return [];
        return [{ id: other.id, title: other.title, reason: edge.reason }];
      })
    : [];

  function clearFocus() {
    setSelectedId(null);
    setFrameMode("fit");
    setHomeToken((token) => token + 1);
  }

  function openNote(id: string) {
    if (id === selectedId) {
      clearFocus();
      return;
    }
    setSelectedId(id);
    setFrameMode("node");
  }

  function onSearch(value: string) {
    setQuery(value);
    const found = matchingNodes(payload.nodes, value);
    if (!value.trim()) {
      setFrameMode("fit");
      setHomeToken((token) => token + 1);
      return;
    }
    const first = found[0];
    if (!first) {
      setFrameMode("fit");
      return;
    }
    setSelectedId(first.id);
    setFrameMode(found.length === 1 ? "node" : "matches");
    setHomeToken((token) => token + 1);
  }

  return (
    <div className={selected ? "graph-stage has-note" : "graph-stage"}>
      <GalaxyBay
        noteCount={payload.noteCount}
        connectionCount={payload.connectionCount}
        query={query}
        matchCount={searching ? matches.length : null}
        onSearch={onSearch}
      />
      <div className="graph-canvas">
        <JarvisBadge mode={mode} brainTag={brainTag} />
        <GalaxyScene
          nodes={payload.nodes}
          edges={payload.edges}
          points={points}
          visibleIds={visibleIds}
          selectedId={selectedId}
          frameMode={frameMode}
          route={route}
          routeIds={routeIds}
          routeOn={routeOn}
          searching={searching}
          matchIds={matchIds}
          frameToken={frameToken}
          hubIds={hubIds}
          onSelect={openNote}
          onClear={clearFocus}
        />
        <ul className="graph-legend" aria-label="Note colors">
          {clusters.slice(0, 8).map((key) => (
            <li key={key}>
              <span className="graph-swatch" style={{ background: swatchFor(key) }} />
              {clusterLabel(key)}
            </li>
          ))}
        </ul>
        <p className="graph-pan-hint">Drag to turn · Scroll to zoom · Click a dot to read</p>
      </div>
      {selected ? <NoteReader node={selected} links={noteLinks} onBack={clearFocus} onOpen={openNote} /> : null}
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

function stableFrame(points: LayoutPoint[]): Frame {
  const origin = layoutOrigin(WIDTH, HEIGHT);
  let reach = cageRadius(WIDTH, HEIGHT) * 0.72;
  for (const point of points) {
    reach = Math.max(reach, Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z));
  }
  reach *= 1.22;
  return {
    x: origin.x - reach,
    y: origin.y - reach * 0.86,
    w: reach * 2,
    h: reach * 1.72,
  };
}

function wirePath(from: LayoutPoint, to: LayoutPoint, _reason: GraphEdge["reason"], camera: Camera): string {
  const origin = layoutOrigin(WIDTH, HEIGHT);
  const unit = cageRadius(WIDTH, HEIGHT);
  const start = projectSpace(from, camera, origin, unit);
  const end = projectSpace(to, camera, origin, unit);
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

function SpaceBackdrop({ camera }: { camera: Camera }) {
  const origin = layoutOrigin(WIDTH, HEIGHT);
  return (
    <g aria-hidden="true">
      {STARS.map((star, index) => {
        const projected = projectUnit(star, camera, WIDTH, HEIGHT);
        return (
          <circle
            key={`star-${index}`}
            cx={projected.x}
            cy={projected.y}
            r={0.7 + projected.depth * 1.1}
            fill={`rgba(186, 236, 255, ${0.14 + projected.depth * 0.32})`}
          />
        );
      })}
      <line x1={origin.x - 14} y1={origin.y} x2={origin.x - 5} y2={origin.y} stroke="rgba(215, 246, 255, 0.22)" />
      <line x1={origin.x + 5} y1={origin.y} x2={origin.x + 14} y2={origin.y} stroke="rgba(215, 246, 255, 0.22)" />
      <line x1={origin.x} y1={origin.y - 14} x2={origin.x} y2={origin.y - 5} stroke="rgba(215, 246, 255, 0.22)" />
      <line x1={origin.x} y1={origin.y + 5} x2={origin.x} y2={origin.y + 14} stroke="rgba(215, 246, 255, 0.22)" />
    </g>
  );
}

function GalaxyScene({
  nodes,
  edges,
  points,
  visibleIds,
  selectedId,
  frameMode,
  route,
  routeIds,
  routeOn,
  searching,
  matchIds,
  frameToken,
  hubIds,
  onSelect,
  onClear,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  points: LayoutPoint[];
  visibleIds: Set<string>;
  selectedId: string | null;
  frameMode: FrameMode;
  route: string[] | null;
  routeIds: Set<string> | null;
  routeOn: boolean;
  searching: boolean;
  matchIds: Set<string>;
  frameToken: string;
  hubIds: Set<string>;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const [grabbing, setGrabbing] = useState(false);
  const [spin, setSpin] = useState<Camera>({ yaw: 0, pitch: 0 });
  const [zoom, setZoom] = useState(1);
  const [zoomToken, setZoomToken] = useState(frameToken);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const frameWidthRef = useRef(1);
  const dragRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const swallowRef = useRef(false);
  if (zoomToken !== frameToken) {
    setZoomToken(frameToken);
    setZoom(1);
  }
  const camera = turnedCamera(restCamera(), spin);
  const [pxPerUnit, setPxPerUnit] = useState(0.8);
  const [hoverId, setHoverId] = useState<string | null>(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      setZoom((current) => nextZoom(current, event.deltaY));
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const width = svg.clientWidth;
      if (width > 0) setPxPerUnit(width / Math.max(frameWidthRef.current, 1));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  const origin = layoutOrigin(WIDTH, HEIGHT);
  const unit = cageRadius(WIDTH, HEIGHT);
  const pointById = new Map(points.map((point) => [point.id, point]));
  const projected = new Map(
    points.map((point) => [point.id, projectSpace(point, camera, origin, unit)] as const),
  );
  const visibleProjected = nodes
    .map((node) => projected.get(node.id))
    .filter((point): point is NonNullable<typeof point> => Boolean(point));

  let frame: Frame;
  switch (frameMode) {
    case "node": {
      const point = selectedId ? projected.get(selectedId) : undefined;
      frame = point && selectedId && visibleIds.has(selectedId) ? frameAroundPoint(point, 620, 440) : stableFrame(points);
      break;
    }
    case "path": {
      const pathPoints = (route ?? [])
        .map((id) => projected.get(id))
        .filter((point): point is NonNullable<typeof point> => Boolean(point));
      if (pathPoints.length === 0) {
        frame = stableFrame(points);
        break;
      }
      const tight = frameAroundPoints(pathPoints, 150, 120);
      const cx = tight.x + tight.w / 2;
      const cy = tight.y + tight.h / 2;
      const w = Math.max(tight.w, 640);
      const h = Math.max(tight.h, 440);
      frame = { x: cx - w / 2, y: cy - h / 2, w, h };
      break;
    }
    case "matches": {
      const matched = nodes
        .filter((node) => matchIds.has(node.id))
        .map((node) => projected.get(node.id))
        .filter((point): point is NonNullable<typeof point> => Boolean(point));
      frame = frameAroundPoints(matched.length > 0 ? matched : visibleProjected, 140, 110);
      break;
    }
    case "fit":
      frame = stableFrame(points.filter((point) => visibleIds.has(point.id)));
      break;
    default: {
      const neverMode: never = frameMode;
      frame = neverMode;
    }
  }

  const shifted = frameAtZoom(frame, zoom);
  frameWidthRef.current = shifted.w;
  const showAllLabels = nodes.length <= 24;
  const liveWidth = svgRef.current?.clientWidth ?? 0;
  const labelScale = liveWidth > 0 ? liveWidth / Math.max(shifted.w, 1) : pxPerUnit;
  const fontUser = 12 / Math.max(labelScale, 0.12);
  const labelBoxes: LabelCandidate[] = [];
  for (const node of nodes) {
    const point = projected.get(node.id);
    if (!point || !visibleIds.has(node.id)) continue;
    const neighbor =
      selectedId !== null &&
      edges.some(
        (edge) =>
          (edge.from === selectedId && edge.to === node.id) || (edge.to === selectedId && edge.from === node.id),
      );
    const flags = {
      selected: node.id === selectedId,
      hover: node.id === hoverId,
      hub: hubIds.has(node.id),
      onPath: routeIds?.has(node.id) ?? false,
      neighbor,
      folder: node.kind === "folder",
      match: matchIds.has(node.id),
      depth: point.depth,
    };
    if (!labelEligible(flags, zoom, showAllLabels)) continue;
    const rank = labelRank(flags);
    const text = displayTitle(node);
    labelBoxes.push({
      id: node.id,
      x: point.x,
      y: point.y,
      w: Math.max(fontUser * 2.2, text.length * fontUser * 0.58 + fontUser * 0.8),
      h: fontUser * 1.45,
      depth: point.depth,
      priority: rank.priority,
      protected: rank.protected,
    });
  }
  const placedLabels = new Map(pickLabels(labelBoxes).map((label) => [label.id, label]));
  const labelWidth = new Map(labelBoxes.map((label) => [label.id, label.w]));
  const hover = nodes.find((node) => node.id === hoverId) ?? null;
  const hoverPoint = hover ? projected.get(hover.id) : undefined;
  const drawnEdges = edges
    .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
    .filter((edge) => {
      if (edge.reason === "folder") return true;
      return (
        (routeOn && onRoute(edge, route)) ||
        (selectedId !== null && (edge.from === selectedId || edge.to === selectedId)) ||
        (searching && (matchIds.has(edge.from) || matchIds.has(edge.to)))
      );
    })
    .map((edge) => {
      const from = projected.get(edge.from);
      const to = projected.get(edge.to);
      return { edge, depth: ((from?.depth ?? 0) + (to?.depth ?? 0)) / 2 };
    })
    .sort((a, b) => a.depth - b.depth);
  const drawnNodes = [...nodes].sort((a, b) => (projected.get(a.id)?.depth ?? 0) - (projected.get(b.id)?.depth ?? 0));

  function onSpacePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    swallowRef.current = false;
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }

  function onSpacePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || !svg || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      setGrabbing(true);
      svg.setPointerCapture(event.pointerId);
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    setSpin((current) => spinCamera(current, dx, dy));
  }

  function onSpacePointerEnd(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.moved) swallowRef.current = true;
    dragRef.current = null;
    setGrabbing(false);
    const svg = svgRef.current;
    if (svg?.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  }

  return (
    <svg
      ref={svgRef}
      className={grabbing ? "graph-svg is-grabbing" : "graph-svg"}
      viewBox={viewBox(shifted)}
      role="group"
      aria-label="Vault notes. Drag to turn. Scroll to zoom. Click a note to read it."
      onPointerDown={onSpacePointerDown}
      onPointerMove={onSpacePointerMove}
      onPointerUp={onSpacePointerEnd}
      onPointerCancel={onSpacePointerEnd}
      onClickCapture={(event) => {
        if (!swallowRef.current) return;
        swallowRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <rect
        className="graph-grab"
        x={shifted.x}
        y={shifted.y}
        width={shifted.w}
        height={shifted.h}
        fill="transparent"
        onClick={(event) => {
          event.stopPropagation();
          if (swallowRef.current) {
            swallowRef.current = false;
            return;
          }
          onClear();
        }}
      />
      <SpaceBackdrop camera={camera} />
      {drawnEdges.map(({ edge, depth }) => {
        const from = pointById.get(edge.from);
        const to = pointById.get(edge.to);
        if (!from || !to) return null;
        const hot =
          routeOn ? onRoute(edge, route) : selectedId !== null && (edge.from === selectedId || edge.to === selectedId);
        const dim = (searching && !matchIds.has(edge.from) && !matchIds.has(edge.to)) || (routeOn && !hot);
        const linked = edge.reason === "wikilink";
        const folder = edge.reason === "folder";
        const width = (folder ? 1.4 : linked ? 1.05 : 0.7) * (0.75 + depth * 0.45);
        const tone = hot
          ? "#f4fdff"
          : folder
            ? "rgba(126, 231, 255, 0.55)"
            : linked
              ? "rgba(186, 236, 255, 0.7)"
              : "rgba(100, 190, 230, 0.35)";
        return (
          <path
            key={edge.id}
            d={wirePath(from, to, edge.reason, camera)}
            fill="none"
            stroke={tone}
            strokeWidth={hot ? width + 0.9 : width}
            strokeDasharray={dashFor(edge.reason)}
            opacity={dim ? 0.06 : hot ? 0.98 : folder ? 0.7 + depth * 0.25 : 0.45 + depth * 0.35}
          />
        );
      })}
      {drawnNodes.map((node) => {
        const point = projected.get(node.id);
        if (!point) return null;
        const active = node.id === selectedId;
        const color = colorFor(node);
        const degree = degreeOf(node.id, edges);
        const onPath = routeIds?.has(node.id) ?? false;
        const label = placedLabels.get(node.id);
        const plate = labelWidth.get(node.id) ?? fontUser * 4;
        const radius = ((node.kind === "folder" ? 11 : 7.2) + Math.min(degree, 8) * 0.55) * (0.62 + point.depth * 0.85);
        const dim = (searching && !matchIds.has(node.id)) || (routeOn && !onPath && !active);
        const labelLeft = point.x > shifted.x + shifted.w * 0.68;
        const plateX = labelLeft ? point.x - radius - 10 - plate : point.x + radius + 8;
        const plateY = point.y - fontUser * 0.95;
        return (
          <g
            key={node.id}
            className="graph-node"
            opacity={label && label.opacity === 1 ? 1 : dim ? 0.14 : 0.55 + point.depth * 0.45}
            tabIndex={0}
            role="button"
            aria-pressed={active}
            aria-label={`${node.kind === "folder" ? `${node.title} folder` : node.title}, ${degree} connections`}
            onPointerEnter={() => setHoverId(node.id)}
            onPointerLeave={() => setHoverId((current) => (current === node.id ? null : current))}
            onClick={() => onSelect(node.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(node.id);
              }
            }}
          >
            <circle cx={point.x} cy={point.y} r={radius + 16} fill="transparent" />
            <circle cx={point.x} cy={point.y} r={radius + 11} fill={color} opacity={active || onPath ? 0.42 : 0.28} />
            <circle cx={point.x} cy={point.y} r={radius + 5.5} fill={color} opacity={0.22} />
            <circle
              cx={point.x}
              cy={point.y}
              r={radius}
              fill={node.kind === "folder" ? "rgba(12, 36, 48, 0.72)" : color}
              fillOpacity={node.kind === "folder" ? 1 : active ? 0.95 : 0.72}
              stroke={active ? "#f4fdff" : color}
              strokeWidth={active ? 3 : 2.3}
            />
            <circle cx={point.x} cy={point.y} r={Math.max(2.2, radius * 0.28)} fill="#f4fdff" opacity={0.85} />
            {node.kind === "folder" ? (
              <circle cx={point.x} cy={point.y} r={radius + 4} fill="none" stroke={color} strokeWidth="1.2" />
            ) : null}
            {label ? (
              <g className="graph-label" opacity={label.opacity}>
                <rect
                  className="graph-label-plate"
                  x={plateX}
                  y={plateY}
                  width={plate}
                  height={fontUser * 1.45}
                  rx={2}
                />
                <text
                  className="graph-label-text"
                  x={plateX + fontUser * 0.4}
                  y={point.y + fontUser * 0.22}
                  fontSize={fontUser}
                >
                  {displayTitle(node)}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
      {hover && hoverPoint ? (
        <HoverTip
          title={displayTitle(hover)}
          degree={degreeOf(hover.id, edges)}
          x={hoverPoint.x}
          y={hoverPoint.y}
          frame={shifted}
        />
      ) : null}
    </svg>
  );
}

function HoverTip({
  title,
  degree,
  x,
  y,
  frame,
}: {
  title: string;
  degree: number;
  x: number;
  y: number;
  frame: Frame;
}) {
  const name = title.length <= 36 ? title : `${title.slice(0, 35)}...`;
  const meta = `${degree} ${degree === 1 ? "link" : "links"} - click to read`;
  const boxW = Math.max(name.length, meta.length) * 6.6 + 16;
  const left = x + boxW + 18 > frame.x + frame.w ? x - boxW - 14 : x + 14;
  const top = Math.max(frame.y + 8, y - 46);
  return (
    <g className="graph-tip" transform={`translate(${left} ${top})`} aria-hidden="true">
      <rect className="graph-tip-box" width={boxW} height="38" />
      <text className="graph-tip-title" x="8" y="15">
        {name}
      </text>
      <text className="graph-tip-meta" x="8" y="30">
        {meta}
      </text>
    </g>
  );
}

function GalaxyBay({
  noteCount,
  connectionCount,
  query,
  matchCount,
  onSearch,
}: {
  noteCount: number;
  connectionCount: number;
  query: string;
  matchCount: number | null;
  onSearch: (value: string) => void;
}) {
  return (
    <aside className="galaxy-bay" aria-label="Search">
      <header className="galaxy-head">
        <p className="galaxy-title">Jarvis OS</p>
        <p className="galaxy-stats-line">
          {noteCount} notes · {connectionCount} connections
        </p>
      </header>
      <label className="galaxy-field" htmlFor="graph-search">
        <span className="line-label">Search</span>
        <Input
          id="graph-search"
          value={query}
          autoComplete="off"
          placeholder="Search the brain..."
          className="h-9 rounded-none border-border/60 bg-transparent px-2 text-sm md:text-sm"
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>
      {matchCount !== null ? (
        <p className="galaxy-note">{matchCount === 0 ? "No matches." : `${matchCount} match${matchCount === 1 ? "" : "es"}`}</p>
      ) : null}
    </aside>
  );
}
