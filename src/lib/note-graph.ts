export const MAX_GRAPH_NODES = 600;
const MAX_GRAPH_EDGES = 2500;
const EXCERPT_LIMIT = 320;
const TEXT_LIMIT = 12_000;

export type GraphReason = "wikilink" | "tag" | "folder";

export type GraphStatus = "ready" | "not-wired" | "missing" | "empty";

export type GraphNodeKind = "note" | "folder";

export type GraphNodeType = "note" | "hub" | "person" | "link" | "file" | "journal" | "decision";

export type GraphLegendEntry = {
  type: GraphNodeType;
  label: string;
  color: string;
  count: number;
};

export const GRAPH_NODE_TYPES: readonly { type: GraphNodeType; label: string; color: string }[] = [
  { type: "note", label: "Markdown note", color: "#3DDC97" },
  { type: "hub", label: "Tag / hub", color: "#C084FC" },
  { type: "person", label: "Person", color: "#F5C451" },
  { type: "link", label: "Link / URL", color: "#6AA6FF" },
  { type: "file", label: "File / attachment", color: "#C6E05A" },
  { type: "journal", label: "Journal entry", color: "#FF6BB5" },
  { type: "decision", label: "Decision", color: "#FF7A45" },
];

const TOP_HUB_NAMES = new Set(["school", "swim", "jarvis", "people", "journal", "decisions", "unsorted"]);

const NODE_DIAMETER = { hub: 22, sub: 16, ssot: 14, note: 12 } as const;

export type GraphNode = {
  id: string;
  title: string;
  folder: string;
  tags: string[];
  excerpt: string;
  text: string;
  kind: GraphNodeKind;
  nodeType: GraphNodeType;
  ssot: boolean;
  hubs: string[];
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  reason: GraphReason;
};

export type NoteGraphPayload = {
  status: GraphStatus;
  detail: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  noteCount: number;
  connectionCount: number;
  hiddenCount: number;
  capped: boolean;
  legend: GraphLegendEntry[];
};

export type NoteSourceFile = {
  path: string;
  text: string;
};

function blank(status: GraphStatus, detail: string): NoteGraphPayload {
  return {
    status,
    detail,
    nodes: [],
    edges: [],
    noteCount: 0,
    connectionCount: 0,
    hiddenCount: 0,
    capped: false,
    legend: [],
  };
}

export function tagHubId(tag: string): string {
  return `tag:${tag}`;
}

export function folderHubId(folder: string): string {
  return folder ? `folder:${folder}` : "folder:";
}

export function nodeColor(type: GraphNodeType): string {
  return GRAPH_NODE_TYPES.find((entry) => entry.type === type)?.color ?? "#3DDC97";
}

const HUB_LABEL_COLORS: Record<string, string> = {
  school: "#49D4FF",
  swim: "#6AA6FF",
  jarvis: "#8EE7FF",
  people: "#F5C451",
  journal: "#FF6BB5",
  decisions: "#FF7A45",
  unsorted: "#6FA9BF",
};

const HUB_EXTRA_COLORS = ["#C6E05A", "#C084FC", "#3DDC97"];

/** Stable color for a Top Hubs row and its label. Not a Filter swatch. */
export function hubLabelColor(title: string, allTitles: readonly string[]): string {
  const key = title.trim().toLowerCase();
  const named = HUB_LABEL_COLORS[key];
  if (named) return named;
  const extras = allTitles
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item && !HUB_LABEL_COLORS[item])
    .sort();
  const index = Math.max(0, extras.indexOf(key));
  return HUB_EXTRA_COLORS[index % HUB_EXTRA_COLORS.length] ?? "#C6E05A";
}

export function nodeTypeLabel(type: GraphNodeType): string {
  return GRAPH_NODE_TYPES.find((entry) => entry.type === type)?.label ?? "Markdown note";
}

export function sizeTier(node: Pick<GraphNode, "kind" | "nodeType" | "ssot" | "title">): keyof typeof NODE_DIAMETER {
  if (node.kind === "folder" || node.nodeType === "hub") {
    return TOP_HUB_NAMES.has(node.title.trim().toLowerCase()) ? "hub" : "sub";
  }
  if (node.ssot) return "ssot";
  return "note";
}

/** Screen diameter at the default Fit zoom. Never under 10px. */
export function nodeDiameterPx(node: Pick<GraphNode, "kind" | "nodeType" | "ssot" | "title">): number {
  return Math.max(10, NODE_DIAMETER[sizeTier(node)]);
}

export function legendFromNodes(nodes: Pick<GraphNode, "nodeType">[]): GraphLegendEntry[] {
  const counts = new Map<GraphNodeType, number>();
  for (const node of nodes) counts.set(node.nodeType, (counts.get(node.nodeType) ?? 0) + 1);
  return GRAPH_NODE_TYPES.flatMap((entry) => {
    const count = counts.get(entry.type) ?? 0;
    if (count <= 0) return [];
    return [{ type: entry.type, label: entry.label, color: entry.color, count }];
  });
}

function frontmatterValue(front: string, key: string): string {
  const match = front.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)\\s*$`, "im"));
  if (!match?.[1]) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "").toLowerCase();
}

function frontmatterFlag(front: string, key: string): boolean {
  const value = frontmatterValue(front, key);
  return value === "true" || value === "yes";
}

export function classifyNote(input: {
  path: string;
  folder: string;
  tags: string[];
  frontType: string;
  kind: GraphNodeKind;
}): GraphNodeType {
  if (input.kind === "folder") return "hub";
  const type = input.frontType;
  const tags = new Set(input.tags.map((tag) => tag.toLowerCase()));
  const folder = input.folder.toLowerCase();
  const base = input.path.split("/").pop()?.toLowerCase() ?? "";
  if (
    type === "journal" ||
    folder === "journal" ||
    folder.startsWith("journal/") ||
    tags.has("journal") ||
    tags.has("diary")
  ) {
    return "journal";
  }
  if (type === "decision" || tags.has("decision") || tags.has("decisions") || base === "decisions.md") return "decision";
  if (type === "person" || type === "people" || tags.has("person") || tags.has("people") || base === "people.md") {
    return "person";
  }
  if (type === "file" || type === "attachment" || tags.has("file") || tags.has("attachment")) return "file";
  if (type === "link" || type === "url" || tags.has("link") || tags.has("url")) return "link";
  if (base.length > 0 && !base.endsWith(".md")) return "file";
  return "note";
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, "/").replace(/\.md$/i, "");
}

// Vault ids are posix. String helpers keep this file free of node:path so the client graph can import it.
function posixDirname(value: string): string {
  let end = value.length;
  while (end > 1 && value.charCodeAt(end - 1) === 47) end -= 1;
  const slash = value.lastIndexOf("/", end - 1);
  if (slash < 0) return ".";
  if (slash === 0) return "/";
  return value.slice(0, slash);
}

function posixBasename(value: string, suffix = ""): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  const slash = value.lastIndexOf("/", end - 1);
  const start = slash === -1 ? 0 : slash + 1;
  if (suffix.length > 0 && end - start > suffix.length && value.slice(end - suffix.length, end) === suffix) {
    end -= suffix.length;
  }
  return value.slice(start, end);
}

function posixExtname(value: string): string {
  const base = posixBasename(value);
  if (base === "." || base === ".." || !base.includes(".")) return "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot);
}

function titleFrom(filePath: string, body: string): string {
  const heading = body.match(/^#\s+(.+)$/m);
  if (heading?.[1]) return heading[1].trim();
  return posixBasename(filePath, posixExtname(filePath)).replace(/[-_]/g, " ");
}

function splitFrontmatter(text: string): { front: string; body: string } {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (!source.startsWith("---")) return { front: "", body: source };
  const end = source.indexOf("\n---", 3);
  if (end === -1) return { front: "", body: source };
  return { front: source.slice(3, end), body: source.slice(end + 4) };
}

function cleanTag(value: string): string {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/^#/, "")
    .replace(/^-\s*/, "")
    .toLowerCase();
}

function tagsFromFrontmatter(front: string): string[] {
  const tags: string[] = [];
  const bracket = front.match(/^\s*tags?\s*:\s*\[([^\]]*)\]/im);
  if (bracket?.[1]) {
    for (const part of bracket[1].split(",")) {
      const tag = cleanTag(part);
      if (tag) tags.push(tag);
    }
  }
  const one = front.match(/^\s*tags?\s*:\s*([^[\n]+)$/im);
  if (one?.[1]) {
    for (const part of one[1].split(",")) {
      const tag = cleanTag(part);
      if (tag) tags.push(tag);
    }
  }
  if (/^\s*tags?\s*:\s*$/im.test(front)) {
    let inTags = false;
    for (const line of front.split(/\r?\n/)) {
      if (/^\s*tags?\s*:/.test(line)) {
        inTags = true;
        continue;
      }
      if (!inTags) continue;
      const item = line.match(/^\s*-\s*(.+)$/);
      if (!item?.[1]) break;
      const tag = cleanTag(item[1]);
      if (tag) tags.push(tag);
    }
  }
  return tags;
}

function tagsFromBody(body: string): string[] {
  const tags: string[] = [];
  for (const match of body.matchAll(/(^|\s)#([A-Za-z][\w/-]*)/g)) {
    const tag = match[2]?.toLowerCase();
    if (tag) tags.push(tag);
  }
  return tags;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function excerptFrom(body: string): string {
  const chosen = body.replace(/\s+/g, " ").trim();
  if (chosen.length <= EXCERPT_LIMIT) return chosen;
  return `${chosen.slice(0, EXCERPT_LIMIT).trim()}…`;
}

function noteText(body: string): string {
  if (body.length <= TEXT_LIMIT) return body;
  return body.slice(0, TEXT_LIMIT);
}

function findNote(target: string, notes: GraphNode[]): GraphNode | undefined {
  const key = norm(target);
  return (
    notes.find((note) => norm(note.id) === key) ??
    notes.find((note) => norm(posixBasename(note.id, ".md")) === key) ??
    notes.find((note) => norm(note.title) === key)
  );
}

export function buildNoteGraph(files: NoteSourceFile[]): NoteGraphPayload {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const kept = sorted.slice(0, MAX_GRAPH_NODES);
  const hiddenCount = sorted.length - kept.length;
  const nodes: GraphNode[] = kept.map((file) => {
    const posix = file.path.replace(/\\/g, "/");
    const { front, body } = splitFrontmatter(file.text);
    const folder = posixDirname(posix);
    const cleanFolder = folder === "." ? "" : folder;
    const tags = unique([...tagsFromFrontmatter(front), ...tagsFromBody(body)]);
    return {
      id: posix,
      title: titleFrom(posix, body),
      folder: cleanFolder,
      tags,
      excerpt: excerptFrom(body),
      text: noteText(body),
      kind: "note",
      nodeType: classifyNote({
        path: posix,
        folder: cleanFolder,
        tags,
        frontType: frontmatterValue(front, "type"),
        kind: "note",
      }),
      ssot: frontmatterFlag(front, "ssot"),
      hubs: tags.map((tag) => tagHubId(tag)),
    };
  });

  if (nodes.length === 0) {
    return blank("empty", "The vault folder has no notes yet. Nothing was invented.");
  }

  const byId = new Map(nodes.map((note) => [norm(note.id), note]));
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  let capped = hiddenCount > 0;

  function addEdge(a: string, b: string, reason: GraphReason) {
    if (a === b || edges.length >= MAX_GRAPH_EDGES) {
      if (edges.length >= MAX_GRAPH_EDGES) capped = true;
      return;
    }
    const [from, to] = a < b ? [a, b] : [b, a];
    const id = `${reason}:${from}:${to}`;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ id, from, to, reason });
  }

  for (const file of kept) {
    const source = byId.get(norm(file.path.replace(/\\/g, "/")));
    if (!source) continue;
    const { body } = splitFrontmatter(file.text);
    for (const match of body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) {
      const target = match[1]?.trim();
      if (!target) continue;
      const hit = findNote(target, nodes);
      if (hit) addEdge(source.id, hit.id, "wikilink");
    }
  }

  const tagHubs = new Map<string, GraphNode>();
  for (const note of nodes) {
    for (const tag of note.tags) {
      if (!tagHubs.has(tag)) tagHubs.set(tag, tagHub(tag));
      addEdge(note.id, tagHubId(tag), "tag");
    }
  }

  for (const note of nodes) {
    if (!note.folder) continue;
    const candidates = [
      `${note.folder}.md`,
      `${note.folder}/index.md`,
      `${note.folder}/${posixBasename(note.folder)}.md`,
    ];
    for (const candidate of candidates) {
      const parent = byId.get(norm(candidate));
      if (parent && parent.id !== note.id) {
        addEdge(note.id, parent.id, "folder");
        break;
      }
    }
  }

  const folderHubs = linkLooseFolderNotes(nodes, edges, addEdge);
  for (const note of nodes) {
    if (note.kind !== "note" || note.hubs.length > 0) continue;
    const hub = folderHubs.get(note.folder);
    if (hub) note.hubs = [hub.id];
  }
  const noteCount = nodes.length;
  for (const hub of folderHubs.values()) nodes.push(hub);
  for (const hub of tagHubs.values()) nodes.push(hub);

  const detail = capped
    ? "Some notes were left out so this stays light on an older computer."
    : "These notes were read from the vault folder.";

  return {
    status: "ready",
    detail,
    nodes,
    edges,
    noteCount,
    connectionCount: edges.length,
    hiddenCount,
    capped,
    legend: legendFromNodes(nodes),
  };
}

function tagHub(tag: string): GraphNode {
  const title = tag.slice(0, 1).toUpperCase() + tag.slice(1);
  const excerpt = `Tag ${tag}. Notes with this tag cluster here. It is not a separate note.`;
  return {
    id: tagHubId(tag),
    title,
    folder: "",
    tags: [tag],
    excerpt,
    text: excerpt,
    kind: "folder",
    nodeType: "hub",
    ssot: false,
    hubs: [],
  };
}

function linkLooseFolderNotes(
  nodes: GraphNode[],
  edges: GraphEdge[],
  addEdge: (a: string, b: string, reason: GraphReason) => void,
): Map<string, GraphNode> {
  const folderTouch = new Set<string>();
  for (const edge of edges) {
    if (edge.reason !== "folder") continue;
    folderTouch.add(edge.from);
    folderTouch.add(edge.to);
  }

  const folderHubs = new Map<string, GraphNode>();
  const pendingByFolder = new Map<string, GraphNode[]>();
  for (const note of nodes) {
    if (note.kind !== "note" || folderTouch.has(note.id) || note.tags.length > 0) continue;
    const group = pendingByFolder.get(note.folder) ?? [];
    group.push(note);
    pendingByFolder.set(note.folder, group);
  }

  for (const [folder, group] of pendingByFolder) {
    const anchor = nodes.find((note) => note.folder === folder && folderTouch.has(note.id));
    if (anchor) {
      for (const note of group) addEdge(note.id, anchor.id, "folder");
      continue;
    }
    const hub = folderHub(folder);
    folderHubs.set(folder, hub);
    for (const note of group) addEdge(note.id, hub.id, "folder");
  }

  for (const [folder, hub] of folderHubs) {
    if (!folder) continue;
    const parentHub = folderHubs.get(hub.folder);
    if (parentHub) {
      addEdge(hub.id, parentHub.id, "folder");
      continue;
    }
    const parentNote = nodes.find((note) => note.folder === hub.folder && folderTouch.has(note.id));
    if (parentNote) addEdge(hub.id, parentNote.id, "folder");
  }

  return folderHubs;
}

function folderHub(folder: string): GraphNode {
  const parent = folder.includes("/") ? posixDirname(folder) : "";
  const excerpt = folder
    ? `Folder ${folder}. Notes inside it use this as their parent. It is not a note.`
    : "Top of the vault. Notes in this folder connect here. It is not a note.";
  return {
    id: folderHubId(folder),
    title: folder ? posixBasename(folder) : "Unsorted",
    folder: folder ? parent : "",
    tags: [],
    excerpt,
    text: excerpt,
    kind: "folder",
    nodeType: "hub",
    ssot: false,
    hubs: [],
  };
}
