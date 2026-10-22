"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

import { NoteReader, type NoteLink } from "@/components/note-reader";
import { layoutGalaxy } from "@/lib/graph-layout";
import { matchGraphNode, matchingNodes, shortestPath } from "@/lib/graph-nav";
import {
  areaHubs,
  hubLabelColor,
  type GraphEdge,
  type GraphLegendEntry,
  type GraphNode,
  type GraphNodeType,
  type GraphStatus,
  type NoteGraphPayload,
} from "@/lib/note-graph";

const ForceScene = dynamic(() => import("@/components/force-scene").then((mod) => mod.ForceScene), { ssr: false });

const EMPTY: NoteGraphPayload = {
  status: "not-wired",
  detail: "No notes available. Connect a vault or add notes to begin.",
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

type ZoomKind = "fit" | "in" | "out";
type FrameMode = "fit" | "cluster" | "node" | "path" | "matches";

export type GraphCue = {
  token: number;
  focusQuery?: string;
  focusHub?: string;
  pathFrom?: string;
  pathTo?: string;
  fit?: boolean;
  filterHub?: string;
  search?: string;
  clear?: boolean;
};

function isKind(value: unknown): value is GraphNode["kind"] {
  return value === "note" || value === "folder";
}

function isNodeType(value: unknown): value is GraphNodeType {
  return (
    value === "note" ||
    value === "heading" ||
    value === "hub" ||
    value === "tag" ||
    value === "person" ||
    value === "link" ||
    value === "file" ||
    value === "journal" ||
    value === "decision" ||
    value === "project"
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
    node.tags.every((tag) => typeof tag === "string") &&
    typeof node.root === "boolean" &&
    typeof node.file === "string" &&
    typeof node.anchor === "string"
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
    (edge.reason === "wikilink" ||
      edge.reason === "tag" ||
      edge.reason === "folder" ||
      edge.reason === "heading" ||
      edge.reason === "file")
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

export function NoteGraph({
  cue = null,
  suspendEscape = false,
  graphOpen,
  onHome,
  railCollapsed,
  onToggleRail,
  inspectorHost,
  onInspect,
}: {
  cue?: GraphCue | null;
  suspendEscape?: boolean;
  graphOpen: boolean;
  onHome: () => void;
  railCollapsed: boolean;
  onToggleRail: () => void;
  inspectorHost: HTMLDivElement | null;
  onInspect: () => void;
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

  const loadNotice = failed
    ? "The note graph could not be loaded. Try reloading."
    : !payload ? "Reading notes…" : payload.status === "ready" ? "" : payload.detail || EMPTY.detail;
  return <GraphReady payload={payload ?? EMPTY} loadNotice={loadNotice} cue={cue} suspendEscape={suspendEscape} graphOpen={graphOpen} onHome={onHome} railCollapsed={railCollapsed} onToggleRail={onToggleRail} inspectorHost={inspectorHost} onInspect={onInspect} />;
}

function matchHub(nodes: GraphNode[], wanted: string): GraphNode | undefined {
  const key = wanted.trim().toLowerCase();
  if (key === "me / jarvis") {
    return nodes.find((node) => node.kind === "folder" && node.title.toLowerCase() === "me");
  }
  return nodes.find(
    (node) => node.kind === "folder" && (node.title.toLowerCase() === key || node.id.toLowerCase() === key),
  );
}

function GraphReady({
  payload,
  loadNotice,
  cue,
  suspendEscape,
  graphOpen,
  onHome,
  railCollapsed,
  onToggleRail,
  inspectorHost,
  onInspect,
}: {
  payload: NoteGraphPayload;
  loadNotice: string;
  cue: GraphCue | null;
  suspendEscape: boolean;
  graphOpen: boolean;
  onHome: () => void;
  railCollapsed: boolean;
  onToggleRail: () => void;
  inspectorHost: HTMLDivElement | null;
  onInspect: () => void;
}) {
  const [query, setQuery] = useState("");
  const [pathFromId, setPathFromId] = useState("");
  const [pathToId, setPathToId] = useState("");
  const [frameMode, setFrameMode] = useState<FrameMode>("fit");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clusterId, setClusterId] = useState<string | null>(null);
  const [seenCue, setSeenCue] = useState(0);
  const [homeToken, setHomeToken] = useState(0);
  const [zoomCommand, setZoomCommand] = useState<{ token: number; kind: ZoomKind }>({ token: 0, kind: "fit" });
  const [repel, setRepel] = useState(180);
  const [linkLength, setLinkLength] = useState(160);
  const [showHubs, setShowHubs] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [hiddenTypes, setHiddenTypes] = useState<GraphNodeType[]>([]);
  const [repelDraft, setRepelDraft] = useState(180);
  const [linkDraft, setLinkDraft] = useState(160);
  const [localOn, setLocalOn] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [hopDepth, setHopDepth] = useState(1);
  const [showOrphans, setShowOrphans] = useState(true);
  const [filterCollapsed, setFilterCollapsed] = useState(false);
  const [readerId, setReaderId] = useState<string | null>(null);
  const [filterId, setFilterId] = useState<string | null>(null);

  if (payload.status === "ready" && cue && cue.token !== seenCue) {
    setSeenCue(cue.token);
    if (cue.fit || cue.clear) {
      setQuery("");
      setFilterId(null);
      setPathFromId("");
      setPathToId("");
      setSelectedId(null);
      setReaderId(null);
      setClusterId(null);
      setFrameMode("fit");
      setHomeToken((token) => token + 1);
    } else if (cue.filterHub) {
      const wanted = cue.filterHub.trim().toLowerCase();
      const hub = matchHub(payload.nodes, wanted);
      setQuery("");
      setPathFromId("");
      setPathToId("");
      if (!hub) {
        setFilterId(null);
        setClusterId(null);
        setFrameMode("fit");
      } else {
        setFilterId(hub.id);
        setClusterId(hub.id);
        setSelectedId(hub.id);
        setReaderId(hub.id);
        setFrameMode("cluster");
        setHomeToken((token) => token + 1);
      }
    } else if (cue.focusHub) {
      const wanted = cue.focusHub.trim().toLowerCase();
      const hub = matchHub(payload.nodes, wanted);
      setQuery("");
      setFilterId(null);
      setPathFromId("");
      setPathToId("");
      if (!hub) {
        setClusterId(null);
        setFrameMode("fit");
      } else {
        setClusterId(hub.id);
        setSelectedId(hub.id);
        setReaderId(hub.id);
        setFrameMode("cluster");
        setHomeToken((token) => token + 1);
      }
    } else if (cue.pathFrom && cue.pathTo) {
      const from = matchGraphNode(payload.nodes, cue.pathFrom);
      const to = matchGraphNode(payload.nodes, cue.pathTo);
      if (!from || !to) {
        setPathFromId("");
        setPathToId("");
        setClusterId(null);
        setFrameMode("fit");
      } else {
        setQuery("");
        setPathFromId(from.id);
        setPathToId(to.id);
        setSelectedId(from.id);
        setClusterId(null);
        setFrameMode("path");
      }
    } else if (cue.search || cue.focusQuery) {
      const text = cue.search || cue.focusQuery || "";
      const found = matchingNodes(payload.nodes, text);
      setFilterId(null);
      setQuery(text);
      setPathFromId("");
      setPathToId("");
      const first = found[0];
      if (!first) {
        setClusterId(null);
        setFrameMode("fit");
      } else if (first.kind === "folder") {
        setClusterId(first.id);
        setSelectedId(first.id);
        setReaderId(first.id);
        setFrameMode("cluster");
      } else {
        setSelectedId(first.id);
        setClusterId(null);
        setFrameMode(found.length === 1 ? "node" : "matches");
      }
      setHomeToken((token) => token + 1);
    } else {
      setSelectedId(null);
      setReaderId(null);
      setClusterId(null);
      setFrameMode("fit");
    }
  }

  useEffect(() => {
    if (suspendEscape) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      if (!selectedId && !clusterId && !filterId && !pathFromId && !pathToId) {
        if (graphOpen) onHome();
        return;
      }
      event.preventDefault();
      setSelectedId(null);
      setReaderId(null);
      setClusterId(null);
      setFilterId(null);
      setPathFromId("");
      setPathToId("");
      setFrameMode("fit");
      setHomeToken((token) => token + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [suspendEscape, graphOpen, onHome, selectedId, clusterId, filterId, pathFromId, pathToId]);

  const layoutNodes = useMemo(
    () =>
      payload.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        root: node.root,
        anchorId: node.root ? undefined : node.ssot ? node.hubs[0] : undefined,
        hubId: node.root ? node.id : node.kind === "folder" ? node.id : node.hubs[0],
      })),
    [payload.nodes],
  );
  const points = useMemo(
    () => layoutGalaxy(layoutNodes, payload.edges, { repel, link: linkLength, width: WIDTH, height: HEIGHT }),
    [layoutNodes, payload.edges, repel, linkLength],
  );
  const matches = useMemo(() => matchingNodes(payload.nodes, query), [payload.nodes, query]);
  const route = useMemo(() => {
    if (!pathFromId || !pathToId || pathFromId === pathToId) return null;
    return shortestPath(payload.edges, pathFromId, pathToId);
  }, [payload.edges, pathFromId, pathToId]);
  const visibleIds = useMemo(() => {
    const hidden = new Set(hiddenTypes);
    const linked = new Set<string>();
    for (const edge of payload.edges) {
      linked.add(edge.from);
      linked.add(edge.to);
    }
    const selectedNode = payload.nodes.find((node) => node.id === selectedId);
    const focusedFile = selectedNode?.file || (selectedNode && selectedNode.id.endsWith(".md") ? selectedNode.id : "");
    const ids = new Set<string>();
    for (const node of payload.nodes) {
      if (node.nodeType === "heading") {
        const shown =
          !hidden.has("heading") || node.id === selectedId || (focusedFile !== "" && node.file === focusedFile);
        if (!shown) continue;
      } else if (hidden.has(node.nodeType)) {
        continue;
      }
      if (!showHubs && node.kind === "folder") continue;
      if (!showOrphans && node.kind !== "folder" && !linked.has(node.id) && node.id !== selectedId) continue;
      if (filterId && node.id !== filterId && !node.root && !node.hubs.includes(filterId)) continue;
      ids.add(node.id);
    }
    if (localOn && selectedId) {
      const near = new Set<string>([selectedId]);
      const steps = Math.min(2, Math.max(1, hopDepth));
      for (let hop = 0; hop < steps; hop += 1) {
        for (const edge of payload.edges) {
          if (near.has(edge.from)) near.add(edge.to);
          if (near.has(edge.to)) near.add(edge.from);
        }
      }
      for (const id of ids) {
        if (!near.has(id)) ids.delete(id);
      }
    }
    return ids;
  }, [payload.nodes, payload.edges, hiddenTypes, showHubs, showOrphans, filterId, selectedId, localOn, hopDepth]);
  const selected = payload.nodes.find((node) => node.id === readerId) ?? null;
  const noteLinks: NoteLink[] = selected
    ? payload.edges.flatMap((edge) => {
        const otherId = edge.from === selected.id ? edge.to : edge.to === selected.id ? edge.from : "";
        if (!otherId) return [];
        const other = payload.nodes.find((node) => node.id === otherId);
        if (!other) return [];
        return [{ id: other.id, title: other.title, reason: edge.reason }];
      })
    : [];
  const hubRows = areaHubs(payload.nodes);
  const hubTitles = hubRows.map((row) => row.hub.title);
  const clusterName = payload.nodes.find((node) => node.id === clusterId)?.title ?? "";
  const pathNodes = (route ?? [])
    .map((id, index) => {
      const node = payload.nodes.find((item) => item.id === id);
      return node ? { id, index, title: node.title } : null;
    })
    .filter((item): item is { id: string; index: number; title: string } => Boolean(item));
  const focusKey = `${frameMode}|${selectedId ?? ""}|${clusterId ?? ""}|${filterId ?? ""}|${pathFromId}|${pathToId}|${homeToken}|${hiddenTypes.join(",")}|${showHubs}|${hopDepth}|${showOrphans}`;

  function clearFocus() {
    setSelectedId(null);
    setReaderId(null);
    setClusterId(null);
    setFilterId(null);
    setPathFromId("");
    setPathToId("");
    setFrameMode("fit");
    setHomeToken((token) => token + 1);
  }

  function focusHub(id: string) {
    onInspect();
    setFilterId(null);
    setClusterId(id);
    setSelectedId(id);
    setReaderId(id);
    setPathFromId("");
    setPathToId("");
    setFrameMode("cluster");
    setHomeToken((token) => token + 1);
  }

  function openNote(id: string, shift = false) {
    const node = payload.nodes.find((item) => item.id === id);
    if (!node) return;
    onInspect();
    if (shift && selectedId && selectedId !== id) {
      setPathFromId(selectedId);
      setPathToId(id);
      setClusterId(null);
      setFrameMode("path");
      setHomeToken((token) => token + 1);
      return;
    }
    if (node.kind === "folder") {
      focusHub(node.id);
      return;
    }
    if (selectedId === id) {
      setReaderId(id);
      return;
    }
    setReaderId(id);
    setClusterId(null);
    setPathFromId("");
    setPathToId("");
    setSelectedId(id);
    setFrameMode("node");
    setHomeToken((token) => token + 1);
  }

  useEffect(() => {
    if (readerId) onInspect();
  }, [readerId, onInspect]);

  function onSearch(value: string) {
    setQuery(value);
    const found = matchingNodes(payload.nodes, value);
    if (!value.trim()) {
      clearFocus();
      return;
    }
    const first = found[0];
    if (!first) return;
    setReaderId(first.id);
    setPathFromId("");
    setPathToId("");
    if (first.kind === "folder") {
      setClusterId(first.id);
      setSelectedId(first.id);
      setFrameMode("cluster");
    } else {
      setClusterId(null);
      setSelectedId(first.id);
      setFrameMode(found.length === 1 ? "node" : "matches");
    }
    setHomeToken((token) => token + 1);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setFilterCollapsed(localStorage.getItem("jarvis-filter-collapsed") === "true"); } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setRepel(repelDraft), 160);
    return () => window.clearTimeout(timer);
  }, [repelDraft]);

  useEffect(() => {
    const timer = window.setTimeout(() => setLinkLength(linkDraft), 160);
    return () => window.clearTimeout(timer);
  }, [linkDraft]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("shot") !== "depth") return;
    const timers = [500, 900, 1300].map((delay) =>
      window.setTimeout(() => setZoomCommand((current) => ({ token: current.token + 1, kind: "in" })), delay),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className={selected ? "graph-stage has-note" : "graph-stage"} data-filter-collapsed={filterCollapsed}>
      <aside className={railCollapsed ? "face-column glass is-rail" : "face-column glass"} aria-label="Hubs and display" data-region="left">
        <button
          type="button"
          className="rail-toggle"
          aria-expanded={!railCollapsed}
          aria-label={railCollapsed ? "Expand hubs" : "Collapse hubs"}
          onClick={onToggleRail}
        >
          {railCollapsed ? "›" : "‹ Collapse"}
        </button>
        <label className="face-search" htmlFor="graph-search">
          <span className="sr-only">Search notes</span>
          <input
            id="graph-search"
            value={query}
            autoComplete="off"
            placeholder="Search notes…"
            onChange={(event) => onSearch(event.target.value)}
          />
        </label>
        {loadNotice ? <p className="face-hint" role="status">{loadNotice}</p> : null}
        <p className="face-hint">{graphOpen ? "Click to inspect. Shift-click to trace a path." : "Choose a hub to inspect its notes."}</p>
        <div className="face-block">
          <div className="face-block-head">
            <p>Top Hubs</p>
            <p>Nodes</p>
          </div>
          <ul className="hub-list">
            {hubRows.map((row) => (
              <li key={row.hub.id}>
                <button type="button" data-active={clusterId === row.hub.id ? "true" : "false"} onClick={() => focusHub(row.hub.id)}>
                  <span className="hub-swatch" style={{ background: hubLabelColor(row.hub.title, hubTitles) }} />
                  <span className="hub-name">{row.hub.title}</span>
                  <span className="hub-count">{row.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {graphOpen ? <>
        <div className="face-block">
          <p className="face-block-label">Forces</p>
          <label className="face-slider">
            <span>Repel</span>
            <span>{repelDraft}</span>
            <input
              type="range"
              min={40}
              max={360}
              value={repelDraft}
              aria-label="Repel"
              onChange={(event) => setRepelDraft(Number(event.target.value))}
            />
          </label>
          <label className="face-slider">
            <span>Link length</span>
            <span>{linkDraft}</span>
            <input
              type="range"
              min={40}
              max={420}
              value={linkDraft}
              aria-label="Link length"
              onChange={(event) => setLinkDraft(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="face-block">
          <p className="face-block-label">Display</p>
          <label className="face-check">
            <input type="checkbox" checked={showHubs} onChange={(event) => setShowHubs(event.target.checked)} />
            Hubs
          </label>
          <label className="face-check">
            <input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} />
            Labels
          </label>
          <label className="face-check">
            <input type="checkbox" checked={showEdges} onChange={(event) => setShowEdges(event.target.checked)} />
            Edges
          </label>
          <label className="face-check">
            <input type="checkbox" checked={localOn} onChange={(event) => setLocalOn(event.target.checked)} />
            Local
          </label>
          <label className="face-check">
            <input type="checkbox" checked={autoRotate} onChange={(event) => setAutoRotate(event.target.checked)} />
            Auto-rotate
          </label>
          <label className="face-check">
            <input
              type="checkbox"
              checked={!hiddenTypes.includes("tag")}
              onChange={(event) =>
                setHiddenTypes((current) =>
                  event.target.checked ? current.filter((item) => item !== "tag") : current.includes("tag") ? current : [...current, "tag"],
                )
              }
            />
            Tags
          </label>
          <label className="face-check">
            <input type="checkbox" checked={showOrphans} onChange={(event) => setShowOrphans(event.target.checked)} />
            Orphans
          </label>
          <label className="face-slider">
            <span>Hops</span>
            <span>{hopDepth}</span>
            <input
              type="range"
              min={1}
              max={2}
              step={1}
              value={hopDepth}
              aria-label="Hop depth"
              onChange={(event) => setHopDepth(Number(event.target.value))}
            />
          </label>
        </div>
        <p className="face-totals">
          <span>{payload.noteCount} notes</span>
          <span>{payload.connectionCount} links</span>
        </p>
        </> : null}
        {graphOpen ? (
        <FilterLegend
          collapsed={filterCollapsed}
          onCollapse={() => {
            const next = !filterCollapsed;
            setFilterCollapsed(next);
            try { localStorage.setItem("jarvis-filter-collapsed", String(next)); } catch {}
          }}
          legend={payload.legend}
          hiddenTypes={hiddenTypes}
          onToggle={(type) =>
            setHiddenTypes((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]))
          }
        />
        ) : null}
        {graphOpen ? <p className="graph-orbit-hint">drag = orbit, shift-click = path</p> : null}
        {query.trim() ? (
          <p className="face-hint">{matches.length === 0 ? "No matches." : `${matches.length} match${matches.length === 1 ? "" : "es"}`}</p>
        ) : null}
      </aside>
      {graphOpen && clusterId ? (
        <button type="button" className="graph-crumb" onClick={clearFocus}>
          GRAPH / {clusterName.toUpperCase()}
        </button>
      ) : null}
      {inspectorHost ? createPortal(selected ? (
        <NoteReader
          docked
          node={selected}
          links={noteLinks}
          path={pathNodes}
          members={
            selected.file
              ? []
              : payload.nodes
                  .filter((node) => node.hubs.includes(selected.id) && node.id.endsWith(".md") && !node.root)
                  .map((node) => ({ id: node.id, title: node.title }))
          }
          onBack={clearFocus}
          onOpen={(id) => openNote(id)}
        />
      ) : (
        <aside className="graph-inspector is-docked inspector-empty" aria-label="Inspector">
          <p className="face-block-label">No node selected</p>
          <p className="face-hint">{loadNotice || "Choose a hub or click a node to explore its notes and connections."}</p>
          {payload.nodes.length === 0 ? <p className="face-hint">0 notes · 0 connections</p> : null}
        </aside>
      ), inspectorHost) : null}
      {graphOpen && payload.status === "ready" ? <div className="graph-canvas">
        <ForceScene
          nodes={payload.nodes}
          edges={payload.edges}
          points={points}
          visibleIds={visibleIds}
          selectedId={selectedId}
          clusterId={clusterId}
          route={route}
          showLabels={showLabels}
          showEdges={showEdges}
          hopDepth={hopDepth}
          autoRotate={autoRotate}
          padRight={filterCollapsed ? 48 : 260}
          focusKey={focusKey}
          zoomToken={zoomCommand.token}
          zoomKind={zoomCommand.kind}
          onSelect={openNote}
          onClear={clearFocus}
        />
      </div> : null}
    </div>
  );
}

function FilterLegend({
  collapsed,
  onCollapse,
  legend,
  hiddenTypes,
  onToggle,
}: {
  collapsed: boolean;
  onCollapse: () => void;
  legend: GraphLegendEntry[];
  hiddenTypes: GraphNodeType[];
  onToggle: (type: GraphNodeType) => void;
}) {
  const total = legend.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <aside className={collapsed ? "face-filter glass is-collapsed" : "face-filter glass"} aria-label="Filter" data-region="filter">
      <button type="button" className="filter-toggle" aria-label={collapsed ? "Expand filter" : "Collapse filter"} aria-expanded={!collapsed} onClick={onCollapse}>{collapsed ? "Filter ›" : "Filter ‹"}</button>
      {!collapsed ? <><div className="face-block-head">
        <p>Types</p>
        <p>{total}</p>
      </div>
      <ul className="filter-list">
        {legend.map((entry) => {
          const hidden = hiddenTypes.includes(entry.type);
          return (
            <li key={entry.type}>
              <button type="button" data-hidden={hidden ? "true" : "false"} onClick={() => onToggle(entry.type)}>
                <span className="hub-swatch" style={{ background: entry.color }} />
                <span>{entry.label}</span>
                <span className="hub-count">{entry.count}</span>
              </button>
            </li>
          );
        })}
      </ul></> : null}
    </aside>
  );
}
