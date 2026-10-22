import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Read-only Obsidian vault notes for answers.
 * Chat uses this folder only. It does not read data/notes and it does not write.
 */

export type VaultNote = {
  title: string;
  filePath: string;
  text: string;
};

export type VaultLoad =
  | { ok: true; notes: VaultNote[]; directory: string }
  | { ok: false; directory: string; problem: string };

const MAX_FILES = 250;
const MAX_DEPTH = 5;
const MAX_BYTES = 300_000;

export function resolveVaultPath(root: string, override?: string | null): string {
  const chosen =
    override !== undefined && override !== null
      ? override.trim()
      : process.env.OBSIDIAN_VAULT_PATH?.trim() || "";
  const raw = chosen || "vault";
  return path.isAbsolute(raw) ? raw : path.resolve(root, raw);
}

function noteTitle(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

async function walkMarkdown(dir: string, rootReal: string, depth: number, acc: string[]): Promise<void> {
  if (depth > MAX_DEPTH || acc.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (acc.length >= MAX_FILES) return;
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name.startsWith("_sync-backups")) continue;
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
      acc.push(full);
    }
  }
}

type CachedVault = { checkedAt: number; files: Map<string, { stamp: string; note: VaultNote }>; result: VaultLoad };
const vaultCache = new Map<string, CachedVault>();
const loading = new Map<string, Promise<VaultLoad>>();

export async function loadVaultNotes(directory: string, now = Date.now()): Promise<VaultLoad> {
  const key = path.resolve(directory);
  const old = vaultCache.get(key);
  if (old && now - old.checkedAt < 10_000) return old.result;
  const pending = loading.get(key);
  if (pending) return pending;
  const read = refreshVault(key, old, now);
  loading.set(key, read);
  try { return await read; } finally { loading.delete(key); }
}

async function refreshVault(directory: string, old: CachedVault | undefined, now: number): Promise<VaultLoad> {
  let rootReal: string;
  try {
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) return { ok: false, directory, problem: "that path is not a folder" };
    rootReal = await fs.realpath(directory);
  } catch {
    vaultCache.delete(directory);
    return { ok: false, directory, problem: "that folder was not found" };
  }
  const paths: string[] = [];
  await walkMarkdown(directory, rootReal, 0, paths);
  const files: CachedVault["files"] = new Map();
  for (const filePath of paths) {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size > MAX_BYTES) continue;
      const stamp = `${await fs.realpath(filePath)}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
      const previous = old?.files.get(filePath);
      const note = previous?.stamp === stamp ? previous.note : {
        title: noteTitle(filePath), filePath, text: await fs.readFile(filePath, "utf8"),
      };
      files.set(filePath, { stamp, note });
    } catch { continue; }
  }
  const notes = [...files.values()].map(file => file.note).sort((a, b) => a.title.localeCompare(b.title));
  const result: VaultLoad = notes.length ? { ok: true, notes, directory }
    : { ok: false, directory, problem: "that folder has no markdown notes" };
  if (vaultCache.size >= 8 && !vaultCache.has(directory)) vaultCache.delete(vaultCache.keys().next().value!);
  vaultCache.set(directory, { checkedAt: now, files, result });
  return result;
}

export type VaultChunk = { note: VaultNote; heading: string; text: string; aliases: string; links: string };

/** Heading sections stay together; long sections get bounded, word-aligned windows. */
export function chunkVaultNote(note: VaultNote): VaultChunk[] {
  const front = note.text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const aliases = front?.[1].match(/^aliases:\s*([^\n]*(?:\n[ \t]+-[^\n]*)*)/m)?.[1].replace(/[\[\]"',]/g, " ") ?? "";
  const body = front ? note.text.slice(front[0].length) : note.text;
  const sections: Array<{ heading: string; lines: string[] }> = [];
  const headings: string[] = [];
  let section = { heading: "Overview", lines: [] as string[] };
  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      if (section.lines.join("").trim()) sections.push(section);
      headings.length = heading[1].length - 1;
      headings.push(heading[2]);
      section = { heading: headings.filter(Boolean).join(" › "), lines: [] };
    } else section.lines.push(line);
  }
  if (section.lines.join("").trim()) sections.push(section);
  const chunks: VaultChunk[] = [];
  for (const section of sections) {
    let text = section.lines.join("\n").trim();
    while (text) {
      let end = Math.min(text.length, 700);
      if (end < text.length) {
        const boundary = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(" ", end));
        if (boundary > 350) end = boundary;
      }
      const excerpt = text.slice(0, end).trim();
      chunks.push({ note, heading: section.heading, text: excerpt, aliases,
        links: [...excerpt.matchAll(/\[\[([^\]]+)\]\]/g)].map(match => match[1].replace(/\|/g, " ")).join(" "),
      });
      text = text.slice(end).trim();
    }
  }
  return chunks;
}

/** Read one vault note by its path relative to the vault. Refuses anything outside that folder. */
export async function readVaultMarkdown(
  directory: string,
  relativePath: string,
): Promise<{ path: string; markdown: string } | null> {
  const cleaned = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned.endsWith(".md") || cleaned.includes("\0")) return null;
  const parts = cleaned.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
  let rootReal: string;
  try {
    rootReal = await fs.realpath(directory);
  } catch {
    return null;
  }
  const full = path.resolve(rootReal, cleaned);
  let real: string;
  try {
    real = await fs.realpath(full);
  } catch {
    return null;
  }
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) return null;
  let stat;
  try {
    stat = await fs.stat(real);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size > MAX_BYTES) return null;
  const markdown = await fs.readFile(real, "utf8");
  return { path: path.relative(rootReal, real).replace(/\\/g, "/"), markdown };
}
