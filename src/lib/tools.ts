import { assertNever } from "./assert";
import { addCalendarEvent, removeCalendarEventsByTitle } from "./calendar-store";
import { gateFor } from "./hands-policy";
import { safeHttpUrl } from "./http-url";
import { makeId } from "./ids";
import { searchMemory } from "./memory";
import type { Receipt, ToolName, ToolRequest } from "./types";
import { resolveVaultPath } from "./vault-read";
import { commitVaultWrite } from "./vault-write";

type ToolOutcome = {
  outcome: string;
  status: Receipt["status"];
  file?: string;
};

const TOOL_TITLES: Record<ToolName, string> = {
  "calendar.write": "Save an event on this computer",
  "calendar.list": "Calendar",
  "calendar.delete": "Delete a saved event",
  "notes.recall": "Search notes",
  "notes.keep": "Update a vault note",
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
    outcome: `Auto-approved. Saved “${event.title}” for ${event.when} on this computer. No calendar is connected.`,
  };
}

async function runCalendarList(_root: string): Promise<ToolOutcome> {
  return {
    status: "demo",
    outcome: "Calendar not connected.",
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
    return { status: "failed", outcome: "Tell me which saved event to delete." };
  }
  const removed = await removeCalendarEventsByTitle(title, root);
  if (removed.length === 0) {
    return {
      status: "failed",
      outcome: `No saved event is named “${title}”. I did not delete anything else.`,
    };
  }
  const names = removed.map((event) => `“${event.title}” (${event.when})`).join(", ");
  return {
    status: "done",
    outcome: `Deleted ${removed.length} saved event${removed.length === 1 ? "" : "s"}: ${names}. No calendar is connected. Only the copy on this computer changed.`,
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
    case "notes.keep":
      return "Stopped. This write needs a yes first. I did not change the vault.";
    case "calendar.write":
    case "calendar.list":
    case "notes.recall":
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
  approved: boolean,
  vaultDir?: string,
): Promise<ToolOutcome> {
  const text = clip(input.text, 2000);
  if (!text) {
    return { status: "failed", outcome: "I need the words to save before I can write a note." };
  }
  const result = await commitVaultWrite(
    root,
    vaultDir ?? resolveVaultPath(root),
    { ...input, text },
    approved,
  );
  return { status: result.status, outcome: result.outcome, file: result.file };
}

async function runNamed(
  tool: ToolName,
  input: Record<string, string>,
  root: string,
  approved: boolean,
  vaultDir?: string,
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
      return runKeep(input, root, approved, vaultDir);
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

function receiptFields(tool: ToolName, input: Record<string, string>): Record<string, string> {
  if (tool !== "notes.keep") return input;
  const file = input.file?.trim();
  return file ? { file } : {};
}

export async function executeTool(
  request: ToolRequest,
  root = process.cwd(),
  options?: { approved?: boolean; vaultDir?: string },
): Promise<Receipt> {
  const at = new Date().toISOString();
  const input = cleanInput(request.input);
  const shown = receiptFields(request.tool, input);
  if (gateFor(request.tool, input) === "confirm" && options?.approved !== true) {
    return {
      id: makeId("rcp"),
      tool: request.tool,
      title: TOOL_TITLES[request.tool],
      input: shown,
      outcome: blockedOutcome(request.tool),
      status: "blocked",
      at,
    };
  }
  try {
    const result = await runNamed(request.tool, input, root, options?.approved === true, options?.vaultDir);
    return {
      id: makeId("rcp"),
      tool: request.tool,
      title: TOOL_TITLES[request.tool],
      input: result.file ? { file: result.file } : shown,
      outcome: result.outcome,
      status: result.status,
      at,
    };
  } catch {
    return {
      id: makeId("rcp"),
      tool: request.tool,
      title: TOOL_TITLES[request.tool],
      input: shown,
      outcome: "The tool stopped before it finished.",
      status: "failed",
      at,
    };
  }
}
