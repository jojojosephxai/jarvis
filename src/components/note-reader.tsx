"use client";

import { nodeColor, nodeTypeLabel, type GraphEdge, type GraphNode } from "@/lib/note-graph";

export type NoteLink = {
  id: string;
  title: string;
  reason: GraphEdge["reason"];
};

export type PathStep = {
  id: string;
  index: number;
  title: string;
};

function excerptLines(node: GraphNode): string {
  const raw = node.text || "";
  const withoutFront = raw.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\s*/, "");
  const kept: string[] = [];
  let skippedTitle = false;
  for (const rawLine of withoutFront.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "---") continue;
    if (!skippedTitle && /^#{1,6}\s+/.test(line)) {
      skippedTitle = true;
      continue;
    }
    kept.push(line);
    if (kept.length === 6) break;
  }
  return kept.join("\n");
}

export function NoteReader({
  node,
  links,
  path,
  onBack,
  onOpen,
  docked = false,
}: {
  node: GraphNode;
  links: NoteLink[];
  path: PathStep[];
  onBack: () => void;
  onOpen: (id: string) => void;
  docked?: boolean;
}) {
  const color = nodeColor(node.nodeType);
  const excerpt = excerptLines(node);
  const tracing = path.length > 1;
  return (
    <aside className={docked ? "graph-inspector is-docked" : "graph-inspector glass"} aria-label="Inspector">
      <div className="inspector-head">
        <p className="inspector-kicker">Inspector</p>
        <button type="button" className="inspector-back" onClick={onBack}>
          Close
        </button>
      </div>
      <p className="inspector-type">
        <span className="inspector-type-dot" style={{ background: color }} />
        {nodeTypeLabel(node.nodeType)}
      </p>
      <h3 className="inspector-title">{node.title}</h3>
      <p className="inspector-path">{node.id}</p>
      {excerpt ? <p className="inspector-body">{excerpt}</p> : null}
      {tracing ? (
        <div className="inspector-block">
          <h4>Path</h4>
          <ol className="inspector-links">
            {path.map((step) => (
              <li key={step.id}>
                <button type="button" onClick={() => onOpen(step.id)}>
                  <span>
                    {step.index + 1}. {step.title}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {links.length > 0 ? (
        <div className="inspector-block">
          <h4>
            Connections <span>{links.length}</span>
          </h4>
          <ul className="inspector-links">
            {links.map((link) => (
              <li key={`${link.reason}:${link.id}`}>
                <button type="button" onClick={() => onOpen(link.id)}>
                  <span>{link.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="inspector-foot">Shift-click another note to trace the path.</p>
    </aside>
  );
}
