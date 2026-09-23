import { assertNever } from "./assert";
import type { HandGate, ToolName } from "./types";

/** Calendar writes run on their own. Send, spend, and delete wait for a yes. */
export function gateFor(tool: ToolName): HandGate {
  switch (tool) {
    case "calendar.write":
    case "calendar.list":
    case "notes.recall":
    case "notes.keep":
    case "browser.open":
    case "browser.task":
      return "auto";
    case "message.send":
    case "money.spend":
    case "calendar.delete":
    case "item.delete":
      return "confirm";
    default:
      return assertNever(tool);
  }
}
