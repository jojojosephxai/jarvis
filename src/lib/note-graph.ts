import { promises as fs } from "node:fs";
import path from "node:path";

export const MAX_GRAPH_NODES = 40;
const MAX_GRAPH_EDGES = 80;
const MAX_SCAN = 80;
const MAX_DEPTH = 5;
const MAX_BYTES = 300_000;
const EXCERPT_LIMIT = 320;

export type GraphReason = "wikilink" | "tag" | "folder";

export type GraphStatus = "ready" | "not-wired" | "missing" | "empty";

export type GraphNode = {
  id: string;
  title: string;
  folder: string;
  tags: string[];
  excerpt: string;
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
};

export type NoteSourceFile = {
  path: string;
  text: string;
};

const NOT_WIRED =
  "Vault notes are not wired yet. This graph is empty. No notes were invented.";

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
  };
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, "/").replace(/\.md$/i, "");
}

function titleFrom(filePath: string, body: string): string {
  const heading = body.match(/^#\s+(.+)$/m);
  if (heading?.[1]) return heading[1].trim();
  return path.posix.basename(filePath, path.extname(filePath)).replace(/[-_]/g, " ");
}

function splitFrontmatter(text: string): { front: string; body: string } {
  if (!text.startsWith("---")) return { front: "", body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { front: "", body: text };
  return { front: text.slice(3, end), body: text.slice(end + 4) };
}

function cleanTag(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "").replace(/^#/, "").toLowerCase();
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

function findNote(target: string, notes: GraphNode[]): GraphNode | undefined {
  const key = norm(target);
  return (
    notes.find((note) => norm(note.id) === key) ??
    notes.find((note) => norm(path.posix.basename(note.id, ".md")) === key) ??
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
    const folder = path.posix.dirname(posix);
    return {
      id: posix,
      title: titleFrom(posix, body),
      folder: folder === "." ? "" : folder,
      tags: unique([...tagsFromFrontmatter(front), ...tagsFromBody(body)]),
      excerpt: excerptFrom(body),
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

  const tagGroups = new Map<string, string[]>();
  for (const note of nodes) {
    for (const tag of note.tags) {
      const group = tagGroups.get(tag) ?? [];
      group.push(note.id);
      tagGroups.set(tag, group);
    }
  }
  for (const group of tagGroups.values()) {
    const ordered = [...group].sort();
    if (ordered.length < 2) continue;
    const hub = ordered[0];
    if (!hub) continue;
    if (ordered.length > 6) {
      for (const id of ordered.slice(1)) addEdge(hub, id, "tag");
    } else {
      for (let i = 0; i < ordered.length; i += 1) {
        for (let j = i + 1; j < ordered.length; j += 1) {
          const left = ordered[i];
          const right = ordered[j];
          if (left && right) addEdge(left, right, "tag");
        }
      }
    }
  }

  for (const note of nodes) {
    if (!note.folder) continue;
    const candidates = [
      `${note.folder}.md`,
      `${note.folder}/index.md`,
      `${note.folder}/${path.posix.basename(note.folder)}.md`,
    ];
    for (const candidate of candidates) {
      const parent = byId.get(norm(candidate));
      if (parent && parent.id !== note.id) {
        addEdge(note.id, parent.id, "folder");
        break;
      }
    }
  }

  const detail = capped
    ? "Some notes were left out so this stays light on an older computer."
    : "These notes were read from the vault folder.";

  return {
    status: "ready",
    detail,
    nodes,
    edges,
    noteCount: nodes.length,
    connectionCount: edges.length,
    hiddenCount,
    capped,
  };
}

async function walkMarkdown(dir: string, rootReal: string, depth: number, acc: string[]): Promise<void> {
  if (depth > MAX_DEPTH || acc.length >= MAX_SCAN) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (acc.length >= MAX_SCAN) return;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    let real: string;
    try {
      real = await fs.realpath(full);
    } catch {
      continue;
    }
    if (real !== rootReal && !real.startsWith(rootReal + path.sep)) continue;
    if (entry.isDirectory()) {
      await walkMarkdown(full, rootReal, depth + 1, acc);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      acc.push(real);
    }
  }
}

export async function loadVaultGraph(vaultPath?: string | null): Promise<NoteGraphPayload> {
  const configured = (vaultPath === undefined ? process.env.OBSIDIAN_VAULT_PATH : vaultPath) ?? "";
  const trimmed = configured.trim();
  if (!trimmed) return blank("not-wired", NOT_WIRED);

  let rootStat;
  try {
    rootStat = await fs.stat(trimmed);
  } catch {
    return blank("missing", "A vault folder is set, but it could not be opened. Nothing was drawn.");
  }
  if (!rootStat.isDirectory()) {
    return blank("missing", "A vault folder is set, but it is not a folder. Nothing was drawn.");
  }

  let rootReal: string;
  try {
    rootReal = await fs.realpath(trimmed);
  } catch {
    return blank("missing", "A vault folder is set, but it could not be opened. Nothing was drawn.");
  }

  const files: string[] = [];
  await walkMarkdown(trimmed, rootReal, 0, files);
  const sources: NoteSourceFile[] = [];
  for (const filePath of files) {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size > MAX_BYTES) continue;
      const text = await fs.readFile(filePath, "utf8");
      const relative = path.relative(rootReal, filePath).split(path.sep).join("/");
      sources.push({ path: relative, text });
    } catch {
      continue;
    }
  }

  if (sources.length === 0) {
    return blank("empty", "The vault folder has no notes yet. Nothing was invented.");
  }
  return buildNoteGraph(sources);
}
