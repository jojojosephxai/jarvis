"use client";

import type { ReactNode } from "react";

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

type ExcerptBlock = { kind: "h" | "p"; text: string } | { kind: "ul"; items: string[] };

function tidyInline(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?]]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownExcerpt(node: GraphNode): { blocks: ExcerptBlock[]; truncated: boolean } {
  const raw = node.text || node.excerpt || "";
  const body = raw.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\s*/, "");
  const blocks: ExcerptBlock[] = [];
  let skippedTitle = false;
  let chars = 0;
  let list: string[] = [];
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({ kind: "ul", items: list });
    list = [];
  };
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "---") {
      flushList();
      continue;
    }
    if (!skippedTitle && /^#\s+/.test(line)) {
      skippedTitle = true;
      continue;
    }
    if (chars > 360 || blocks.length >= 5) {
      flushList();
      return { blocks, truncated: true };
    }
    const heading = /^#{2,3}\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const text = tidyInline(heading[1] ?? "");
      if (!text) continue;
      chars += text.length;
      blocks.push({ kind: "h", text });
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) {
      const text = tidyInline(item[1] ?? "");
      if (!text) continue;
      chars += text.length;
      list.push(text);
      continue;
    }
    flushList();
    const text = tidyInline(line.replace(/^#{1,6}\s+/, ""));
    if (!text) continue;
    chars += text.length;
    blocks.push({ kind: "p", text });
  }
  flushList();
  return { blocks, truncated: false };
}

function inlineBits(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
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
  const excerpt = markdownExcerpt(node);
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
      {excerpt.blocks.length > 0 ? (
        <div className="inspector-body">
          {excerpt.blocks.map((block, index) => {
            switch (block.kind) {
              case "h":
                return <h4 key={index}>{inlineBits(block.text)}</h4>;
              case "ul":
                return (
                  <ul key={index}>
                    {block.items.map((item) => (
                      <li key={item}>{inlineBits(item)}</li>
                    ))}
                  </ul>
                );
              case "p":
                return <p key={index}>{inlineBits(block.text)}</p>;
              default: {
                const neverBlock: never = block;
                return neverBlock;
              }
            }
          })}
          {excerpt.truncated ? <p className="inspector-more">…</p> : null}
        </div>
      ) : null}
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
