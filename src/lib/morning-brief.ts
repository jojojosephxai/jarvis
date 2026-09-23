import path from "node:path";

import type { AnswerOptions } from "./grounded-answer";
import { listCalendarEvents } from "./calendar-store";
import type { CalendarEvent, ChatResponse, MorningBrief } from "./types";
import { loadVaultNotes, resolveVaultPath, type VaultLoad, type VaultNote } from "./vault-read";

const MAX_EVENTS = 8;
const MAX_LINES = 8;

export const MAIL_LINE =
  "No mail was read. No overnight email is in the vault or on the demo calendar. Nothing was sent, and nothing is waiting to send.";

const BRIEF_RE =
  /^(?:please\s+)?(?:(?:give me|show(?:\s+me)?|run|open|start)\s+)?(?:my\s+)?(?:the\s+)?(?:morning|daily)\s+brief[.!?]*$/i;

const ASK_RE = /^(?:please\s+)?what(?:'s| is) my (?:morning|daily) brief[.!?]*$/i;

const BRIEF_ME_RE = /^(?:please\s+)?brief me[.!?]*$/i;

const INSTRUCTION_RE =
  /^(add|write|open|choose|select|if|chat|notes in this|the demo calendar|the first|edit|see |set |this page|this note|this folder|these are|these facts|no other|one goal|the school name|on joseph|brain |it reads|a matching|question answers|with no|with an|jarvis|if the|copy )/i;

const PROFILE_RE = /^(name|grade|birthday|school name|email|phone)\s*:/i;

const SIGNAL_RE =
  /\b(due|practice|goal|project|needs|homework|fair|book|swim|soccer|test|quiz|exam|assignment|finish|writeup|lab|board|remind|priority|important|tomorrow|today)\b/i;

const SIMILAR_SKIP = new Set([
  "about",
  "after",
  "board",
  "changes",
  "from",
  "have",
  "how",
  "into",
  "that",
  "the",
  "this",
  "with",
  "your",
]);

export function isMorningBriefRequest(text: string): boolean {
  const clean = text
    .replace(/\s+/g, " ")
    .replace(/^(?:hey|hi|ok|okay|jarvis)[,!\s]+/i, "")
    .trim();
  if (!clean) return false;
  return BRIEF_RE.test(clean) || ASK_RE.test(clean) || BRIEF_ME_RE.test(clean);
}

type ComposeInput = {
  now: Date;
  timeZone?: string;
  events: CalendarEvent[];
  loaded: VaultLoad;
};

export function composeMorningBrief(input: ComposeInput): MorningBrief {
  const heading = formatHeading(input.now, input.timeZone);
  const calendar = calendarSection(input.events);
  const vault = vaultSection(input.loaded);
  const escalate = escalateLine(vault);
  const notice = "Read from the demo calendar and the vault. No mail was read. Grok was not called.";
  const brief: MorningBrief = {
    at: input.now.toISOString(),
    heading,
    calendarEmpty: calendar.calendarEmpty,
    calendarNote: calendar.calendarNote,
    events: calendar.events,
    hiddenEvents: calendar.hiddenEvents,
    vaultThin: vault.vaultThin,
    vaultNote: vault.vaultNote,
    priorities: vault.priorities,
    gaps: vault.gaps,
    checked: vault.checked,
    sources: vault.sources,
    mail: MAIL_LINE,
    escalate,
    reply: "",
    notice,
  };
  brief.reply = formatReply(brief);
  return brief;
}

export async function loadMorningBrief(
  options: { root?: string; vaultPath?: string | null; now?: Date; timeZone?: string } = {},
): Promise<MorningBrief> {
  const root = options.root ?? process.cwd();
  const now = options.now ?? new Date();
  const events = await listCalendarEvents(root);
  const directory = resolveVaultPath(root, options.vaultPath);
  const loaded = await loadVaultNotes(directory);
  return composeMorningBrief({ now, timeZone: options.timeZone, events, loaded });
}

export async function morningBriefResponse(options: AnswerOptions = {}): Promise<ChatResponse> {
  const brief = await loadMorningBrief({
    root: options.root,
    vaultPath: options.vaultPath,
  });
  return {
    reply: brief.reply,
    mode: "demo",
    receipts: [],
    sources: brief.sources,
    notice: brief.notice,
    brief,
  };
}

function formatHeading(now: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(now);
}

function calendarSection(events: CalendarEvent[]): {
  calendarEmpty: boolean;
  calendarNote: string;
  events: { title: string; when: string }[];
  hiddenEvents: number;
} {
  if (events.length === 0) {
    return {
      calendarEmpty: true,
      calendarNote:
        "The demo calendar on this computer is empty. Nothing was read from Apple Calendar or Google Calendar. No events were invented.",
      events: [],
      hiddenEvents: 0,
    };
  }

  const shown = events.slice(0, MAX_EVENTS).map((event) => ({
    title: event.title,
    when: event.when,
  }));
  const hiddenEvents = Math.max(0, events.length - shown.length);
  const noun = events.length === 1 ? "event" : "events";
  const more = hiddenEvents > 0 ? ` Showing ${shown.length} of ${events.length}.` : "";
  return {
    calendarEmpty: false,
    calendarNote: `${events.length} ${noun} saved on the demo calendar on this computer. Times are shown as they were saved. Nothing was read from Apple Calendar or Google Calendar.${more}`,
    events: shown,
    hiddenEvents,
  };
}

function vaultSection(loaded: VaultLoad): {
  vaultThin: boolean;
  vaultNote: string;
  priorities: { note: string; line: string }[];
  gaps: { note: string; field: string }[];
  checked: string[];
  sources: string[];
} {
  if (!loaded.ok) {
    return {
      vaultThin: true,
      vaultNote: `Brain wiring: the vault ${loaded.problem}. No priorities were invented.`,
      priorities: [],
      gaps: [],
      checked: [],
      sources: [],
    };
  }

  const checked = loaded.notes.map((note) => note.title);
  const priorities: { note: string; line: string }[] = [];
  const gaps: { note: string; field: string }[] = [];

  for (const note of loaded.notes) {
    if (isGuide(note)) continue;
    for (const raw of note.text.split(/\r?\n/)) {
      const cleaned = cleanLine(raw);
      if (!cleaned || isHeading(raw) || isInstruction(cleaned) || PROFILE_RE.test(cleaned)) continue;
      const field = blankField(cleaned);
      if (field) {
        if (gaps.length < MAX_LINES) gaps.push({ note: note.title, field });
        continue;
      }
      const bullet = /^[-*]\s+/.test(raw.trim());
      if (!bullet && !SIGNAL_RE.test(cleaned)) continue;
      if (priorities.some((item) => similar(item.line, cleaned))) continue;
      if (priorities.length < MAX_LINES) priorities.push({ note: note.title, line: clip(cleaned, 240) });
    }
  }

  const sources = unique(priorities.map((item) => item.note));
  const vaultThin = priorities.length < 2 || gaps.length > 0;
  return {
    vaultThin,
    vaultNote: vaultCopy(vaultThin, priorities.length, gaps.length),
    priorities,
    gaps,
    checked,
    sources,
  };
}

function vaultCopy(thin: boolean, priorityCount: number, gapCount: number): string {
  if (!thin) return "Priority lines copied from the vault.";
  if (priorityCount === 0) {
    return "The vault is thin. No priority lines were written down. Nothing was invented.";
  }
  if (gapCount > 0) {
    return "The vault is thin. Some lines are still blank, so those were not filled in. Priority lines below are copied from the notes.";
  }
  return "The vault is thin. Only a little is written down. Priority lines below are copied from the notes.";
}

function escalateLine(vault: { vaultThin: boolean; gaps: { note: string; field: string }[]; priorities: { line: string }[]; vaultNote: string }): string | null {
  if (vault.vaultNote.startsWith("Brain wiring:")) {
    return "The vault folder could not be read, so there is nothing to send to Grok. This brief did not call Grok and did not invent priorities.";
  }
  if (!vault.vaultThin) return null;
  const swimTime = vault.gaps.find((gap) => /practice time/i.test(gap.field));
  const example = swimTime ? "Example: What time is swim practice?" : "Example: What is written in Goals?";
  return `This brief did not call Grok. Ask in the talk box if you want Brain to read a note. ${example}`;
}

function formatReply(brief: MorningBrief): string {
  const lines = [`Morning brief — ${brief.heading}`, "", "Demo calendar", brief.calendarNote];
  if (brief.events.length === 0) {
    lines.push("No events are listed.");
  } else {
    for (const event of brief.events) {
      lines.push(`• ${event.title} — ${event.when}`);
    }
  }
  lines.push("", "Vault priorities", brief.vaultNote);
  if (brief.priorities.length === 0) {
    lines.push("No priority lines are listed.");
  } else {
    for (const item of brief.priorities) {
      lines.push(`• ${item.note}: ${item.line}`);
    }
  }
  if (brief.gaps.length > 0) {
    lines.push("", "Not written down");
    for (const gap of brief.gaps) {
      lines.push(`• ${gap.note}: ${gap.field}`);
    }
  }
  lines.push("", "Mail", brief.mail);
  if (brief.checked.length > 0) {
    lines.push("", `Notes checked: ${brief.checked.join(", ")}.`);
  }
  if (brief.escalate) {
    lines.push("", brief.escalate);
  }
  return lines.join("\n");
}

function isGuide(note: VaultNote): boolean {
  return path.basename(note.filePath).toLowerCase() === "readme.md";
}

function isHeading(raw: string): boolean {
  return /^#{1,6}\s/.test(raw.trim());
}

function cleanLine(raw: string): string {
  return raw
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function blankField(cleaned: string): string | null {
  const match = /^([^:]{2,60}):\s*$/.exec(cleaned);
  if (!match?.[1]) return null;
  return match[1].trim();
}

function isInstruction(cleaned: string): boolean {
  return INSTRUCTION_RE.test(cleaned);
}

function similar(left: string, right: string): boolean {
  const a = words(left);
  const b = words(right);
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const word of a) {
    if (b.has(word)) shared += 1;
  }
  return shared >= 4;
}

function words(text: string): Set<string> {
  const found = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(found.filter((word) => word.length > 3 && !SIMILAR_SKIP.has(word)));
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max).trim();
}
