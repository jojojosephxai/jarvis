import { matchingNodes } from "./graph-nav";
import type { GraphNode } from "./note-graph";

export type GraphCommand =
  | { action: "filter"; hub: string }
  | { action: "search"; query: string }
  | { action: "focus"; target: string }
  | { action: "clear" };

export type GraphDirective = {
  action: GraphCommand["action"];
  value: string;
};

const HUBS = ["school", "swim", "jarvis", "health", "people", "journal", "projects", "me"] as const;

const CLEAR_RE = /^(?:please\s+)?(?:clear|reset)(?:\s+the)?\s+(?:graph\s+)?filter$/i;
const FILTER_RE = /^(?:please\s+)?filter(?:\s+(?:the\s+)?graph)?\s+(?:to|by|on)\s+(.+)$/i;
const SEARCH_RE = /^(?:please\s+)?search(?:\s+(?:the\s+)?(?:graph|notes))?\s+for\s+(.+)$/i;
const FOCUS_RE = /^(?:please\s+)?focus(?:\s+on)?\s+(.+)$/i;
const SHOW_RE = /^(?:please\s+)?show(?:\s+me)?(?:\s+my)?\s+(.+?)\s+notes$/i;

function tidy(value: string): string {
  return value.replace(/[?.!]+$/g, "").replace(/^[\s"'“”]+|[\s"'“”]+$/g, "").trim();
}

export function hubLabel(raw: string): string {
  const key = tidy(raw).toLowerCase();
  const hit = HUBS.find((hub) => key === hub);
  if (!hit) return tidy(raw);
  return hit.slice(0, 1).toUpperCase() + hit.slice(1);
}

export function parseGraphCommand(text: string): GraphCommand | null {
  const clean = text.replace(/\s+/g, " ").replace(/^(?:hey|hi|ok|okay|jarvis)[,!\s]+/i, "").trim();
  if (!clean) return null;
  if (CLEAR_RE.test(clean)) return { action: "clear" };
  const filter = FILTER_RE.exec(clean);
  if (filter?.[1]) return { action: "filter", hub: hubLabel(filter[1]) };
  const search = SEARCH_RE.exec(clean);
  if (search?.[1]) return { action: "search", query: tidy(search[1]) };
  const show = SHOW_RE.exec(clean);
  if (show?.[1]) return { action: "filter", hub: hubLabel(show[1]) };
  const focus = FOCUS_RE.exec(clean);
  if (focus?.[1]) return { action: "focus", target: tidy(focus[1]) };
  return null;
}

function findHub(nodes: GraphNode[], title: string): GraphNode | undefined {
  const wanted = title.trim().toLowerCase();
  if (wanted === "me / jarvis") {
    return nodes.find((node) => node.kind === "folder" && node.title.toLowerCase() === "me");
  }
  return nodes.find((node) => node.kind === "folder" && node.title.toLowerCase() === wanted);
}

export function describeGraphCommand(command: GraphCommand, nodes: GraphNode[]): { reply: string; directive: GraphDirective } {
  switch (command.action) {
    case "clear":
      return { reply: "Filter cleared", directive: { action: "clear", value: "" } };
    case "filter": {
      const hub = findHub(nodes, command.hub);
      if (!hub) {
        return { reply: `I don't see a ${command.hub} hub`, directive: { action: "filter", value: command.hub } };
      }
      const members = nodes.filter((node) => node.hubs.includes(hub.id) && node.id.endsWith(".md") && !node.root).length;
      const count = members + (hub.file ? 1 : 0);
      const noun = count === 1 ? "note" : "notes";
      return { reply: `Showing ${count} ${hub.title} ${noun}`, directive: { action: "filter", value: hub.title } };
    }
    case "search": {
      const found = matchingNodes(nodes, command.query);
      return {
        reply: `Showing ${found.length} notes for ${command.query}`,
        directive: { action: "search", value: command.query },
      };
    }
    case "focus": {
      const hub = findHub(nodes, command.target);
      const note =
        hub ??
        nodes.find((node) => node.title.toLowerCase() === command.target.toLowerCase()) ??
        matchingNodes(nodes, command.target)[0];
      if (!note) {
        return { reply: `I can't find ${command.target}`, directive: { action: "focus", value: command.target } };
      }
      return { reply: `Focused on ${note.title}`, directive: { action: "focus", value: note.title } };
    }
    default: {
      const neverCommand: never = command;
      return neverCommand;
    }
  }
}
