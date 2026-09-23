import { assertNever } from "./assert";
import { addCalendarEvent, listCalendarEvents, removeCalendarEventsByTitle } from "./calendar-store";
import { gateFor } from "./hands-policy";
import { safeHttpUrl } from "./http-url";
import { makeId } from "./ids";
import { keepNote, searchMemory } from "./memory";
import type { Receipt, ToolName, ToolRequest } from "./types";

type ToolOutcome = {
  outcome: string;
  status: Receipt["status"];
};

const TOOL_TITLES: Record<ToolName, string> = {
  "calendar.write": "Save on the demo calendar",
  "calendar.list": "Read the demo calendar",
  "calendar.delete": "Delete a demo calendar event",
  "notes.recall": "Search notes",
  "notes.keep": "Save a note",
  "browser.open": "Open a link",
  "browser.task": "Do a web task",
  "message.send": "Send a message",
  "money.spend": "Spend money",
  "item.delete": "Delete something",
};

function clip(value: string | undefined, max: number): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trim();
}

function fieldMax(key: string): number {
  if (key === "text" || key === "body" || key === "task") return 2000;
  if (key === "url") return 500;
  return 240;
}

function cleanInput(input: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const clipped = clip(value, fieldMax(key));
    if (clipped) next[key] = clipped;
  }
  return next;
}

async function runCalendarWrite(
  input: Record<string, string>,
  root: string,
): Promise<ToolOutcome> {
  const title = clip(input.title, 180);
  const when = clip(input.when, 120);
  if (!title || !when) {
    return {
      status: "failed",
      outcome: "I need an event name and a time before I can save it.",
    };
  }
  const event = await addCalendarEvent(
    { title, when, detail: clip(input.detail, 400) },
    root,
  );
  return {
    status: "demo",
    outcome: `Auto-approved. Saved “${event.title}” for ${event.when} on the demo calendar on this computer. Nothing was sent to Apple Calendar or Google Calendar.`,
  };
}

async function runCalendarList(root: string): Promise<ToolOutcome> {
  const events = await listCalendarEvents(root);
  if (events.length === 0) {
    return {
      status: "demo",
      outcome: "The demo calendar is empty. Nothing was read from a real calendar.",
    };
  }
  const lines = events
    .slice(0, 8)
    .map((event) => `• ${event.title} — ${event.when}`)
    .join("\n");
  return {
    status: "demo",
    outcome: `${events.length} event${events.length === 1 ? "" : "s"} on the demo calendar:\n${lines}`,
  };
}

async function runRecall(
  input: Record<string, string>,
  root: string,
): Promise<ToolOutcome> {
  const query = clip(input.query, 180);
  if (!query) {
    return { status: "failed", outcome: "Tell me what to look for in your notes." };
  }
  const result = await searchMemory(query, { root });
  const storeLabel = result.stores.includes("obsidian-vault")
    ? "local notes and the Obsidian folder"
    : "local notes";
  if (result.hits.length === 0) {
    const extra = result.note ? ` ${result.note}` : "";
    return {
      status: "done",
      outcome: `No notes matched “${query}”. I looked through ${storeLabel}.${extra}`,
    };
  }
  const lines = result.hits
    .map((hit) => `• ${hit.title} (${hit.source === "obsidian-vault" ? "vault" : "local"}): ${hit.excerpt}`)
    .join("\n");
  const extra = result.note ? `\n${result.note}` : "";
  return {
    status: "done",
    outcome: `Found ${result.hits.length} note${result.hits.length === 1 ? "" : "s"} for “${query}” in ${storeLabel}.\n${lines}${extra}`,
  };
}

async function runCalendarDelete(
  input: Record<string, string>,
  root: string,
): Promise<ToolOutcome> {
  const title = clip(input.title, 180);
  if (!title) {
    return { status: "failed", outcome: "Tell me which demo calendar event to delete." };
  }
  const removed = await removeCalendarEventsByTitle(title, root);
  if (removed.length === 0) {
    return {
      status: "failed",
      outcome: `No demo calendar event is named “${title}”. I did not delete anything else.`,
    };
  }
  const names = removed.map((event) => `“${event.title}” (${event.when})`).join(", ");
  return {
    status: "done",
    outcome: `Deleted ${removed.length} demo calendar event${removed.length === 1 ? "" : "s"}: ${names}. Only the demo calendar on this computer changed.`,
  };
}

async function runBrowserOpen(input: Record<string, string>): Promise<ToolOutcome> {
  const href = safeHttpUrl(input.url);
  if (!href) {
    return {
      status: "failed",
      outcome: "I did not open a browser. I need an http or https link, and browser automation is not running.",
    };
  }
  return {
    status: "stub",
    outcome: `Browser automation is not running. I did not open a window, load ${href}, or sign in anywhere. Nothing was clicked or submitted. The link is on the plan if you want to open it yourself.`,
  };
}

async function runBrowserTask(input: Record<string, string>): Promise<ToolOutcome> {
  const task = clip(input.task, 400) || "the web task";
  const href = safeHttpUrl(input.url);
  const where = href ? ` at ${href}` : "";
  return {
    status: "stub",
    outcome: `Browser automation is not running. I did not do “${task}”${where}. I did not open a page, fill a form, or submit anything.`,
  };
}

async function runSend(input: Record<string, string>): Promise<ToolOutcome> {
  const to = clip(input.to, 120) || "someone";
  const body = clip(input.body, 500);
  const lines = [
    "No mail hand is connected, so I did not send this.",
    `To: ${to}.`,
    body ? `Message: ${body}` : "There was no message body.",
    "Nothing left this computer. Nothing is queued for later, including overnight.",
  ];
  return { status: "stub", outcome: lines.join("\n") };
}

async function runSpend(input: Record<string, string>): Promise<ToolOutcome> {
  const amount = clip(input.amount, 40) || "any money";
  const item = clip(input.item, 180);
  const onItem = item ? ` on ${item}` : "";
  return {
    status: "stub",
    outcome: `No payment hand is connected, so I did not spend ${amount}${onItem}. No card was charged and no order was placed.`,
  };
}

async function runItemDelete(input: Record<string, string>): Promise<ToolOutcome> {
  const target = clip(input.target, 180) || "that";
  return {
    status: "stub",
    outcome: `I do not delete mail, files, or accounts. I did not delete “${target}”. Nothing was removed.`,
  };
}

function blockedOutcome(tool: ToolName): string {
  switch (tool) {
    case "message.send":
      return "Stopped. Sending needs a yes first. I did not send a message, and nothing is scheduled.";
    case "money.spend":
      return "Stopped. Spending needs a yes first. I did not spend money.";
    case "calendar.delete":
      return "Stopped. Deleting needs a yes first. I did not delete the event.";
    case "item.delete":
      return "Stopped. Deleting needs a yes first. I did not delete anything.";
    case "calendar.write":
    case "calendar.list":
    case "notes.recall":
    case "notes.keep":
    case "browser.open":
    case "browser.task":
      return "Stopped. This hand was asked to wait, so nothing ran.";
    default:
      return assertNever(tool);
  }
}

async function runKeep(
  input: Record<string, string>,
  root: string,
): Promise<ToolOutcome> {
  const text = clip(input.text, 2000);
  if (!text) {
    return { status: "failed", outcome: "I need the words to save before I can write a note." };
  }
  await keepNote(text, root);
  return {
    status: "done",
    outcome: "Saved a note on this computer. It was not written into an Obsidian vault.",
  };
}

async function runNamed(
  tool: ToolName,
  input: Record<string, string>,
  root: string,
): Promise<ToolOutcome> {
  switch (tool) {
    case "calendar.write":
      return runCalendarWrite(input, root);
    case "calendar.list":
      return runCalendarList(root);
    case "calendar.delete":
      return runCalendarDelete(input, root);
    case "notes.recall":
      return runRecall(input, root);
    case "notes.keep":
      return runKeep(input, root);
    case "browser.open":
      return runBrowserOpen(input);
    case "browser.task":
      return runBrowserTask(input);
    case "message.send":
      return runSend(input);
    case "money.spend":
      return runSpend(input);
    case "item.delete":
      return runItemDelete(input);
    default:
      return assertNever(tool);
  }
}

export async function executeTool(
  request: ToolRequest,
  root = process.cwd(),
  options?: { approved?: boolean },
): Promise<Receipt> {
  const at = new Date().toISOString();
  const input = cleanInput(request.input);
  if (gateFor(request.tool) === "confirm" && options?.approved !== true) {
    return {
      id: makeId("rcp"),
      tool: request.tool,
      title: TOOL_TITLES[request.tool],
      input,
      outcome: blockedOutcome(request.tool),
      status: "blocked",
      at,
    };
  }
  try {
    const result = await runNamed(request.tool, input, root);
    return {
      id: makeId("rcp"),
      tool: request.tool,
      title: TOOL_TITLES[request.tool],
      input,
      outcome: result.outcome,
      status: result.status,
      at,
    };
  } catch {
    return {
      id: makeId("rcp"),
      tool: request.tool,
      title: TOOL_TITLES[request.tool],
      input,
      outcome: "The tool stopped before it finished.",
      status: "failed",
      at,
    };
  }
}
