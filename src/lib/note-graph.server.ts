// Next strips this import. Node tests pass --conditions=react-server so it stays empty.
import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  buildNoteGraph,
  type GraphStatus,
  type NoteGraphPayload,
  type NoteSourceFile,
} from "./note-graph";

const MAX_SCAN = 800;
const MAX_DEPTH = 5;
const MAX_BYTES = 300_000;

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
    legend: [],
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
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name.startsWith("_sync-backups")) {
      continue;
    }
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

export function resolveVaultPath(
  explicit: string | null | undefined,
  envValue: string | undefined,
  cwd: string,
): string {
  if (explicit !== undefined && explicit !== null) return explicit.trim();
  const fromEnv = envValue?.trim();
  if (fromEnv) return fromEnv;
  return path.join(cwd, "vault");
}

export async function loadVaultGraph(vaultPath?: string | null): Promise<NoteGraphPayload> {
  const trimmed = resolveVaultPath(vaultPath, process.env.OBSIDIAN_VAULT_PATH, process.cwd());
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
