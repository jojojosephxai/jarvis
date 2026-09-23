import { promises as fs } from "node:fs";
import path from "node:path";

import type { MemoryHit, MemorySource } from "./types";

/**
 * Memory seam.
 *
 * Local notes always work. An Obsidian vault is optional for this search:
 * set OBSIDIAN_VAULT_PATH to a folder of markdown files.
 * "Remember that…" does not use keepNote. That write goes to the vault
 * through vault-write.ts. keepNote still saves under data/user-notes.
 */
export type MemorySearchResult = {
  hits: MemoryHit[];
  stores: MemorySource[];
  note?: string;
};

export type MemorySearchOptions = {
  root?: string;
  vaultPath?: string | null;
};

const MAX_FILES = 250;
const MAX_DEPTH = 5;
const MAX_BYTES = 300_000;
const EXCERPT_LIMIT = 180;

function notesDir(root: string): string {
  return path.join(root, "data", "notes");
}

function userNotesDir(root: string): string {
  return path.join(root, "data", "user-notes");
}

function termsFor(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

function scoreText(text: string, terms: string[]): number {
  const hay = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    let from = 0;
    while (from < hay.length) {
      const found = hay.indexOf(term, from);
      if (found === -1) break;
      score += 1;
      from = found + term.length;
    }
  }
  return score;
}

function titleFrom(filePath: string, text: string): string {
  const heading = text.match(/^#\s+(.+)$/m);
  if (heading?.[1]) return heading[1].trim();
  return path.basename(filePath, path.extname(filePath)).replace(/[-_]/g, " ");
}

function excerptFrom(text: string, terms: string[]): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const hit = lines.find((line) =>
    terms.some((term) => line.toLowerCase().includes(term)),
  );
  const chosen = (hit ?? lines[0] ?? text).replace(/\s+/g, " ").trim();
  if (chosen.length <= EXCERPT_LIMIT) return chosen;
  return `${chosen.slice(0, EXCERPT_LIMIT).trim()}…`;
}

async function readMarkdownFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

async function walkVault(dir: string, rootReal: string, depth: number, acc: string[]): Promise<void> {
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
      await walkVault(full, rootReal, depth + 1, acc);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      acc.push(full);
    }
  }
}

async function hitsFromFiles(
  files: string[],
  terms: string[],
  source: MemorySource,
): Promise<MemoryHit[]> {
  const hits: MemoryHit[] = [];
  for (const filePath of files) {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size > MAX_BYTES) continue;
      const text = await fs.readFile(filePath, "utf8");
      const score = scoreText(`${titleFrom(filePath, text)}\n${text}`, terms);
      if (score === 0) continue;
      hits.push({
        id: `${source}:${path.basename(filePath)}:${score}`,
        title: titleFrom(filePath, text),
        excerpt: excerptFrom(text, terms),
        source,
      });
    } catch {
      continue;
    }
  }
  hits.sort((a, b) => {
    const aScore = Number(a.id.split(":").at(-1));
    const bScore = Number(b.id.split(":").at(-1));
    return bScore - aScore;
  });
  return hits.slice(0, 3);
}

export async function searchMemory(
  query: string,
  options: MemorySearchOptions = {},
): Promise<MemorySearchResult> {
  const root = options.root ?? process.cwd();
  const terms = termsFor(query);
  const stores: MemorySource[] = ["local-notes"];
  const localFiles = [
    ...(await readMarkdownFiles(notesDir(root))),
    ...(await readMarkdownFiles(userNotesDir(root))),
  ];

  if (terms.length === 0) {
    return { hits: [], stores, note: "Tell me what to look for." };
  }

  const hits = await hitsFromFiles(localFiles, terms, "local-notes");
  const vaultPath =
    options.vaultPath === undefined
      ? process.env.OBSIDIAN_VAULT_PATH?.trim() || null
      : options.vaultPath;

  if (!vaultPath) {
    return { hits, stores };
  }

  stores.push("obsidian-vault");
  let vaultStat;
  try {
    vaultStat = await fs.stat(vaultPath);
  } catch {
    return {
      hits,
      stores,
      note: "The Obsidian vault path is set, but that folder was not found. I searched local notes only.",
    };
  }

  if (!vaultStat.isDirectory()) {
    return {
      hits,
      stores,
      note: "The Obsidian vault path is not a folder. I searched local notes only.",
    };
  }

  let vaultReal: string;
  try {
    vaultReal = await fs.realpath(vaultPath);
  } catch {
    return {
      hits,
      stores,
      note: "The Obsidian vault folder could not be opened. I searched local notes only.",
    };
  }

  const vaultFiles: string[] = [];
  await walkVault(vaultPath, vaultReal, 0, vaultFiles);
  const vaultHits = await hitsFromFiles(vaultFiles, terms, "obsidian-vault");
  const merged = [...hits, ...vaultHits].slice(0, 4);
  return { hits: merged, stores };
}

export async function keepNote(text: string, root = process.cwd()): Promise<MemoryHit> {
  const dir = userNotesDir(root);
  await fs.mkdir(dir, { recursive: true });
  const id = `${Date.now()}`;
  const filePath = path.join(dir, `${id}.md`);
  const body = text.trim();
  const contents = `# Note\n\n${body}\n`;
  await fs.writeFile(filePath, contents, "utf8");
  return {
    id,
    title: "Note",
    excerpt: body.length > EXCERPT_LIMIT ? `${body.slice(0, EXCERPT_LIMIT).trim()}…` : body,
    source: "local-notes",
  };
}
