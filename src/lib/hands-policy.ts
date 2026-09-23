import { assertNever } from "./assert";
import type { HandGate, ToolName } from "./types";

/** Calendar writes run on their own. Send, spend, and delete wait for a yes. A sensitive or large vault rewrite also waits. */
export function gateFor(tool: ToolName, input?: Record<string, string>): HandGate {
  switch (tool) {
    case "calendar.write":
    case "calendar.list":
    case "notes.recall":
    case "browser.open":
    case "browser.task":
      return "auto";
    case "notes.keep":
      return input?.needsConfirm === "yes" ? "confirm" : "auto";
    case "message.send":
    case "money.spend":
    case "calendar.delete":
    case "item.delete":
      return "confirm";
    default:
      return assertNever(tool);
  }
}
