import "server-only";

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type DoNextItem = { task: string; due: string; bot: string };

const MAX_BYTES = 300_000;

function dueTime(due: string): number {
  if (!/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(due)) return Infinity;
  const day = new Date(`${due.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== due.slice(0, 10)) return Infinity;
  const time = Date.parse(due);
  return Number.isFinite(time) ? time : Infinity;
}

export async function loadDoNext(): Promise<{ items: DoNextItem[] } | null> {
  const file = process.env.DO_NEXT_PATH?.trim();
  if (!file || !path.isAbsolute(file)) return null;

  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > MAX_BYTES) return null;
    const bytes = await readFile(file);
    if (bytes.length > MAX_BYTES) return null;
    const input: unknown = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(input)) return null;

    const rows: { item: DoNextItem; time: number }[] = [];
    for (const row of input) {
      if (!row || typeof row !== "object" || Array.isArray(row) ||
        typeof row.task !== "string" || !row.task.trim() ||
        typeof row.bot !== "string" || !row.bot.trim() || typeof row.due !== "string") return null;
      const due = row.due.trim();
      const time = dueTime(due);
      rows.push({ item: { task: row.task.trim(), bot: row.bot.trim(), due: Number.isFinite(time) ? due : "" }, time });
    }
    rows.sort((a, b) => a.time - b.time);
    return { items: rows.slice(0, 6).map(({ item }) => item) };
  } catch {
    return null;
  }
}
