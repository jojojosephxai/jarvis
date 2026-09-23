import { assertNever } from "./assert";
import { gateFor } from "./hands-policy";
import { makeId } from "./ids";
import { executeTool } from "./tools";
import type { HandPlan, PlanState, Receipt, ToolName, ToolRequest } from "./types";

export type HandDecision = "yes" | "no";

export type HandResult = {
  reply: string;
  plan: HandPlan;
  receipts: Receipt[];
};

function shown(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

function planCopy(tool: ToolName, input: Record<string, string>): { title: string; steps: string[] } {
  switch (tool) {
    case "calendar.write":
      return {
        title: "Save on the demo calendar",
        steps: [
          `Save “${shown(input.title, "this event")}” for ${shown(input.when, "a time you still need to give")}.`,
          "Calendar writes are auto-approved. No extra yes is required.",
          "The event stays on the demo calendar on this computer. It is not sent to Apple Calendar or Google Calendar.",
        ],
      };
    case "calendar.list":
      return {
        title: "Read the demo calendar",
        steps: [
          "Read events saved on this computer.",
          "This read is auto-approved.",
          "Nothing is loaded from Apple Calendar or Google Calendar.",
        ],
      };
    case "calendar.delete":
      return {
        title: "Delete a demo calendar event",
        steps: [
          `Delete “${shown(input.title, "the named event")}” from the demo calendar.`,
          "Deleting needs your yes. Nothing is removed until you press Yes, do it.",
          "Only the demo calendar on this computer can change.",
        ],
      };
    case "notes.recall":
      return {
        title: "Search notes",
        steps: [
          `Look through local notes for “${shown(input.query, "your words")}”.`,
          "Searching notes is auto-approved.",
          "Notes are read. They are not changed.",
        ],
      };
    case "notes.keep":
      return {
        title: "Save a note",
        steps: [
          "Save the words you gave as a note on this computer.",
          "Saving a note is auto-approved.",
          "The note is not written into an Obsidian vault.",
        ],
      };
    case "browser.open":
      return {
        title: "Open a link",
        steps: [
          `Plan to open ${shown(input.url, "a link")}.`,
          "Browser automation is not running, so the hand will not load the page.",
          "The receipt will say that. The link opens only if you click it yourself.",
        ],
      };
    case "browser.task":
      return {
        title: "Do a web task",
        steps: [
          input.url
            ? `Plan a web task at ${input.url}: ${shown(input.task, "look at the page")}.`
            : `Plan a web task: ${shown(input.task, "look at a page")}.`,
          "Browser automation is not running, so the hand will not click, type, or submit anything.",
          "The receipt will say the task did not run.",
        ],
      };
    case "message.send":
      return {
        title: "Send a message",
        steps: [
          `Ask to send a message to ${shown(input.to, "someone")}.`,
          shown(input.body, "No message body was given."),
          "Sending needs your yes. Typing in the box does not send it.",
          "No mail hand is connected. Even after a yes, the receipt will say nothing was sent and nothing is scheduled.",
        ],
      };
    case "money.spend":
      return {
        title: "Spend money",
        steps: [
          `Ask to spend ${shown(input.amount, "some money")} on ${shown(input.item, "something")}.`,
          "Spending needs your yes. Nothing is charged until you press Yes, do it.",
          "No payment hand is connected. Even after a yes, the receipt will say no money was spent.",
        ],
      };
    case "item.delete":
      return {
        title: "Delete something",
        steps: [
          `Ask to delete ${shown(input.target, "something")}.`,
          "Deleting needs your yes.",
          "This hand does not delete mail, files, or accounts. The receipt will say nothing was removed.",
        ],
      };
    default:
      return assertNever(tool);
  }
}

function makePlan(request: ToolRequest, state: PlanState): HandPlan {
  const copy = planCopy(request.tool, request.input);
  return {
    id: makeId("plan"),
    tool: request.tool,
    title: copy.title,
    steps: copy.steps,
    input: request.input,
    gate: gateFor(request.tool),
    state,
  };
}

function declineReply(tool: ToolName): string {
  switch (tool) {
    case "message.send":
      return "Okay. I did not send it. Nothing left this computer, and nothing is scheduled.";
    case "money.spend":
      return "Okay. I did not spend any money.";
    case "calendar.delete":
      return "Okay. I did not delete the event.";
    case "item.delete":
      return "Okay. I did not delete anything.";
    case "calendar.write":
    case "calendar.list":
    case "notes.recall":
    case "notes.keep":
    case "browser.open":
    case "browser.task":
      return "Okay. I left that alone.";
    default:
      return assertNever(tool);
  }
}

function waitingReply(tool: ToolName): string {
  switch (tool) {
    case "message.send":
      return "Here is the plan. I have not sent anything. Press Yes, do it or No, don't. Typing yes in the box does not send it.";
    case "money.spend":
      return "Here is the plan. I have not spent anything. Press Yes, do it or No, don't.";
    case "calendar.delete":
      return "Here is the plan. I have not deleted the event. Press Yes, do it or No, don't.";
    case "item.delete":
      return "Here is the plan. I have not deleted anything. Press Yes, do it or No, don't.";
    case "calendar.write":
    case "calendar.list":
    case "notes.recall":
    case "notes.keep":
    case "browser.open":
    case "browser.task":
      return "Here is the plan.";
    default:
      return assertNever(tool);
  }
}

function doneReply(receipt: Receipt): string {
  switch (receipt.tool) {
    case "calendar.write":
      if (receipt.status === "failed") return receipt.outcome;
      return `Saved “${receipt.input.title}” for ${receipt.input.when}. Calendar writes are auto-approved. The receipt is below. This stays on the demo calendar on this computer.`;
    case "calendar.list":
      return receipt.outcome;
    case "calendar.delete":
      return receipt.outcome;
    case "notes.recall":
      return receipt.outcome;
    case "notes.keep":
      return "I saved that note. The receipt is below.";
    case "browser.open":
    case "browser.task":
      return "I did not drive a browser. The plan and the receipt are below.";
    case "message.send":
      return "I did not send a message. The receipt is below.";
    case "money.spend":
      return "I did not spend any money. The receipt is below.";
    case "item.delete":
      return receipt.outcome;
    default:
      return assertNever(receipt.tool);
  }
}

function declineReceipt(request: ToolRequest): Receipt {
  return {
    id: makeId("rcp"),
    tool: request.tool,
    title: planCopy(request.tool, request.input).title,
    input: request.input,
    outcome: declineReply(request.tool),
    status: "declined",
    at: new Date().toISOString(),
  };
}

export async function resolveHand(
  request: ToolRequest,
  decision?: HandDecision,
  root = process.cwd(),
): Promise<HandResult> {
  const gate = gateFor(request.tool);

  if (gate === "confirm" && decision === "no") {
    return {
      reply: declineReply(request.tool),
      plan: makePlan(request, "declined"),
      receipts: [declineReceipt(request)],
    };
  }

  if (gate === "confirm" && decision !== "yes") {
    return {
      reply: waitingReply(request.tool),
      plan: makePlan(request, "waiting"),
      receipts: [],
    };
  }

  const receipt = await executeTool(request, root, { approved: true });
  return {
    reply: doneReply(receipt),
    plan: makePlan(request, "approved"),
    receipts: [receipt],
  };
}
