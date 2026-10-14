import type { GraphNode } from "./note-graph";

export type InspectorMember = {
  id: string;
  title: string;
};

export type InspectorDocument =
  | { kind: "note"; path: string; heading: string; markdown: string }
  | { kind: "members"; title: string; members: InspectorMember[] };

export type MarkdownBlock =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "code"; text: string };

function stripFrontmatter(source: string): string {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return text;
  return text.slice(end + 4);
}

/** The markdown the Inspector should show for this node. */
export function inspectorDocument(
  node: GraphNode,
  nodes: readonly GraphNode[],
  markdownByPath: ReadonlyMap<string, string>,
): InspectorDocument {
  const file = node.file.trim();
  const saved = file ? markdownByPath.get(file) : undefined;
  if (file && (saved !== undefined || node.anchor || node.root || node.id.endsWith(".md"))) {
    return {
      kind: "note",
      path: file,
      heading: node.anchor,
      markdown: saved ?? node.text,
    };
  }
  if (node.kind === "folder" || node.nodeType === "hub" || node.nodeType === "tag") {
    const members = nodes
      .filter((item) => item.hubs.includes(node.id) && item.id.endsWith(".md") && !item.root)
      .map((item) => ({ id: item.id, title: item.title }))
      .sort((a, b) => a.title.localeCompare(b.title));
    return { kind: "members", title: node.title, members };
  }
  return {
    kind: "note",
    path: file || node.id,
    heading: node.anchor,
    markdown: node.text,
  };
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const body = stripFrontmatter(source).replace(/\r\n/g, "\n");
  const blocks: MarkdownBlock[] = [];
  const lines = body.split("\n");
  let list: string[] = [];
  let code: string[] | null = null;
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({ kind: "ul", items: list });
    list = [];
  };
  for (const line of lines) {
    if (code) {
      if (line.trim().startsWith("```")) {
        blocks.push({ kind: "code", text: code.join("\n") });
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    if (line.trim().startsWith("```")) {
      flushList();
      code = [];
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushList();
      const text = heading[2]?.trim() ?? "";
      if (text) blocks.push({ kind: "h", level: heading[1]?.length ?? 1, text });
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(trimmed);
    if (item) {
      const text = item[1]?.trim() ?? "";
      if (text) list.push(text);
      continue;
    }
    flushList();
    blocks.push({ kind: "p", text: trimmed });
  }
  flushList();
  if (code && code.length > 0) blocks.push({ kind: "code", text: code.join("\n") });
  return blocks;
}
