import { parseGraphCommand, type GraphCommand } from "./graph-command";
import { safeHttpUrl } from "./http-url";
import { isToolName, type ToolRequest } from "./types";

export type ParsedTurn =
  | { kind: "tool"; request: ToolRequest }
  | { kind: "graph"; command: GraphCommand }
  | { kind: "refuse-call" }
  | { kind: "changes" }
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
  /^(?:please\s+)?(?:remember(?:\s+this|\s+that)?|don'?t forget(?:\s+that)?|note(?:\s+that|\s+this)?|write(?:\s+this|\s+that)?\s+down|save(?:\s+a)?\s+note|keep(?:\s+a)?\s+note|add(?:\s+this)?\s+to(?:\s+my)?\s+(?:notes|preferences)(?:\s+that)?|update(?:\s+my)?\s+preferences(?:\s+to)?)\s*[:\-]?\s+(.+)$/i;

const CHANGES_RE =
  /^(?:please\s+)?(?:what(?:'s|\s+is|\s+has)?\s+changed|what\s+changed|what\s+did\s+you\s+(?:change|write|save|update|remember)|what\s+did\s+i\s+(?:change|edit|update)|show(?:\s+me)?\s+what\s+changed)(?:\s+in\s+(?:the\s+|my\s+)?(?:notes|vault|obsidian))?[?.!]*$/i;

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

const SEND_RE =
  /^(?:please\s+)?(?:can you\s+)?(?:send(?:\s+an?)?\s+(?:email|e-mail|message|text)|email|e-mail|text)\b\s*(.*)$/i;

const SPEND_RE = /^(?:please\s+)?(?:can you\s+)?(?:spend|pay|purchase|buy)\b\s*(.*)$/i;

const DELETE_RE = /^(?:please\s+)?(?:can you\s+)?(?:delete|remove|erase)\b\s+(.+)$/i;

const BROWSER_RE =
  /^(?:please\s+)?(?:can you\s+)?(?:open|browse(?:\s+to)?|go\s+to|visit|pull\s+up)\s+(.+)$/i;

function findUrl(text: string): { raw: string; href: string } | null {
  const explicit = text.match(/https?:\/\/[^\s<>"']+/i);
  const bare = explicit ? null : text.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/i);
  const matched = explicit?.[0] ?? bare?.[0];
  if (!matched) return null;
  const raw = matched.replace(/[),.;!?]+$/g, "");
  const href = safeHttpUrl(raw);
  if (!href) return null;
  return { raw, href };
}

function parseSend(clean: string): ToolRequest | null {
  const match = SEND_RE.exec(clean);
  if (!match) return null;
  const rest = (match[1] ?? "").trim();
  let to = "unspecified";
  let body = rest;
  const directed = /^(?:to\s+)?(.+?)\s+(?:that|about|saying)\s+(.+)$/i.exec(rest);
  const addressed = /^(me|him|her|them)\b\s*(.*)$/i.exec(rest);
  if (directed) {
    to = directed[1].replace(/^to\s+/i, "").trim();
    body = directed[2].trim();
  } else if (addressed) {
    to = addressed[1].toLowerCase();
    body = addressed[2].trim();
  } else if (/^to\s+\S+/i.test(rest)) {
    to = rest.replace(/^to\s+/i, "").trim();
    body = "";
  }
  return {
    tool: "message.send",
    input: { to: clip(to, 120), body: clip(body, 500) },
  };
}

function parseSpend(clean: string): ToolRequest | null {
  const match = SPEND_RE.exec(clean);
  if (!match) return null;
  const rest = (match[1] ?? "").trim();
  const amountMatch = rest.match(/\$\s?\d+(?:\.\d{2})?|\b\d+(?:\.\d{2})?\s*(?:dollars|bucks)\b/i);
  const amount = amountMatch?.[0]?.replace(/\s+/g, " ").trim() || "unspecified";
  let item = rest;
  if (amountMatch?.[0]) item = item.replace(amountMatch[0], " ");
  item = item.replace(/\s+/g, " ").trim().replace(/^(?:for|on)\s+/i, "").trim();
  return {
    tool: "money.spend",
    input: { amount, item: clip(item, 180) || "unspecified" },
  };
}

function parseDelete(clean: string): ToolRequest | null {
  const match = DELETE_RE.exec(clean);
  if (!match?.[1]) return null;
  const rest = match[1].trim();
  if (/\b(?:calendar|schedule)\b/i.test(rest)) {
    const title = rest
      .replace(/\b(?:from|on|off)\s+(?:my\s+|the\s+)?(?:calendar|schedule)\b/gi, " ")
      .replace(/\b(?:event|appointment)\b/gi, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s,.:-]+|[\s,.:-]+$/g, "");
    return {
      tool: "calendar.delete",
      input: { title: clip(title, 180) },
    };
  }
  return {
    tool: "item.delete",
    input: { target: clip(rest, 180) },
  };
}

function parseBrowser(clean: string): ToolRequest | null {
  const match = BROWSER_RE.exec(clean);
  if (!match?.[1]) return null;
  const rest = match[1].trim();
  const found = findUrl(rest);
  if (/\bcalendar\b/i.test(rest) && !found) {
    return { tool: "calendar.list", input: {} };
  }
  if (found) {
    const leftover = rest
      .replace(found.raw, " ")
      .replace(/^(?:and|then)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const words = leftover.split(" ").filter(Boolean);
    const looksLikeTask =
      words.length >= 3 || /\b(read|click|fill|search|tell|check|sign|log|download|submit)\b/i.test(leftover);
    if (!looksLikeTask) {
      return { tool: "browser.open", input: { url: found.href } };
    }
    return {
      tool: "browser.task",
      input: { url: found.href, task: clip(leftover || rest, 400) },
    };
  }
  return { tool: "browser.task", input: { task: clip(rest, 400) } };
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
  if (CHANGES_RE.test(clean)) return { kind: "changes" };
  const graph = parseGraphCommand(clean);
  if (graph) return { kind: "graph", command: graph };

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

  const send = parseSend(clean);
  if (send) return { kind: "tool", request: send };

  const spend = parseSpend(clean);
  if (spend) return { kind: "tool", request: spend };

  const remove = parseDelete(clean);
  if (remove) return { kind: "tool", request: remove };

  const browser = parseBrowser(clean);
  if (browser) return { kind: "tool", request: browser };

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
