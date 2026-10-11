"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { NoteReader, type NoteLink } from "@/components/note-reader";
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
  restCamera,
  type Camera,
  type Frame,
  type LabelCandidate,
  type LayoutPoint,
} from "@/lib/graph-layout";
import { frameAtZoom, nextZoom, spinCamera, turnedCamera } from "@/lib/graph-turn";
import { degreeOf, matchGraphNode, matchingNodes, shortestPath } from "@/lib/graph-nav";
import {
  nodeColor,
  nodeDiameterPx,
  type GraphEdge,
  type GraphLegendEntry,
  type GraphNode,
  type GraphNodeType,
  type GraphStatus,
  type NoteGraphPayload,
} from "@/lib/note-graph";

const EMPTY: NoteGraphPayload = {
  status: "not-wired",
  detail: "",
  nodes: [],
  edges: [],
  noteCount: 0,
  connectionCount: 0,
  hiddenCount: 0,
  capped: false,
  legend: [],
};

const WIDTH = 1000;
const HEIGHT = 640;
const LAYOUT_REPEL = 260;
const LAYOUT_LINK = 230;
const LINK_COLOR = "rgba(73, 212, 255, 0.85)";
const LINK_HOT = "#49D4FF";

type FrameMode = "fit" | "node" | "path" | "matches";
type ZoomKind = "in" | "out" | "fit";

type ZoomCommand = {
  token: number;
  kind: ZoomKind;
};

export type GraphCue = {
  token: number;
  focusQuery?: string;
  pathFrom?: string;
  pathTo?: string;
};

function isKind(value: unknown): value is GraphNode["kind"] {
  return value === "note" || value === "folder";
}

function isNodeType(value: unknown): value is GraphNodeType {
  return (
    value === "note" ||
    value === "hub" ||
    value === "person" ||
    value === "link" ||
    value === "file" ||
    value === "journal" ||
    value === "decision"
  );
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
    isNodeType(node.nodeType) &&
    typeof node.ssot === "boolean" &&
    Array.isArray(node.hubs) &&
    node.hubs.every((hub) => typeof hub === "string") &&
    Array.isArray(node.tags) &&
    node.tags.every((tag) => typeof tag === "string")
  );
}

function isLegend(value: unknown): value is GraphLegendEntry[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const row = entry as Partial<GraphLegendEntry>;
      return isNodeType(row.type) && typeof row.label === "string" && typeof row.color === "string" && typeof row.count === "number";
    })
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
    isLegend(payload.legend) &&
    Array.isArray(payload.nodes) &&
    payload.nodes.every(isNode) &&
    Array.isArray(payload.edges) &&
    payload.edges.every(isEdge)
  );
}

function displayTitle(node: GraphNode): string {
  const title = node.title.trim();
  if (title.length <= 36) return title;
  return `${title.slice(0, 35)}...`;
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
        <p className="status-note">Reading notes...</p>
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
      <p className="graph-stats">
        {payload.noteCount} notes · {payload.connectionCount} connections
      </p>
      <p className="status-note">{payload.detail || EMPTY.detail}</p>
    </div>
  );
}

function GraphReady({ payload, cue }: { payload: NoteGraphPayload; cue: GraphCue | null }) {
  const [query, setQuery] = useState("");
  const [pathFromId, setPathFromId] = useState("");
  const [pathToId, setPathToId] = useState("");
  const [frameMode, setFrameMode] = useState<FrameMode>("fit");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seenCue, setSeenCue] = useState(0);
  const [homeToken, setHomeToken] = useState(0);
  const [zoomCommand, setZoomCommand] = useState<ZoomCommand>({ token: 0, kind: "fit" });
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

  const layoutNodes = useMemo(
    () =>
      payload.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        anchorId: node.ssot ? node.hubs[0] : undefined,
      })),
    [payload.nodes],
  );
  const points = useMemo(
    () =>
      layoutGalaxy(layoutNodes, payload.edges, {
        repel: LAYOUT_REPEL,
        link: LAYOUT_LINK,
        width: WIDTH,
        height: HEIGHT,
      }),
    [layoutNodes, payload.edges],
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

  function commandZoom(kind: ZoomKind) {
    if (kind === "fit") {
      setFrameMode("fit");
      setHomeToken((token) => token + 1);
    }
    setZoomCommand((current) => ({ token: current.token + 1, kind }));
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
      <div className="graph-tools" role="group" aria-label="Zoom">
        <button type="button" onClick={() => commandZoom("fit")}>
          FIT
        </button>
        <button type="button" onClick={() => commandZoom("in")} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => commandZoom("out")} aria-label="Zoom out">
          −
        </button>
      </div>
      <div className="graph-canvas">
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
          zoomCommand={zoomCommand}
          onSelect={openNote}
          onClear={clearFocus}
        />
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

function wirePath(from: LayoutPoint, to: LayoutPoint, arc: boolean, camera: Camera): string {
  const origin = layoutOrigin(WIDTH, HEIGHT);
  const unit = cageRadius(WIDTH, HEIGHT);
  const start = projectSpace(from, camera, origin, unit);
  const end = projectSpace(to, camera, origin, unit);
  const line = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  if (!arc) return line;
  const mid = {
    x: (from.x + to.x) / 2 + (origin.x - (from.x + to.x) / 2) * 0.4,
    y: (from.y + to.y) / 2 + (origin.y - (from.y + to.y) / 2) * 0.4,
    z: ((from.z + to.z) / 2) * 0.6,
  };
  const control = projectSpace(mid, camera, origin, unit);
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

function sameCluster(edge: GraphEdge, nodes: Map<string, GraphNode>): boolean {
  if (edge.reason === "tag" || edge.reason === "folder") return true;
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  if (!from || !to) return false;
  if (from.kind === "folder" || to.kind === "folder") return true;
  return from.hubs.some((hub) => to.hubs.includes(hub));
}

function meetScale(svg: SVGSVGElement | null, frame: Frame): number {
  if (!svg || svg.clientWidth <= 0 || svg.clientHeight <= 0) return 0.8;
  return Math.min(svg.clientWidth / Math.max(frame.w, 1), svg.clientHeight / Math.max(frame.h, 1));
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
  zoomCommand,
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
  zoomCommand: ZoomCommand;
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
  const zoomSeen = useRef(zoomCommand.token);
  if (zoomCommand.token !== zoomSeen.current) {
    zoomSeen.current = zoomCommand.token;
    if (zoomCommand.kind === "fit") {
      setZoom(1);
      setSpin({ yaw: 0, pitch: 0 });
    } else if (zoomCommand.kind === "in") {
      setZoom((current) => nextZoom(current, -120));
    } else {
      setZoom((current) => nextZoom(current, 120));
    }
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
      const next = meetScale(svg, stableFrame(points));
      if (next > 0) setPxPerUnit(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [points]);
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
  const showAllLabels = false;
  const fitScale = Math.max(pxPerUnit, 0.05);
  const currentScale = Math.max(meetScale(svgRef.current, shifted) || fitScale * zoom, 0.05);
  const fontUser = 12 / currentScale;
  const linkWidth = 2 / fitScale;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
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
      hub: node.kind === "folder" || node.nodeType === "hub",
      ssot: node.ssot,
      onPath: routeIds?.has(node.id) ?? false,
      neighbor,
      folder: false,
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
      {drawnEdges.map(({ edge }) => {
        const from = pointById.get(edge.from);
        const to = pointById.get(edge.to);
        if (!from || !to) return null;
        const hot = routeOn
          ? onRoute(edge, route)
          : selectedId !== null && (edge.from === selectedId || edge.to === selectedId);
        const dim = (searching && !matchIds.has(edge.from) && !matchIds.has(edge.to)) || (routeOn && !hot);
        return (
          <path
            key={edge.id}
            d={wirePath(from, to, !sameCluster(edge, nodeById), camera)}
            fill="none"
            stroke={hot ? LINK_HOT : LINK_COLOR}
            strokeWidth={hot ? linkWidth * 1.4 : linkWidth}
            opacity={dim ? 0.14 : 1}
          />
        );
      })}
      {drawnNodes.map((node) => {
        const point = projected.get(node.id);
        if (!point) return null;
        const active = node.id === selectedId;
        const color = nodeColor(node.nodeType);
        const degree = degreeOf(node.id, edges);
        const onPath = routeIds?.has(node.id) ?? false;
        const label = placedLabels.get(node.id);
        const plate = labelWidth.get(node.id) ?? fontUser * 4;
        const onScreen = (nodeDiameterPx(node) / fitScale) * currentScale;
        const radius = (onScreen < 10 ? 10 : nodeDiameterPx(node)) / 2 / (onScreen < 10 ? currentScale : fitScale);
        const dim = (searching && !matchIds.has(node.id)) || (routeOn && !onPath && !active);
        const labelY = label?.y ?? point.y;
        const labelLeft = point.x > shifted.x + shifted.w * 0.68;
        const plateX = labelLeft ? point.x - radius - 8 - plate : point.x + radius + 8;
        const plateY = labelY - fontUser * 0.72;
        const ring = 3 / currentScale;
        return (
          <g
            key={node.id}
            className="graph-node"
            opacity={dim ? 0.16 : 1}
            tabIndex={0}
            role="button"
            aria-pressed={active}
            aria-label={`${node.title}, ${degree} connections`}
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
            <circle cx={point.x} cy={point.y} r={radius + 14} fill="transparent" />
            <circle cx={point.x} cy={point.y} r={radius * 2.2} fill={color} opacity={0.18} />
            <circle cx={point.x} cy={point.y} r={radius} fill={color} />
            {active || onPath ? (
              <circle
                cx={point.x}
                cy={point.y}
                r={radius + ring}
                fill="none"
                stroke={LINK_HOT}
                strokeWidth={Math.max(ring * 0.7, 1 / currentScale)}
              />
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
                  y={labelY + fontUser * 0.32}
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
