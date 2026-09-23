import { promises as fs } from "node:fs";
import path from "node:path";

import { makeId } from "./ids";
import type { CalendarEvent } from "./types";

const MAX_EVENTS = 50;

function calendarFile(root: string): string {
  return path.join(root, "data", "calendar.json");
}

export async function listCalendarEvents(root = process.cwd()): Promise<CalendarEvent[]> {
  try {
    const raw = await fs.readFile(calendarFile(root), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCalendarEvent);
  } catch {
    return [];
  }
}

export async function addCalendarEvent(
  input: { title: string; when: string; detail?: string },
  root = process.cwd(),
): Promise<CalendarEvent> {
  const events = await listCalendarEvents(root);
  const event: CalendarEvent = {
    id: makeId("evt"),
    title: input.title.trim(),
    when: input.when.trim(),
    detail: input.detail?.trim() ?? "",
    createdAt: new Date().toISOString(),
  };
  const next = [event, ...events].slice(0, MAX_EVENTS);
  const file = calendarFile(root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(next, null, 2), "utf8");
  return event;
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<CalendarEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.title === "string" &&
    typeof event.when === "string" &&
    typeof event.detail === "string" &&
    typeof event.createdAt === "string"
  );
}
