import { isToolName, type ToolRequest } from "./types";

export type ParsedTurn =
  | { kind: "tool"; request: ToolRequest }
  | { kind: "refuse-call" }
  | { kind: "chat" };

const DAY =
  "(?:today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
const CLOCK = "\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?";
const WHEN_RE = new RegExp(
  `\\b(?:${DAY}(?:\\s+at)?\\s+${CLOCK}|${DAY}|at\\s+${CLOCK})\\b`,
  "i",
);

const PHONE_RE =
  /^(?:please\s+)?(?:can you\s+)?(?:place\s+a\s+)?(?:phone\s+call|call|phone|dial|ring)\b/i;

const KEEP_RE =
  /^(?:please\s+)?(?:remember(?:\s+that)?|note(?:\s+this)?|save(?:\s+a)?\s+note|keep(?:\s+a)?\s+note)\s*[:\-]?\s+(.+)$/i;

const RECALL_RE =
  /^(?:please\s+)?(?:what do my notes say(?:\s+about)?|what(?:'s| is) in my notes(?:\s+about)?|search(?:\s+my)?\s+notes(?:\s+for)?|look(?:\s+it)?\s+up in(?:\s+my)?\s+notes|recall|what did i (?:write|note) about)\b\s*(.*)$/i;

const LIST_RE =
  /^(?:please\s+)?(?:what(?:'s| is) on my calendar|show(?:\s+me)? my calendar|what(?:'s| is) my schedule|what do i have on my calendar)\b/i;

const CALENDAR_HINT_RE = /\b(calendar|schedule|appointment|remind me)\b/i;
const DIRECT_WRITE_RE = /^(?:please\s+)?(?:can you\s+)?(?:put|add|book)\b/i;
const WRITE_LEAD_RE =
  /^(?:please\s+)?(?:can you\s+)?(?:put|add|schedule|book|remind me to|remind me about|remind me)\s+/i;

function normalize(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^(?:hey|hi|ok|okay|jarvis)[,!\s]+/i, "")
    .trim();
}

export function mentionsCalendar(text: string): boolean {
  return CALENDAR_HINT_RE.test(normalize(text));
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trim();
}

function extractWhen(text: string): string {
  const match = WHEN_RE.exec(text);
  return match ? match[0].replace(/\s+/g, " ").trim() : "";
}

function calendarTitle(text: string, when: string): string {
  let title = text.replace(WRITE_LEAD_RE, "");
  title = title.replace(/\b(?:on|to)\s+my\s+calendar\b/gi, " ");
  title = title.replace(/\b(?:on|to)\s+the\s+calendar\b/gi, " ");
  if (when) {
    title = title.replace(when, " ");
  }
  title = title.replace(/\s+/g, " ").replace(/^[\s,.:-]+|[\s,.:-]+$/g, "");
  return clip(title, 180);
}

function recallQuery(rest: string): string {
  return clip(
    rest
      .replace(/[?!.]+$/g, "")
      .replace(/^(?:about|for|on|the)\s+/i, "")
      .trim(),
    180,
  );
}

export function parseIntent(text: string): ParsedTurn {
  const clean = normalize(text);
  if (!clean) return { kind: "chat" };

  if (PHONE_RE.test(clean)) return { kind: "refuse-call" };

  const keep = KEEP_RE.exec(clean);
  if (keep?.[1]) {
    return {
      kind: "tool",
      request: {
        tool: "notes.keep",
        input: { text: clip(keep[1], 2000) },
      },
    };
  }

  const recall = RECALL_RE.exec(clean);
  if (recall) {
    return {
      kind: "tool",
      request: {
        tool: "notes.recall",
        input: { query: recallQuery(recall[1] ?? "") },
      },
    };
  }

  if (LIST_RE.test(clean)) {
    return { kind: "tool", request: { tool: "calendar.list", input: {} } };
  }

  const when = extractWhen(clean);
  if (CALENDAR_HINT_RE.test(clean) || (DIRECT_WRITE_RE.test(clean) && when)) {
    const title = calendarTitle(clean, when);
    if (when && title) {
      return {
        kind: "tool",
        request: {
          tool: "calendar.write",
          input: { title, when },
        },
      };
    }
  }

  return { kind: "chat" };
}

export type ToolJsonParse =
  | { kind: "none" }
  | { kind: "call"; request: ToolRequest }
  | { kind: "unknown"; name: string };

function stringRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry.trim();
    else if (typeof entry === "number" || typeof entry === "boolean") {
      out[key] = String(entry);
    } else {
      return null;
    }
  }
  return out;
}

export function parseToolJson(text: string): ToolJsonParse {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return { kind: "none" };

  let value: unknown;
  try {
    value = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return { kind: "none" };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { kind: "none" };
  }

  const record = value as { tool?: unknown; input?: unknown };
  if (typeof record.tool !== "string") return { kind: "none" };
  if (!isToolName(record.tool)) return { kind: "unknown", name: record.tool };

  const input = stringRecord(record.input ?? {});
  if (!input) return { kind: "none" };

  return { kind: "call", request: { tool: record.tool, input } };
}
