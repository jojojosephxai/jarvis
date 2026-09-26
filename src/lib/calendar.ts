export type CalendarItem = {
  id: string;
  title: string;
  when: string;
};

const KEY = "jarvis-calendar";

export function loadCalendar(): CalendarItem[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      return [];
    }
    return readItems(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function saveCalendar(items: readonly CalendarItem[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

export function describeCalendar(items: readonly CalendarItem[]): string {
  if (items.length === 0) {
    return "The calendar is clear, sir.";
  }
  const lines = items.slice(0, 4).map((item) => `${item.title} on ${item.when}`);
  const extra = items.length > 4 ? ` And ${items.length - 4} more.` : "";
  return `On the calendar, sir: ${lines.join("; ")}.${extra}`;
}

export function focusDeadline(minutes: number): number {
  return Date.now() + minutes * 60_000;
}

export function remainingLabel(ends: number): string {
  return formatClock(ends - Date.now());
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function readItems(value: unknown): CalendarItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item as { id?: unknown; title?: unknown; when?: unknown };
    if (typeof record.id !== "string" || typeof record.title !== "string" || typeof record.when !== "string") {
      return [];
    }
    return [{ id: record.id, title: record.title, when: record.when }];
  });
}
