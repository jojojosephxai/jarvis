"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cageRadius,
  cageRings,
  frameAroundPoint,
  frameAroundPoints,
  grabDelta,
  layoutGalaxy,
  layoutOrigin,
  orbitCamera,
  projectSpace,
  projectUnit,
  shiftFrame,
  starField,
  type Camera,
  type Frame,
  type LayoutPoint,
  type Pan,
} from "@/lib/graph-layout";
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
const CAGE = cageRings();
const STARS = starField();
const TAG_COLOR: Record<string, string> = {
  classes: "#3dd6ff",
  person: "#8aa4ff",
  rules: "#5eead4",
};
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
    return COOL[hash % COOL.length] ?? "#7ee7ff";
  }
  return "#8fd3ff";
}

function clusterLabel(key: string): string {
  switch (key) {
    case "folder":
      return "Folder";
    case "note":
      return "Note";
    case "classes":
      return "Classes";
    case "person":
      return "Person";
    case "rules":
      return "Rules";
    default:
      return key.slice(0, 1).toUpperCase() + key.slice(1);
  }
}

function shortTitle(title: string): string {
  if (title.length <= 22) return title;
  return `${title.slice(0, 21)}…`;
}

function displayTitle(node: GraphNode): string {
  if (node.title.length <= 18) return node.title;
  const stem = node.id.split("/").pop()?.replace(/\.md$/i, "") ?? node.title;
  if (stem.length > 0 && stem.length <= 18) return stem;
  return shortTitle(node.title);
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

type LinkRow = {
  title: string;
  reason: GraphEdge["reason"];
};

function linkRows(node: GraphNode | null, nodes: GraphNode[], edges: GraphEdge[]): LinkRow[] {
  if (!node) return [];
  const titles = new Map(nodes.map((item) => [item.id, item.title]));
  return edges
    .filter((edge) => edge.from === node.id || edge.to === node.id)
    .map((edge) => {
      const other = edge.from === node.id ? edge.to : edge.from;
      return { title: titles.get(other) ?? other, reason: edge.reason };
    })
    .sort((a, b) => a.title.localeCompare(b.title) || a.reason.localeCompare(b.reason));
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
  const reduced = useReducedMotion();
  const camera = useOrbit(false, reduced);
  return (
    <div className="graph-stage graph-stage-empty">
      <svg className="graph-empty-rings" viewBox={viewBox(stableFrame([]))} aria-hidden="true">
        <SpaceBackdrop camera={camera} />
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
  const [homeToken, setHomeToken] = useState(0);
  const frameToken = `${frameMode}|${selectedId ?? ""}|${pathFromId}|${pathToId}|${query}|${typeFilter}|${folderFilter}|${homeToken}`;

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
  const clusters = [...new Set(visibleNodes.map(clusterKey))];

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
        onFit={() => {
          setFrameMode("fit");
          setHomeToken((token) => token + 1);
        }}
        onFocus={() => {
          if (!selectedId) return;
          setFrameMode("node");
          setHomeToken((token) => token + 1);
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
        <GalaxyScene
          nodes={visibleNodes}
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
          onSelect={(id) => {
            setSelectedId(id);
            setFrameMode("node");
          }}
        />
        <p className="graph-pan-hint">Drag to move</p>
        {visibleNodes.length === 0 ? <p className="galaxy-empty-filter">No notes match this filter.</p> : null}
        {clusters.length > 0 ? (
          <ul className="graph-key" aria-label="Note colors">
            {clusters.map((key) => (
              <li key={key}>
                <span
                  className="graph-swatch"
                  style={{ background: key === "folder" ? "#f4fdff" : key === "note" ? "#8fd3ff" : (TAG_COLOR[key] ?? "#7ee7ff") }}
                />
                {clusterLabel(key)}
              </li>
            ))}
          </ul>
        ) : null}
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
        links={linkRows(selected, payload.nodes, payload.edges)}
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

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return reduced;
}

const STILL_CAMERA: Camera = { yaw: 0.72, pitch: 0.52 };

function useOrbit(calm: boolean, reduced: boolean, held = false): Camera {
  const [camera, setCamera] = useState<Camera>(STILL_CAMERA);
  const heldRef = useRef(held);
  useEffect(() => {
    heldRef.current = held;
  }, [held]);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    let last = 0;
    let pausedAt = 0;
    let pausedFor = 0;
    const started = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;
      if (heldRef.current) {
        if (pausedAt === 0) pausedAt = now;
        return;
      }
      if (pausedAt !== 0) {
        pausedFor += now - pausedAt;
        pausedAt = 0;
      }
      if (now - last < 80) return;
      last = now;
      setCamera(orbitCamera((now - started - pausedFor) / 1000, calm));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [calm, reduced]);
  return reduced ? STILL_CAMERA : camera;
}

function stableFrame(points: LayoutPoint[]): Frame {
  const origin = layoutOrigin(WIDTH, HEIGHT);
  let reach = cageRadius(WIDTH, HEIGHT);
  for (const point of points) {
    reach = Math.max(reach, Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z));
  }
  reach *= 1.45;
  return {
    x: origin.x - reach,
    y: origin.y - reach * 0.86,
    w: reach * 2,
    h: reach * 1.72,
  };
}

function wirePath(from: LayoutPoint, to: LayoutPoint, reason: GraphEdge["reason"], camera: Camera): string {
  const origin = layoutOrigin(WIDTH, HEIGHT);
  const unit = cageRadius(WIDTH, HEIGHT);
  const steps = reason === "folder" ? 1 : 6;
  const parts: string[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    let x = from.x + (to.x - from.x) * t;
    let y = from.y + (to.y - from.y) * t;
    let z = from.z + (to.z - from.z) * t;
    if (reason !== "folder") {
      const lift = Math.sin(Math.PI * t) * unit * 0.14;
      const dx = x - origin.x;
      const dy = y - origin.y;
      const dz = z - origin.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      x += (dx / len) * lift;
      y += (dy / len) * lift;
      z += (dz / len) * lift;
    }
    const projected = projectSpace({ x, y, z }, camera, origin, unit);
    parts.push(`${step === 0 ? "M" : "L"} ${projected.x.toFixed(1)} ${projected.y.toFixed(1)}`);
  }
  return parts.join(" ");
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
            fill={`rgba(186, 236, 255, ${0.15 + projected.depth * 0.35})`}
          />
        );
      })}
      {CAGE.map((ring, index) => {
        const points = ring
          .map((point) => {
            const projected = projectUnit(point, camera, WIDTH, HEIGHT);
            return `${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
          })
          .join(" ");
        return (
          <polyline
            key={`cage-${index}`}
            points={points}
            fill="none"
            stroke="rgba(90, 214, 255, 0.42)"
            strokeWidth="1"
          />
        );
      })}
      <line x1={origin.x - 16} y1={origin.y} x2={origin.x - 6} y2={origin.y} stroke="rgba(215, 246, 255, 0.45)" />
      <line x1={origin.x + 6} y1={origin.y} x2={origin.x + 16} y2={origin.y} stroke="rgba(215, 246, 255, 0.45)" />
      <line x1={origin.x} y1={origin.y - 16} x2={origin.x} y2={origin.y - 6} stroke="rgba(215, 246, 255, 0.45)" />
      <line x1={origin.x} y1={origin.y + 6} x2={origin.x} y2={origin.y + 16} stroke="rgba(215, 246, 255, 0.45)" />
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
  onSelect,
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
  onSelect: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const calm = frameMode === "node" || frameMode === "path";
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const [seenToken, setSeenToken] = useState(frameToken);
  const [frozenFrame, setFrozenFrame] = useState<Frame | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const swallowRef = useRef(false);
  if (seenToken !== frameToken) {
    setSeenToken(frameToken);
    setPan({ x: 0, y: 0 });
    setFrozenFrame(null);
  }
  const camera = useOrbit(calm, reduced, grabbing);
  const [hoverId, setHoverId] = useState<string | null>(null);
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

  const showAllLabels = nodes.length <= 24;
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
  const spaceFrame = frozenFrame ?? frame;
  const shifted = shiftFrame(spaceFrame, pan);

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
      setFrozenFrame((current) => current ?? frame);
      setGrabbing(true);
      svg.setPointerCapture(event.pointerId);
    }
    const rect = svg.getBoundingClientRect();
    const delta = grabDelta(dx, dy, spaceFrame, rect.width, rect.height);
    drag.x = event.clientX;
    drag.y = event.clientY;
    setPan((current) => ({ x: current.x + delta.x, y: current.y + delta.y }));
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
      aria-label="Vault notes. Drag to move the space."
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
      <rect className="graph-grab" x={shifted.x} y={shifted.y} width={shifted.w} height={shifted.h} fill="transparent" />
      <SpaceBackdrop camera={camera} />
      {drawnEdges.map(({ edge, depth }) => {
        const from = pointById.get(edge.from);
        const to = pointById.get(edge.to);
        if (!from || !to) return null;
        const hot = routeOn ? onRoute(edge, route) : selectedId !== null && (edge.from === selectedId || edge.to === selectedId);
        const dim = (searching && !matchIds.has(edge.from) && !matchIds.has(edge.to)) || (routeOn && !hot);
        const linked = edge.reason === "wikilink";
        const width = (linked ? 1.7 : 1.15) * (0.65 + depth * 0.7);
        return (
          <path
            key={edge.id}
            d={wirePath(from, to, edge.reason, camera)}
            fill="none"
            stroke={hot ? "#f4fdff" : linked ? "rgba(210, 246, 255, 0.9)" : "rgba(126, 231, 255, 0.55)"}
            strokeWidth={hot ? width + 0.8 : width}
            strokeDasharray={dashFor(edge.reason)}
            opacity={dim ? 0.12 : 0.35 + depth * 0.65}
          />
        );
      })}
      {drawnNodes.map((node) => {
        const point = projected.get(node.id);
        if (!point) return null;
        const active = node.id === selectedId;
        const color = colorFor(node);
        const degree = degreeOf(node.id, edges);
        const neighbor =
          selectedId !== null &&
          edges.some((edge) => {
            return (
              (edge.from === selectedId && edge.to === node.id) || (edge.to === selectedId && edge.from === node.id)
            );
          });
        const onPath = routeIds?.has(node.id) ?? false;
        const labelOn = showAllLabels || active || neighbor || onPath || node.kind === "folder" || matchIds.has(node.id);
        const radius = ((node.kind === "folder" ? 7 : 4.2) + Math.min(degree, 8) * 0.85) * (0.42 + point.depth * 1.25);
        const dim = (searching && !matchIds.has(node.id)) || (routeOn && !onPath && !active);
        const labelLeft = point.x > shifted.x + shifted.w * 0.68;
        return (
          <g
            key={node.id}
            className="graph-node"
            opacity={dim ? 0.1 : 0.2 + point.depth * 0.8}
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
            <circle cx={point.x} cy={point.y} r={radius + 12} fill="transparent" />
            <circle cx={point.x} cy={point.y} r={radius + 6} fill={color} opacity={active || onPath ? 0.28 : 0.12} />
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
                fontSize={10 + point.depth * 6}
                textAnchor={labelLeft ? "end" : "start"}
              >
                {displayTitle(node)}
              </text>
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
  const name = title.length <= 22 ? title : `${title.slice(0, 21)}…`;
  const meta = `${degree} ${degree === 1 ? "link" : "links"} — click to focus`;
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
      <p className="galaxy-hint">Drag the space to move it. The notes sit in a turning sphere. Solid lines are links between notes.</p>
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
  links,
}: {
  node: GraphNode | null;
  detail: string;
  degree: number;
  onPath: boolean;
  links: LinkRow[];
}) {
  if (!node) {
    return (
      <aside className="graph-inspector" aria-label="Inspector">
        <p className="line-label">Inspector</p>
        <h3>Click a note</h3>
        <p className="stub-lead">Notes are the dots. A solid line is a wikilink. A dashed line is a shared tag. A dotted line is the folder.</p>
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
      {links.length > 0 ? (
        <ul className="galaxy-hubs">
          {links.slice(0, 8).map((link) => (
            <li key={`${link.reason}:${link.title}`}>
              {link.title} · {reasonLabel(link.reason)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="stub-lead">No lines touch this dot.</p>
      )}
      <p className="stub-lead">
        {node.kind === "folder"
          ? "This dot is the folder, not a note."
          : "Preview only. Ask in Talk if you want the brain to read this note."}
      </p>
    </aside>
  );
}
