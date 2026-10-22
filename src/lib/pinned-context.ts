import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { clockStamp } from "./clock";
import { readVaultMarkdown, resolveVaultPath } from "./vault-read";

export type PinnedOptions = {
  root?: string;
  vaultPath?: string | null;
  now?: Date;
  boardDigest?: () => string | Promise<string>;
};
const files = ["About.md", "Preferences.md", "Voice-and-tone.md", "School-schedule.md", "Goals.md"];
const cached = new Map<string, { stamp: string; text: string }>();

async function optionalNote(directory: string, file: string): Promise<string> {
  const full = path.join(directory, file);
  try {
    const stat = await fs.stat(full);
    const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
    const old = cached.get(full);
    if (old?.stamp === stamp) return old.text;
    const note = await readVaultMarkdown(directory, file);
    const text = note?.markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, "").trim() ?? "";
    if (cached.size >= 100) cached.delete(cached.keys().next().value!);
    cached.set(full, { stamp, text });
    return text;
  } catch {
    cached.delete(full);
    return "";
  }
}

function dayParts(now: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(now);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return { weekday, date };
}

export function scheduleSlice(text: string, now: Date): string {
  const { weekday, date } = dayParts(now);
  const lines = text.split(/\r?\n/);
  // A dated override wins over the recurring weekday.
  for (const key of [date, weekday]) {
    const start = lines.findIndex(line => /^#{1,6}\s/.test(line) && line.toLowerCase().includes(key.toLowerCase()));
    if (start < 0) continue;
    const level = lines[start].match(/^#+/)![0].length;
    let end = start + 1;
    while (end < lines.length && !(new RegExp(`^#{1,${level}}\\s`).test(lines[end]))) end++;
    return lines.slice(start, end).join("\n").trim();
  }
  return lines.filter(line => line.includes(date)).join("\n");
}

/** All parts share 1,400 characters; a populated board reduces the profile excerpts. */
export async function pinnedContext(question: string, options: PinnedOptions = {}): Promise<string> {
  const directory = resolveVaultPath(options.root ?? process.cwd(), options.vaultPath);
  const now = options.now ?? new Date();
  const [notes, digest] = await Promise.all([
    Promise.all(files.map(file => optionalNote(directory, file))),
    Promise.resolve().then(() => options.boardDigest?.() ?? "").catch(() => ""),
  ]);
  const [about, preferences, tone, schedule, goals] = notes;
  const tomorrow = new Date(`${dayParts(now).date}T17:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const blocks = [
    ...[about, preferences, tone].map((text, i) => ({ label: files[i].slice(0, -3), text, limit: 500 })),
    { label: "Today", text: scheduleSlice(schedule, now), limit: 350 },
    ...( /\btomorrow\b/i.test(question) ? [{ label: "Tomorrow", text: scheduleSlice(schedule, tomorrow), limit: 350 }] : []),
    { label: "Goals", text: goals.split(/\n##\s/)[0], limit: 220 },
    { label: "Life dashboard", text: digest, limit: 900 },
  ].filter(block => block.text.trim());
  const clock = `Current time: ${clockStamp(now)} (America/New_York).\nPinned profile and today:\n`;
  const available = 1400 - clock.length - blocks.reduce((n, b) => n + b.label.length + 5, 0);
  const wanted = blocks.reduce((n, b) => n + Math.min(b.text.length, b.limit), 0);
  return clock + blocks.map(b => `# ${b.label}\n${b.text.slice(0, Math.floor(Math.min(b.text.length, b.limit) * Math.min(1, available / wanted))).trim()}`).join("\n\n");
}
