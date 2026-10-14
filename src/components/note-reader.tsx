"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { safeHttpUrl } from "@/lib/http-url";
import { parseMarkdown, type MarkdownBlock } from "@/lib/note-inspector";
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

function inlineBits(text: string, links: NoteLink[], onOpen: (id: string) => void): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\[\[[^\]]+\]\])/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const href = safeHttpUrl(link[2] ?? "");
      if (!href) return link[1];
      return (
        <a key={index} href={href} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    }
    const wiki = /^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]$/.exec(part);
    if (wiki) {
      const target = (wiki[1] ?? "").trim().toLowerCase();
      const label = (wiki[2] ?? wiki[1] ?? "").trim();
      const hit = links.find((item) => item.title.toLowerCase() === target || item.id.toLowerCase().startsWith(target));
      if (!hit) return label;
      return (
        <button key={index} type="button" onClick={() => onOpen(hit.id)}>
          {label}
        </button>
      );
    }
    return part;
  });
}

function MarkdownBody({
  markdown,
  heading,
  links,
  onOpen,
}: {
  markdown: string;
  heading: string;
  links: NoteLink[];
  onOpen: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const blocks = parseMarkdown(markdown);
  useEffect(() => {
    if (!heading || !ref.current) return;
    const target = [...ref.current.querySelectorAll("[data-heading]")].find(
      (node) => node.getAttribute("data-heading")?.toLowerCase() === heading.toLowerCase(),
    );
    target?.scrollIntoView({ block: "start" });
  }, [heading, markdown]);
  return (
    <div className="inspector-body" ref={ref}>
      {blocks.map((block, index) => renderBlock(block, index, links, onOpen))}
    </div>
  );
}

function renderBlock(block: MarkdownBlock, index: number, links: NoteLink[], onOpen: (id: string) => void): ReactNode {
  switch (block.kind) {
    case "h":
      return (
        <h4 key={index} data-heading={block.text}>
          {inlineBits(block.text, links, onOpen)}
        </h4>
      );
    case "ul":
      return (
        <ul key={index}>
          {block.items.map((item) => (
            <li key={item}>{inlineBits(item, links, onOpen)}</li>
          ))}
        </ul>
      );
    case "code":
      return (
        <pre key={index}>
          <code>{block.text}</code>
        </pre>
      );
    case "p":
      return <p key={index}>{inlineBits(block.text, links, onOpen)}</p>;
    default: {
      const neverBlock: never = block;
      return neverBlock;
    }
  }
}

export function NoteReader({
  node,
  links,
  path,
  onBack,
  onOpen,
  members = [],
  docked = false,
}: {
  node: GraphNode;
  links: NoteLink[];
  path: PathStep[];
  onBack: () => void;
  onOpen: (id: string) => void;
  members?: { id: string; title: string }[];
  docked?: boolean;
}) {
  const color = nodeColor(node.nodeType);
  const [markdown, setMarkdown] = useState(node.file ? "" : node.text);
  const [missing, setMissing] = useState(false);
  const tracing = path.length > 1;
  useEffect(() => {
    if (!node.file) {
      setMarkdown(node.text);
      setMissing(false);
      return;
    }
    let cancelled = false;
    setMissing(false);
    fetch(`/api/note?path=${encodeURIComponent(node.file)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("missing"))))
      .then((body: unknown) => {
        if (cancelled) return;
        const text = body && typeof body === "object" ? (body as { markdown?: unknown }).markdown : "";
        if (typeof text !== "string") {
          setMissing(true);
          return;
        }
        setMarkdown(text);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [node.file, node.id, node.text]);
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
      {members.length > 0 && !node.file ? (
        <div className="inspector-block">
          <h4>
            Notes <span>{members.length}</span>
          </h4>
          <ul className="inspector-links">
            {members.map((member) => (
              <li key={member.id}>
                <button type="button" onClick={() => onOpen(member.id)}>
                  <span>{member.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {missing ? <p className="inspector-body">That note is not in the vault.</p> : null}
      {!missing && markdown.trim() && (node.file || members.length === 0) ? (
        <MarkdownBody markdown={markdown} heading={node.anchor} links={links} onOpen={onOpen} />
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
