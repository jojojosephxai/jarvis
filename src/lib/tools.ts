import { assertNever } from "./assert";
import { addCalendarEvent, listCalendarEvents } from "./calendar-store";
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
  "notes.recall": "Search notes",
  "notes.keep": "Save a note",
};

function clip(value: string | undefined, max: number): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trim();
}

function cleanInput(input: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const clipped = clip(value, key === "text" ? 2000 : 240);
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
    outcome: `Saved “${event.title}” for ${event.when} on the demo calendar on this computer. Nothing was sent to a real calendar.`,
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
    case "notes.recall":
      return runRecall(input, root);
    case "notes.keep":
      return runKeep(input, root);
    default:
      return assertNever(tool);
  }
}

export async function executeTool(
  request: ToolRequest,
  root = process.cwd(),
): Promise<Receipt> {
  const at = new Date().toISOString();
  const input = cleanInput(request.input);
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
