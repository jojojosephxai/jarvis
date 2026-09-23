import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { makeId } from "./ids";
import { resolveVaultPath } from "./vault-read";

/**
 * Vault write-back.
 * "Remember that…" updates a real note in the Obsidian vault.
 * "What changed" reads the ledger. Chat does not read a write back out loud.
 * Edits Joseph makes in Obsidian are recorded here and not narrated on their own.
 */

const LARGE_CHARS = 480;
const STORED_TEXT_CAP = 80_000;
const CHANGE_CAP = 40;
const SHOWN_CAP = 8;
const LINE_CAP = 140;

const SENSITIVE_RE =
  /\b(passwords?|passcodes?|passphrases?|secrets?|api keys?|access tokens?|ssn|social security|credit cards?|card numbers?|bank accounts?|routing numbers?|diagnos(?:is|es)|prescriptions?)\b/i;

const CARD_RE = /\b(?:\d[ -]?){13,19}\b/;

const PREFERENCE_RE =
  /\b(preferences?|prefers?|decisions?|decided|i like|i don't like|i do not like|i hate|dislike|reminders?)\b/i;

const REWRITE_RE = /\b(rewrite|overwrite|replace all of|replace the|erase|delete)\b/i;
const REWRITE_TARGET_RE = /\b(note|notes|file|page|preferences|vault)\b/i;

const TOPIC_FILES: { file: string; words: string[] }[] = [
  { file: "Swim.md", words: ["swim", "swimming", "pool", "lane"] },
  { file: "School.md", words: ["school", "class", "teacher", "homework", "soccer", "library", "grade"] },
  { file: "Goals.md", words: ["goal", "goals", "science", "fair"] },
  { file: "About.md", words: ["birthday"] },
];

const SLUG_STOP = new Set([
  "the",
  "that",
  "this",
  "and",
  "for",
  "with",
  "from",
  "into",
  "onto",
  "about",
  "after",
  "before",
  "your",
  "have",
  "has",
  "was",
  "are",
  "been",
  "being",
  "they",
  "them",
  "then",
  "than",
  "when",
  "where",
  "what",
  "who",
  "how",
  "why",
  "can",
  "could",
  "would",
  "should",
  "please",
  "remember",
  "note",
  "notes",
  "vault",
  "just",
  "also",
  "will",
  "going",
  "want",
  "need",
]);

export type WriteAction = "append" | "create" | "rewrite";

export type WritePlan = {
  text: string;
  file: string;
  action: WriteAction;
  needsConfirm: boolean;
  summary: string;
  problem?: string;
};

type ChangeSource = "write" | "obsidian";

type LedgerChange = {
  id: string;
  file: string;
  summary: string;
  source: ChangeSource;
  at: string;
};

type LedgerFile = {
  hash: string;
  text: string;
};

type Ledger = {
  seeded: boolean;
  files: Record<string, LedgerFile>;
  changes: LedgerChange[];
  nudged: string[];
};

export type ObserveResult = {
  nudge: string | null;
};

const NUDGE =
  'A note changed in Obsidian. I did not read it back. Ask "what changed" if you want the receipt.';

const chains = new Map<string, Promise<unknown>>();

function withLedger<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(root) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  chains.set(
    root,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function clip(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}…`;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function emptyLedger(): Ledger {
  return { seeded: false, files: {}, changes: [], nudged: [] };
}

function ledgerPath(root: string): string {
  return path.join(root, "data", "vault-ledger.json");
}

function isChange(value: unknown): value is LedgerChange {
  if (!value || typeof value !== "object") return false;
  const change = value as Partial<LedgerChange>;
  return (
    typeof change.id === "string" &&
    typeof change.file === "string" &&
    typeof change.summary === "string" &&
    (change.source === "write" || change.source === "obsidian") &&
    typeof change.at === "string"
  );
}

function isLedgerFile(value: unknown): value is LedgerFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<LedgerFile>;
  return typeof file.hash === "string" && typeof file.text === "string";
}

function parseLedger(raw: string): Ledger {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return emptyLedger();
    const record = value as Partial<Ledger>;
    const files: Record<string, LedgerFile> = {};
    if (record.files && typeof record.files === "object") {
      for (const [key, entry] of Object.entries(record.files)) {
        if (isLedgerFile(entry)) files[key] = entry;
      }
    }
    return {
      seeded: record.seeded === true,
      files,
      changes: Array.isArray(record.changes) ? record.changes.filter(isChange).slice(-CHANGE_CAP) : [],
      nudged: Array.isArray(record.nudged)
        ? record.nudged.filter((entry): entry is string => typeof entry === "string").slice(-80)
        : [],
    };
  } catch {
    return emptyLedger();
  }
}

async function readLedger(root: string): Promise<Ledger> {
  try {
    return parseLedger(await fs.readFile(ledgerPath(root), "utf8"));
  } catch {
    return emptyLedger();
  }
}

async function writeLedger(root: string, ledger: Ledger): Promise<void> {
  const file = ledgerPath(root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const next: Ledger = {
    ...ledger,
    changes: ledger.changes.slice(-CHANGE_CAP),
    nudged: ledger.nudged.slice(-80),
  };
  await fs.writeFile(file, JSON.stringify(next), "utf8");
}

async function vaultReal(directory: string): Promise<string | null> {
  try {
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) return null;
    return await fs.realpath(directory);
  } catch {
    return null;
  }
}

function resolveInside(vaultRoot: string, relative: string): string | null {
  if (!relative || path.isAbsolute(relative) || relative.includes("..")) return null;
  const parts = relative.split("/");
  if (parts.some((part) => !part || part.startsWith("."))) return null;
  if (!parts[parts.length - 1]?.endsWith(".md")) return null;
  const abs = path.resolve(vaultRoot, ...parts);
  const rel = path.relative(vaultRoot, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}

async function listMarkdown(directory: string): Promise<{ relative: string; text: string }[] | null> {
  const rootReal = await vaultReal(directory);
  if (!rootReal) return null;
  const found: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 5 || found.length >= 250) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= 250) return;
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
        await walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        found.push(full);
      }
    }
  }

  await walk(directory, 0);
  const notes: { relative: string; text: string }[] = [];
  for (const abs of found) {
    let real: string;
    try {
      real = await fs.realpath(abs);
    } catch {
      continue;
    }
    const relative = path.relative(rootReal, real).split(path.sep).join("/");
    if (relative.startsWith("..")) continue;
    try {
      const stat = await fs.stat(real);
      if (!stat.isFile() || stat.size > 300_000) continue;
      notes.push({ relative, text: await fs.readFile(real, "utf8") });
    } catch {
      continue;
    }
  }
  notes.sort((a, b) => a.relative.localeCompare(b.relative));
  return notes;
}

function wordHit(text: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`, "i").test(text);
}

export function chooseNoteFile(text: string, existing: string[]): string {
  if (PREFERENCE_RE.test(text)) {
    const preferences = existing.find((file) => path.posix.basename(file).toLowerCase() === "preferences.md");
    return preferences ?? "Preferences.md";
  }

  let best = "";
  let bestScore = 0;
  for (const topic of TOPIC_FILES) {
    const found = existing.find((file) => path.posix.basename(file).toLowerCase() === topic.file.toLowerCase());
    if (!found) continue;
    let score = 0;
    for (const word of topic.words) {
      if (wordHit(text, word)) score += 4;
    }
    if (score > bestScore) {
      best = found;
      bestScore = score;
    }
  }
  if (bestScore >= 4) return best;

  for (const file of existing) {
    const title = path.posix.basename(file, ".md");
    if (title.toLowerCase() === "preferences") continue;
    if (wordHit(text, title)) return file;
  }

  return `${slugTitle(text)}.md`;
}

function slugTitle(text: string): string {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length > 2 && !SLUG_STOP.has(word))
    .slice(0, 2);
  const title = (words.length > 0 ? words : ["note"])
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  const safe = title.replace(/[^A-Za-z0-9 -]/g, "").trim();
  return safe.slice(0, 40) || "Note";
}

function isRewrite(text: string): boolean {
  return REWRITE_RE.test(text) && REWRITE_TARGET_RE.test(text);
}

export function writeNeedsConfirm(text: string, action: WriteAction): boolean {
  if (action === "rewrite") return true;
  if (text.length > LARGE_CHARS) return true;
  if (SENSITIVE_RE.test(text)) return true;
  if (CARD_RE.test(text)) return true;
  return false;
}

function lineSummary(action: WriteAction, text: string): string {
  const line = clip(text, LINE_CAP);
  switch (action) {
    case "rewrite":
      return `Rewrote the note to start: ${line}`;
    case "create":
      return `Created the note and added: ${line}`;
    case "append":
      return `Added this line: ${line}`;
    default: {
      const neverAction: never = action;
      return neverAction;
    }
  }
}

function alreadyThere(existing: string, text: string): boolean {
  const needle = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!needle) return false;
  return existing.split(/\r?\n/).some((line) => {
    const clean = line.replace(/^[-*]\s+/, "").replace(/\s+/g, " ").trim().toLowerCase();
    return clean === needle;
  });
}

function appendLine(existing: string, text: string): string {
  const line = `- ${text.replace(/\s+/g, " ").trim()}`;
  const base = existing.endsWith("\n") || existing.length === 0 ? existing : `${existing}\n`;
  return `${base}${line}\n`;
}

function titleFromFile(relative: string): string {
  return path.posix.basename(relative, ".md");
}

function createBody(relative: string, text: string): string {
  return `# ${titleFromFile(relative)}\n\n- ${text.replace(/\s+/g, " ").trim()}\n`;
}

function rewriteBody(relative: string, text: string): string {
  return `# ${titleFromFile(relative)}\n\n${text.trim()}\n`;
}

export async function planVaultWrite(text: string, vaultDir: string): Promise<WritePlan> {
  const clean = text.replace(/\s+/g, " ").trim();
  const notes = await listMarkdown(vaultDir);
  if (!notes) {
    return {
      text: clean,
      file: "",
      action: "append",
      needsConfirm: false,
      summary: "",
      problem: "The vault folder was not found, so I did not write a note.",
    };
  }
  if (!clean) {
    return {
      text: "",
      file: "",
      action: "append",
      needsConfirm: false,
      summary: "",
      problem: "I need the words to save before I can write a note.",
    };
  }

  const existing = notes.map((note) => note.relative);
  const file = chooseNoteFile(clean, existing);
  const current = notes.find((note) => note.relative === file);
  const action: WriteAction = isRewrite(clean) ? "rewrite" : current ? "append" : "create";
  return {
    text: clean,
    file,
    action,
    needsConfirm: writeNeedsConfirm(clean, action),
    summary: lineSummary(action, clean),
  };
}

export async function enrichKeepInput(text: string, vaultDir: string): Promise<Record<string, string>> {
  const plan = await planVaultWrite(text, vaultDir);
  return {
    text: plan.text,
    file: plan.file,
    action: plan.action,
    needsConfirm: plan.needsConfirm ? "yes" : "no",
  };
}

export type CommitResult = {
  status: "done" | "failed" | "blocked";
  outcome: string;
  file: string;
};

function isAction(value: string | undefined): value is WriteAction {
  return value === "append" || value === "create" || value === "rewrite";
}

export async function commitVaultWrite(
  root: string,
  vaultDir: string,
  input: Record<string, string>,
  approved: boolean,
): Promise<CommitResult> {
  const planned = await planVaultWrite(input.text ?? "", vaultDir);
  if (planned.problem || !planned.text) {
    return {
      status: "failed",
      file: "",
      outcome: planned.problem || "I did not write a note.",
    };
  }

  const file = input.file?.trim() || planned.file;
  const action = isAction(input.action) ? input.action : planned.action;
  const needsConfirm = input.needsConfirm === "yes" || planned.needsConfirm;
  if (needsConfirm && !(approved && input.needsConfirm === "yes")) {
    return {
      status: "blocked",
      file,
      outcome: "I have not written that. It needs a yes first. The vault was not changed.",
    };
  }

  const rootReal = await vaultReal(vaultDir);
  const abs = rootReal ? resolveInside(rootReal, file) : null;
  if (!rootReal || !abs || path.posix.basename(file).toLowerCase() === "readme.md") {
    return {
      status: "failed",
      file,
      outcome: "I did not write a note. That file is outside the vault.",
    };
  }

  let current = "";
  let existed = false;
  try {
    current = await fs.readFile(abs, "utf8");
    existed = true;
  } catch {
    existed = false;
  }

  if (action === "append" && existed && alreadyThere(current, planned.text)) {
    return {
      status: "done",
      file,
      outcome: `${file} already has that line. I did not write it again. Ask "what changed" if you want the last receipt.`,
    };
  }

  let next = current;
  const wroteAction: WriteAction = action === "create" && existed ? "append" : action;
  switch (action) {
    case "append":
      next = existed ? appendLine(current, planned.text) : createBody(file, planned.text);
      break;
    case "create":
      next = existed ? appendLine(current, planned.text) : createBody(file, planned.text);
      break;
    case "rewrite":
      next = rewriteBody(file, planned.text);
      break;
    default: {
      const neverAction: never = action;
      return neverAction;
    }
  }

  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, next, "utf8");
  const summary = lineSummary(wroteAction, planned.text);
  await rememberWrite(root, file, next, summary);
  return {
    status: "done",
    file,
    outcome: `Wrote ${file}. I did not read it back. Ask "what changed" if you want the receipt.`,
  };
}

async function rememberWrite(root: string, file: string, text: string, summary: string): Promise<void> {
  await withLedger(root, async () => {
    const ledger = await readLedger(root);
    const stored = text.length > STORED_TEXT_CAP ? "" : text;
    ledger.seeded = true;
    ledger.files[file] = { hash: hashText(text), text: stored };
    ledger.changes.push({
      id: makeId("chg"),
      file,
      summary,
      source: "write",
      at: new Date().toISOString(),
    });
    await writeLedger(root, ledger);
  });
}

function storedText(text: string): string {
  return text.length > STORED_TEXT_CAP ? "" : text;
}

function meaningful(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function summarizeEdit(before: string, after: string): string {
  if (!before) return "The note changed in Obsidian. It is too large to summarize line by line.";
  const oldLines = meaningful(before);
  const newLines = meaningful(after);
  const added = newLines.filter((line) => !oldLines.includes(line));
  const removed = oldLines.filter((line) => !newLines.includes(line));
  if (added.length === 1 && removed.length === 0) {
    return `Added this line: ${clip(added[0].replace(/^[-*]\s+/, ""), LINE_CAP)}`;
  }
  if (added.length === 0 && removed.length === 1) {
    return `Removed this line: ${clip(removed[0].replace(/^[-*]\s+/, ""), LINE_CAP)}`;
  }
  if (added.length === 0 && removed.length === 0) {
    return "Edited the note. The wording shift is small.";
  }
  const sample = added[0] ? ` One new line starts: ${clip(added[0].replace(/^[-*]\s+/, ""), 80)}.` : "";
  return `Edited the note. ${added.length} line${added.length === 1 ? "" : "s"} added, ${removed.length} removed.${sample}`;
}

function summarizeNew(text: string): string {
  const line = meaningful(text)[0];
  if (!line) return "A new note was added in Obsidian.";
  return `New note. First line: ${clip(line.replace(/^[-*]\s+/, ""), LINE_CAP)}`;
}

export async function observeVault(root: string, vaultDir?: string): Promise<ObserveResult> {
  const directory = vaultDir ?? resolveVaultPath(root);
  return withLedger(root, async () => {
    const notes = await listMarkdown(directory);
    if (!notes) return { nudge: null };
    const ledger = await readLedger(root);
    if (!ledger.seeded) {
      ledger.seeded = true;
      for (const note of notes) {
        ledger.files[note.relative] = { hash: hashText(note.text), text: storedText(note.text) };
      }
      await writeLedger(root, ledger);
      return { nudge: null };
    }

    const seen = new Set<string>();
    for (const note of notes) {
      seen.add(note.relative);
      const prev = ledger.files[note.relative];
      const hash = hashText(note.text);
      if (prev && prev.hash === hash) continue;
      const summary = prev ? summarizeEdit(prev.text, note.text) : summarizeNew(note.text);
      ledger.changes.push({
        id: makeId("chg"),
        file: note.relative,
        summary,
        source: "obsidian",
        at: new Date().toISOString(),
      });
      ledger.files[note.relative] = { hash, text: storedText(note.text) };
    }

    for (const relative of Object.keys(ledger.files)) {
      if (seen.has(relative)) continue;
      ledger.changes.push({
        id: makeId("chg"),
        file: relative,
        summary: "The note is gone from the vault.",
        source: "obsidian",
        at: new Date().toISOString(),
      });
      delete ledger.files[relative];
    }

    await writeLedger(root, ledger);
    return { nudge: null };
  });
}

export async function takeNudge(root: string): Promise<string | null> {
  return withLedger(root, async () => {
    const ledger = await readLedger(root);
    const fresh = ledger.changes.filter(
      (change) => change.source === "obsidian" && !ledger.nudged.includes(change.id),
    );
    if (fresh.length === 0) return null;
    ledger.nudged.push(...fresh.map((change) => change.id));
    await writeLedger(root, ledger);
    return NUDGE;
  });
}

export async function describeChanges(root: string): Promise<string> {
  return withLedger(root, async () => {
    const ledger = await readLedger(root);
    const recent = ledger.changes.slice(-SHOWN_CAP);
    for (const change of recent) {
      if (!ledger.nudged.includes(change.id)) ledger.nudged.push(change.id);
    }
    await writeLedger(root, ledger);
    if (recent.length === 0) {
      return "Nothing has changed in the vault. I did not write a note.";
    }
    const lines = [...recent].reverse().map((change) => {
      const who = change.source === "write" ? "Wrote it." : "Edited in Obsidian.";
      return `${change.file} — ${who} ${change.summary}`;
    });
    return `${lines.join("\n")}\n\nThat is the receipt. I did not read the whole note back.`;
  });
}

export function attachWriteNudge<T extends { reply: string; notice?: string; plan?: unknown; receipts: unknown[] }>(
  response: T,
  nudge: string | null,
): T {
  if (!nudge) return response;
  if (response.plan || response.receipts.length > 0) {
    return { ...response, reply: `${response.reply}\n\n${nudge}` };
  }
  const notice = response.notice ? `${response.notice} ${nudge}` : nudge;
  return { ...response, notice };
}
