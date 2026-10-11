"use client";

import { nodeColor, nodeTypeLabel, type GraphEdge, type GraphNode } from "@/lib/note-graph";

export type NoteLink = {
  id: string;
  title: string;
  reason: GraphEdge["reason"];
};

function reasonLabel(reason: GraphEdge["reason"]): string {
  switch (reason) {
    case "wikilink":
      return "Link";
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

export function NoteReader({
  node,
  links,
  onBack,
  onOpen,
}: {
  node: GraphNode;
  links: NoteLink[];
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const body = (node.text || node.excerpt).trim();
  const color = nodeColor(node.nodeType);
  return (
    <aside className="graph-inspector" aria-label="Note">
      <div className="inspector-head">
        <p className="inspector-kicker inspector-type">
          <span className="inspector-type-dot" style={{ background: color }} />
          {nodeTypeLabel(node.nodeType)}
        </p>
        <button type="button" className="inspector-back" onClick={onBack}>
          Back
        </button>
      </div>
      <div className="inspector-stack">
        <h3 className="inspector-title">{node.title}</h3>
        {node.tags.length > 0 ? (
          <div className="inspector-chips">
            {node.tags.map((tag) => (
              <span key={tag} className="inspector-chip">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <div className="inspector-block">
          <h4>Path</h4>
          <p className="inspector-path">{node.id}</p>
        </div>
        <div className="inspector-block">
          <h4>Inside</h4>
          <p className="inspector-body">{body || "This dot has no written text."}</p>
        </div>
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
                    <span className="inspector-reason" data-reason={link.reason}>
                      {reasonLabel(link.reason)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="inspector-foot">Click empty space or press Escape to leave this note.</p>
      </div>
    </aside>
  );
}
