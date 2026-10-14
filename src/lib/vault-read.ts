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
      acc.push(full);
    }
  }
}

export async function loadVaultNotes(directory: string): Promise<VaultLoad> {
  let stat;
  try {
    stat = await fs.stat(directory);
  } catch {
    return {
      ok: false,
      directory,
      problem: "that folder was not found",
    };
  }

  if (!stat.isDirectory()) {
    return {
      ok: false,
      directory,
      problem: "that path is not a folder",
    };
  }

  let rootReal: string;
  try {
    rootReal = await fs.realpath(directory);
  } catch {
    return {
      ok: false,
      directory,
      problem: "that folder could not be opened",
    };
  }

  const files: string[] = [];
  await walkMarkdown(directory, rootReal, 0, files);
  const notes: VaultNote[] = [];

  for (const filePath of files) {
    try {
      const fileStat = await fs.stat(filePath);
      if (!fileStat.isFile() || fileStat.size > MAX_BYTES) continue;
      const text = await fs.readFile(filePath, "utf8");
      notes.push({
        title: noteTitle(filePath),
        filePath,
        text,
      });
    } catch {
      continue;
    }
  }

  notes.sort((a, b) => a.title.localeCompare(b.title));

  if (notes.length === 0) {
    return {
      ok: false,
      directory,
      problem: "that folder has no markdown notes",
    };
  }

  return { ok: true, notes, directory };
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
