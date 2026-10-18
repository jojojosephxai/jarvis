export const MAX_GRAPH_NODES = 600;
const MAX_GRAPH_EDGES = 2500;
const EXCERPT_LIMIT = 320;
const TEXT_LIMIT = 12_000;

export type GraphReason = "wikilink" | "tag" | "folder" | "heading" | "file";

export type GraphStatus = "ready" | "not-wired" | "missing" | "empty";

export type GraphNodeKind = "note" | "folder";

export type GraphNodeType =
  | "note"
  | "heading"
  | "hub"
  | "tag"
  | "person"
  | "link"
  | "file"
  | "journal"
  | "decision"
  | "project";

export type GraphLegendEntry = {
  type: GraphNodeType;
  label: string;
  color: string;
  count: number;
};

export const GRAPH_NODE_TYPES: readonly { type: GraphNodeType; label: string; color: string }[] = [
  { type: "note", label: "Markdown note", color: "#3DDC97" },
  { type: "heading", label: "Heading", color: "#8EB4FF" },
  { type: "hub", label: "Tag / hub", color: "#C084FC" },
  { type: "tag", label: "Tag", color: "#D6B4FF" },
  { type: "person", label: "Person", color: "#F5C451" },
  { type: "link", label: "Link / URL", color: "#6AA6FF" },
  { type: "file", label: "File / attachment", color: "#C6E05A" },
  { type: "journal", label: "Journal entry", color: "#FF6BB5" },
  { type: "decision", label: "Decision", color: "#FF7A45" },
  { type: "project", label: "Project", color: "#FFB347" },
];

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
  /** The one center note. Area hubs link to it. */
  root: boolean;
  /** Vault file this node opens, when it has one. */
  file: string;
  /** Heading to scroll to inside `file`. */
  anchor: string;
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

/** Screen diameter at the default Fit zoom. Hubs scale 12–16px, leaves 5–7px. */
export function nodeDiameterPx(
  node: Pick<GraphNode, "kind" | "nodeType" | "ssot" | "title"> & { root?: boolean },
  degree = 0,
): number {
  const links = Math.max(0, degree);
  if (node.root) return 16;
  if (node.kind === "folder" || node.nodeType === "hub") {
    const span = Math.min(1, links / 12);
    return Math.round(12 + span * 4);
  }
  const span = Math.min(1, links / 6);
  return Math.round(5 + span * 2);
}

export function chooseRootPath(paths: readonly string[]): string {
  let best = "";
  let rank = 0;
  for (const value of paths) {
    const posix = value.replace(/\\/g, "/");
    const base = posixBasename(posix, ".md").toLowerCase();
    const score = base === "about" ? 2 : base === "index" ? 1 : 0;
    if (score > rank) {
      rank = score;
      best = posix;
    }
  }
  return best;
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
  if (
    type === "project" ||
    tags.has("project") ||
    tags.has("projects") ||
    tags.has("goals") ||
    base === "projects.md" ||
    base === "goals.md"
  ) {
    return "project";
  }
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

const AREAS: { id: string; title: string; keys: string[] }[] = [
  { id: "area:school", title: "School", keys: ["school"] },
  { id: "area:swim", title: "Swim", keys: ["swim"] },
  { id: "area:jarvis", title: "Jarvis", keys: ["jarvis", "voice", "tech"] },
  { id: "area:health", title: "Health", keys: ["health", "routines", "sleep", "recovery", "energy"] },
  { id: "area:people", title: "People", keys: ["people", "family", "person"] },
  { id: "area:journal", title: "Journal", keys: ["journal", "diary"] },
  { id: "area:projects", title: "Projects", keys: ["projects", "goals", "project"] },
  { id: "area:me", title: "Me", keys: ["me", "about", "identity", "joseph", "preferences", "interests", "fun", "decisions", "background"] },
];

const AREA_KEYS = new Set(AREAS.flatMap((area) => area.keys));

function areaByKey(value: string): (typeof AREAS)[number] | undefined {
  const key = value.trim().toLowerCase().replace(/\.md$/i, "");
  return AREAS.find((area) => area.keys.includes(key));
}

function areaFor(note: Pick<GraphNode, "id" | "title" | "folder" | "tags">): (typeof AREAS)[number] {
  const top = note.folder.split("/")[0]?.toLowerCase() ?? "";
  const fallback = AREAS.find((area) => area.id === "area:me") ?? AREAS[0];
  if (!fallback) return { id: "area:me", title: "Me", keys: ["me"] };
  if (top === "journal") return AREAS.find((area) => area.id === "area:journal") ?? fallback;
  if (top === "jarvis") return AREAS.find((area) => area.id === "area:jarvis") ?? fallback;
  const stem = posixBasename(note.id, ".md");
  return areaByKey(stem) ?? areaByKey(note.title) ?? note.tags.map(areaByKey).find(Boolean) ?? fallback;
}

/** Lowercase letters and digits only, so "Swim" and "swim" count as one name. */
export function hubNameKey(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isHiddenGraphFile(path: string, title: string): boolean {
  const base = posixBasename(path, ".md").toLowerCase();
  if (base === "index" || base === "help" || base === "readme" || base === "00-readme") return true;
  const name = title.trim().toLowerCase();
  return name === "index" || name === "help";
}

export function areaHubs(nodes: GraphNode[]): { hub: GraphNode; count: number }[] {
  return nodes
    .filter((node) => node.kind === "folder")
    .map((hub) => ({
      hub,
      count: nodes.filter((node) => node.hubs.includes(hub.id)).length,
    }))
    .filter((row) => row.count > 0 || row.hub.file !== "")
    .sort((a, b) => b.count - a.count || a.hub.title.localeCompare(b.hub.title));
}

function headingsIn(body: string, title: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(/^#{2,3}\s+(.+)$/gm)) {
    const text = (match[1] ?? "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || text.toLowerCase() === title.trim().toLowerCase()) continue;
    found.push(text);
    if (found.length === 6) break;
  }
  return found;
}

function attachmentsIn(body: string): { href: string; kind: "file" | "link" }[] {
  const found: { href: string; kind: "file" | "link" }[] = [];
  for (const match of body.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const href = match[1]?.trim() ?? "";
    if (!href || href.startsWith("#")) continue;
    if (/^https?:/i.test(href)) found.push({ href, kind: "link" });
    else if (/\.(png|jpe?g|gif|webp|pdf|txt|csv|mp3|mp4|wav)$/i.test(href)) found.push({ href, kind: "file" });
    if (found.length === 4) break;
  }
  return found;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function buildNoteGraph(files: NoteSourceFile[]): NoteGraphPayload {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const cappedFiles = sorted.slice(0, MAX_GRAPH_NODES);
  const hiddenCount = sorted.length - cappedFiles.length;
  const parsed = cappedFiles.flatMap((file) => {
    const posix = file.path.replace(/\\/g, "/");
    const { front, body } = splitFrontmatter(file.text);
    const folder = posixDirname(posix);
    const cleanFolder = folder === "." ? "" : folder;
    const title = titleFrom(posix, body);
    if (isHiddenGraphFile(posix, title)) return [];
    const tags = unique([...tagsFromFrontmatter(front), ...tagsFromBody(body)]);
    return [
      {
        file,
        posix,
        front,
        body,
        cleanFolder,
        title,
        tags,
      },
    ];
  });

  if (parsed.length === 0) {
    return blank("empty", "The vault folder has no notes yet. Nothing was invented.");
  }

  const nodes: GraphNode[] = parsed.map((item) => {
    return {
      id: item.posix,
      title: item.title,
      folder: item.cleanFolder,
      tags: item.tags,
      excerpt: excerptFrom(item.body),
      text: noteText(item.body),
      kind: "note" as const,
      nodeType: classifyNote({
        path: item.posix,
        folder: item.cleanFolder,
        tags: item.tags,
        frontType: frontmatterValue(item.front, "type"),
        kind: "note",
      }),
      ssot: frontmatterFlag(item.front, "ssot"),
      hubs: [] as string[],
      root: false,
      file: item.posix,
      anchor: "",
    };
  });

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

  const areaOf = new Map<string, (typeof AREAS)[number]>();
  for (const note of nodes) areaOf.set(note.id, areaFor(note));
  const usedAreas = new Map<string, (typeof AREAS)[number]>();
  for (const area of areaOf.values()) usedAreas.set(area.id, area);

  for (const note of nodes) {
    const area = areaOf.get(note.id);
    if (!area) continue;
    note.hubs = [area.id];
    addEdge(note.id, area.id, "folder");
    for (const tag of note.tags) {
      const other = areaByKey(tag);
      if (other && other.id !== area.id) addEdge(note.id, other.id, "tag");
    }
  }

  for (const item of parsed) {
    const source = byId.get(norm(item.posix));
    if (!source) continue;
    for (const match of item.body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) {
      const target = match[1]?.trim();
      if (!target) continue;
      const hit = findNote(target, nodes);
      if (hit) addEdge(source.id, hit.id, "wikilink");
    }
    const area = areaOf.get(source.id);
    headingsIn(item.body, item.title).forEach((heading, index) => {
      if (AREAS.some((area) => hubNameKey(area.title) === hubNameKey(heading))) return;
      const id = `heading:${source.id}:${index}:${slug(heading)}`;
      nodes.push({
        id,
        title: heading,
        folder: source.folder,
        tags: [],
        excerpt: heading,
        text: heading,
        kind: "note",
        nodeType: "heading",
        ssot: false,
        hubs: area ? [area.id] : [],
        root: false,
        file: source.id,
        anchor: heading,
      });
      addEdge(source.id, id, "heading");
    });
    for (const attachment of attachmentsIn(item.body)) {
      const id = `${attachment.kind}:${source.id}:${slug(attachment.href)}`;
      const title = posixBasename(attachment.href) || attachment.href;
      nodes.push({
        id,
        title,
        folder: source.folder,
        tags: [],
        excerpt: attachment.href,
        text: attachment.href,
        kind: "note",
        nodeType: attachment.kind === "file" ? "file" : "link",
        ssot: false,
        hubs: area ? [area.id] : [],
        root: false,
        file: "",
        anchor: "",
      });
      addEdge(source.id, id, "file");
    }
  }

  const tagMembers = new Map<string, GraphNode[]>();
  for (const note of nodes) {
    if (!note.id.endsWith(".md") && !note.id.includes("/")) continue;
    if (note.kind !== "note" || note.nodeType === "heading") continue;
    for (const tag of note.tags) {
      if (AREA_KEYS.has(tag)) continue;
      const list = tagMembers.get(tag) ?? [];
      list.push(note);
      tagMembers.set(tag, list);
    }
  }
  for (const [tag, members] of tagMembers) {
    const counts = new Map<string, number>();
    for (const member of members) {
      const home = member.hubs[0];
      if (!home) continue;
      counts.set(home, (counts.get(home) ?? 0) + 1);
    }
    const home = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
    const id = tagHubId(tag);
    const title = tag.slice(0, 1).toUpperCase() + tag.slice(1);
    nodes.push({
      id,
      title,
      folder: "",
      tags: [tag],
      excerpt: `Tag ${tag}.`,
      text: `Tag ${tag}.`,
      kind: "note",
      nodeType: "tag",
      ssot: false,
      hubs: home ? [home] : [],
      root: false,
      file: "",
      anchor: "",
    });
    for (const member of members) addEdge(member.id, id, "tag");
  }

  const noteCount = parsed.length;
  for (const area of usedAreas.values()) {
    nodes.push({
      id: area.id,
      title: area.title,
      folder: "",
      tags: [],
      excerpt: `${area.title} gathers the notes in this area.`,
      text: `${area.title} gathers the notes in this area.`,
      kind: "folder",
      nodeType: "hub",
      ssot: false,
      hubs: [],
      root: false,
      file: "",
      anchor: "",
    });
  }

  const hubByName = new Map<string, GraphNode>();
  for (const node of nodes) {
    if (node.kind === "folder") hubByName.set(hubNameKey(node.title), node);
  }
  const absorbed = new Map<string, string>();
  for (const note of nodes) {
    if (note.kind === "folder") continue;
    const named = hubByName.get(hubNameKey(note.title));
    if (!named || named.id === note.id || hubNameKey(note.title) !== hubNameKey(named.title)) continue;
    if (note.id.endsWith(".md")) {
      named.excerpt = note.excerpt;
      named.text = note.text;
      named.tags = [...note.tags];
      named.ssot = note.ssot;
      named.file = note.file || note.id;
      if (note.folder) named.folder = note.folder;
    }
    absorbed.set(note.id, named.id);
  }
  const visibleNodes = absorbed.size === 0 ? nodes : nodes.filter((node) => !absorbed.has(node.id));
  const visibleEdges: GraphEdge[] = [];
  const seenEdges = new Set<string>();
  for (const edge of edges) {
    const from = absorbed.get(edge.from) ?? edge.from;
    const to = absorbed.get(edge.to) ?? edge.to;
    if (from === to) continue;
    const [left, right] = from < to ? [from, to] : [to, from];
    const id = `${edge.reason}:${left}:${right}`;
    if (seenEdges.has(id)) continue;
    seenEdges.add(id);
    visibleEdges.push({ id, from: left, to: right, reason: edge.reason });
  }

  const linked = new Set<string>();
  for (const edge of visibleEdges) {
    linked.add(edge.from);
    linked.add(edge.to);
  }
  const keptNodes = visibleNodes.filter((node) => {
    if (!node.title.trim()) return false;
    if (node.kind === "folder") return linked.has(node.id) || node.file !== "";
    if (!linked.has(node.id) && !node.id.endsWith(".md")) return false;
    return true;
  });

  const detail = capped
    ? "Some notes were left out so this stays light on an older computer."
    : "These notes were read from the vault folder.";

  return {
    status: "ready",
    detail,
    nodes: keptNodes,
    edges: visibleEdges,
    noteCount,
    connectionCount: visibleEdges.length,
    hiddenCount,
    capped,
    legend: legendFromNodes(keptNodes),
  };
}
