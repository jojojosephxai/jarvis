import { isReactorModel, type ReactorModel } from "@/lib/reactor";

export type ClockPosition = "left" | "right" | "top" | "bottom";
export type HudColor = "cyan" | "gold" | "red";
export type GraphDensity = "dense" | "denser" | "loose";

export type HudAction =
  | { type: "clock"; position: ClockPosition }
  | { type: "color"; color: HudColor }
  | { type: "density"; density: GraphDensity }
  | { type: "armory"; open: boolean }
  | { type: "help"; open: boolean };

export type SuitAction =
  | { type: "read" }
  | { type: "focus-start"; minutes: number }
  | { type: "focus-stop" }
  | { type: "focus-check" }
  | { type: "calendar-check" }
  | { type: "calendar-book"; title: string; when: string }
  | { type: "eyes"; open: boolean }
  | { type: "look" }
  | { type: "see" }
  | { type: "model"; model: ReactorModel };

export type Pending =
  | { kind: "choose-clock" }
  | { kind: "choose-color" }
  | { kind: "choose-density" }
  | { kind: "choose-model" }
  | { kind: "book-title"; when: string | null }
  | { kind: "book-when"; title: string }
  | { kind: "confirm"; action: HudAction };

export type CommandResult =
  | { kind: "ask"; pending: Pending; line: string }
  | { kind: "apply"; action: HudAction; line: string }
  | { kind: "cancel"; line: string }
  | { kind: "quiet"; line: string }
  | { kind: "idle"; line: string }
  | { kind: "note"; mode: "today" | "pull" | "ask"; query: string }
  | { kind: "suit"; action: SuitAction }
  | { kind: "unknown"; line: string };

export const PHRASES: readonly { phrase: string; file: string }[] = [
  { phrase: "move the clock", file: "src/components/hud/HudFrame.tsx" },
  { phrase: "make the graph denser", file: "src/components/graph/BrainGraph.tsx" },
  { phrase: "change the HUD color", file: "src/components/hud/HudFrame.tsx" },
  { phrase: "open the armory", file: "src/components/armory/Armory.tsx" },
  { phrase: "close the armory", file: "src/components/armory/Armory.tsx" },
  { phrase: "show screen help", file: "src/components/help/ScreenHelp.tsx" },
  { phrase: "hide screen help", file: "src/components/help/ScreenHelp.tsx" },
  { phrase: "what's today", file: "src/lib/notes.ts" },
  { phrase: "pull up science", file: "src/components/graph/BrainGraph.tsx" },
  { phrase: "read it out loud", file: "src/lib/speech.ts" },
  { phrase: "be quiet", file: "src/lib/speech.ts" },
  { phrase: "check the calendar", file: "src/lib/calendar.ts" },
  { phrase: "book science fair friday", file: "src/lib/calendar.ts" },
  { phrase: "start a focus timer", file: "src/components/jarvis/JarvisScreen.tsx" },
  { phrase: "open your eyes", file: "src/lib/capture.ts" },
  { phrase: "look at my screen", file: "src/lib/capture.ts" },
  { phrase: "switch to grok 3", file: "src/components/hud/HudFrame.tsx" },
];

const CONFIRM = new Set(["ok", "okay", "change"]);
const STOP = new Set(["stop", "stop it", "cancel", "never mind", "nevermind"]);
const WHEN_WORD =
  /^(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/;

export function normalizeUtterance(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^jarvis\s+/, "");
}

export function isInterrupt(raw: string): boolean {
  return /\b(be quiet|hold on|stop talking|hush|quiet|stop|cancel|never mind|nevermind)\b/.test(raw.toLowerCase());
}

export function interpret(raw: string, pending: Pending | null): CommandResult {
  const text = normalizeUtterance(raw);
  if (!text) {
    return { kind: "unknown", line: "I didn't catch that, sir." };
  }

  if (isQuiet(text)) {
    return { kind: "quiet", line: "Quiet, sir." };
  }

  if (CONFIRM.has(text)) {
    if (pending?.kind === "confirm") {
      return { kind: "apply", action: pending.action, line: applyLine(pending.action) };
    }
    if (pending) {
      return { kind: "ask", pending, line: choiceLine(pending) };
    }
    return { kind: "idle", line: "There is nothing waiting, sir." };
  }

  if (STOP.has(text)) {
    if (!pending) {
      return { kind: "quiet", line: "Quiet, sir." };
    }
    return { kind: "cancel", line: "Stopped, sir. Nothing changed." };
  }

  if (pending) {
    const answered = answerPending(text, pending);
    if (answered) {
      return answered;
    }
  }

  const suit = matchSuit(text);
  if (suit) {
    return suit;
  }

  const hud = matchHud(text);
  if (hud) {
    return hud;
  }

  const note = matchNote(text);
  if (note) {
    return note;
  }

  return {
    kind: "unknown",
    line: "I'm not sure I follow, sir. You can pull up a note, check the calendar, or start a focus timer.",
  };
}

export function applyLine(action: HudAction): string {
  switch (action.type) {
    case "clock":
      return `Done, sir. The clock is on the ${action.position}.`;
    case "color":
      return `Done, sir. The HUD is ${action.color}.`;
    case "density":
      if (action.density === "loose") {
        return "Done, sir. The graph is a little looser.";
      }
      if (action.density === "denser") {
        return "Done, sir. The graph is denser.";
      }
      return "Done, sir. The graph is at its usual density.";
    case "armory":
      return action.open ? "The Armory is open, sir." : "The Armory is closed, sir.";
    case "help":
      return action.open ? "Screen help is up, sir." : "Screen help is hidden, sir.";
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function answerPending(text: string, pending: Pending): CommandResult | null {
  switch (pending.kind) {
    case "choose-clock": {
      const position = readPosition(text);
      if (!position) {
        return null;
      }
      return confirm({ type: "clock", position });
    }
    case "choose-color": {
      const color = readColor(text);
      if (!color) {
        return null;
      }
      return confirm({ type: "color", color });
    }
    case "choose-density": {
      const density = readDensity(text);
      if (!density) {
        return null;
      }
      return confirm({ type: "density", density });
    }
    case "choose-model": {
      const model = readModel(text);
      if (!model) {
        return null;
      }
      return { kind: "suit", action: { type: "model", model } };
    }
    case "book-title": {
      const title = cleanTitle(text);
      if (!title) {
        return null;
      }
      if (pending.when) {
        return { kind: "suit", action: { type: "calendar-book", title, when: pending.when } };
      }
      return {
        kind: "ask",
        pending: { kind: "book-when", title },
        line: "When, sir?",
      };
    }
    case "book-when": {
      const when = cleanTitle(text);
      if (!when) {
        return null;
      }
      return { kind: "suit", action: { type: "calendar-book", title: pending.title, when } };
    }
    case "confirm":
      return null;
    default: {
      const exhaustive: never = pending;
      return exhaustive;
    }
  }
}

function matchSuit(text: string): CommandResult | null {
  if (/^(?:please\s+)?(?:read it(?: out loud)?|read that(?: out loud)?|read the note|read it to me)$/.test(text)) {
    return { kind: "suit", action: { type: "read" } };
  }

  const model = matchModel(text);
  if (model) {
    return model;
  }

  if (/\b(screen|display|monitor)\b/.test(text) && /\b(look|see|watch|what)\b/.test(text)) {
    return { kind: "suit", action: { type: "look" } };
  }

  if (/\bwhat do you see\b/.test(text) || /\bdescribe what you see\b/.test(text)) {
    return { kind: "suit", action: { type: "see" } };
  }

  if (/\b(eyes|camera)\b/.test(text) || /\blook at me\b/.test(text)) {
    const open = !/\b(close|off|shut)\b/.test(text);
    return { kind: "suit", action: { type: "eyes", open } };
  }

  if (isFocus(text)) {
    if (/\b(stop|end|cancel|done)\b/.test(text)) {
      return { kind: "suit", action: { type: "focus-stop" } };
    }
    if (/\b(check|left|remaining|status)\b/.test(text) || text.includes("how long")) {
      return { kind: "suit", action: { type: "focus-check" } };
    }
    const minutes = readMinutes(text) ?? 25;
    return { kind: "suit", action: { type: "focus-start", minutes } };
  }

  if (/\bcalendar\b/.test(text) && /\b(check|what|whats|show|list|read|pull|open)\b/.test(text)) {
    return { kind: "suit", action: { type: "calendar-check" } };
  }

  if (text === "calendar" || /^what(?:'s| is) on (?:my |the )?calendar$/.test(text)) {
    return { kind: "suit", action: { type: "calendar-check" } };
  }

  const booked = matchBook(text);
  if (booked) {
    return booked;
  }

  return null;
}

function matchModel(text: string): CommandResult | null {
  const mentioned = /\b(switch|use|run|change|set)\b/.test(text) || /\bmodel\b/.test(text);
  if (!mentioned || !/\b(grok|model)\b/.test(text)) {
    return null;
  }
  const model = readModel(text);
  if (!model) {
    if (/\bmodel\b/.test(text) || /\bgrok\b/.test(text)) {
      return {
        kind: "ask",
        pending: { kind: "choose-model" },
        line: "Grok 4, Grok 3, or Grok 2, sir?",
      };
    }
    return null;
  }
  return { kind: "suit", action: { type: "model", model } };
}

function matchBook(text: string): CommandResult | null {
  if (text === "book" || text === "schedule") {
    return {
      kind: "ask",
      pending: { kind: "book-title", when: null },
      line: "What should I book, sir?",
    };
  }
  const booked = text.match(/^(?:please\s+)?(?:book|schedule)\s+(.+)$/);
  const placed = text.match(
    /^(?:please\s+)?(?:put|add)\s+(.+?)\s+(?:on|to)\s+(?:my\s+|the\s+)?calendar(?:\s+(.*))?$/,
  );
  const rest = booked?.[1] ?? placed?.[1];
  if (!rest) {
    return null;
  }
  const whenTail = placed?.[2]?.replace(/^(?:for|on)\s+/, "") ?? null;
  const split = splitTitleWhen(rest);
  const when = whenTail ? cleanTitle(whenTail) : split.when;
  const title = split.title;
  if (!title) {
    return {
      kind: "ask",
      pending: { kind: "book-title", when },
      line: "What should I book, sir?",
    };
  }
  if (WHEN_WORD.test(title) && !when) {
    return {
      kind: "ask",
      pending: { kind: "book-title", when: title },
      line: `What should I book for ${title}, sir?`,
    };
  }
  if (!when) {
    return {
      kind: "ask",
      pending: { kind: "book-when", title },
      line: "When, sir?",
    };
  }
  return { kind: "suit", action: { type: "calendar-book", title, when } };
}

function matchHud(text: string): CommandResult | null {
  if (isPull(text)) {
    return null;
  }

  if (text.includes("screen help") || text.includes("help screen")) {
    const open = !/\b(hide|close|dismiss)\b/.test(text);
    return confirm({ type: "help", open });
  }

  if (text.includes("armory") || text.includes("armoury")) {
    if (/\b(close|shut|hide)\b/.test(text)) {
      return confirm({ type: "armory", open: false });
    }
    if (/\bopen\b/.test(text)) {
      return confirm({ type: "armory", open: true });
    }
    return {
      kind: "ask",
      pending: { kind: "confirm", action: { type: "armory", open: true } },
      line: "Open the Armory, sir?",
    };
  }

  if (/\bclock\b/.test(text) && /\b(move|put|place|shift|clock)\b/.test(text)) {
    const position = readPosition(text);
    if (!position) {
      return {
        kind: "ask",
        pending: { kind: "choose-clock" },
        line: "Left, right, top, or bottom, sir?",
      };
    }
    return confirm({ type: "clock", position });
  }

  if (/\b(color|colour)\b/.test(text) || (/\bhud\b/.test(text) && /\b(change|tint|color|colour)\b/.test(text))) {
    const color = readColor(text);
    if (!color) {
      return {
        kind: "ask",
        pending: { kind: "choose-color" },
        line: "Cyan, gold, or red, sir?",
      };
    }
    return confirm({ type: "color", color });
  }

  if (/\bgraph\b/.test(text) && /\b(denser|dense|looser|loose|density)\b/.test(text)) {
    return {
      kind: "ask",
      pending: { kind: "choose-density" },
      line: "Denser, or a little looser, sir?",
    };
  }

  return null;
}

function isPull(text: string): boolean {
  return /^(?:please\s+)?(?:pull up|show me|find)\b/.test(text);
}

function isFocus(text: string): boolean {
  if (/\b(focus timer|pomodoro)\b/.test(text)) {
    return true;
  }
  if (/\bfocus\b/.test(text) && /\b(start|begin|stop|end|check|timer|minute|minutes)\b/.test(text)) {
    return true;
  }
  return /\btimer\b/.test(text) && /\b(start|stop|end|check|focus|set|left)\b/.test(text);
}

function isQuiet(text: string): boolean {
  return /^(?:please\s+)?(?:be quiet|hold on|stop talking|hush|quiet|be still)$/.test(text);
}

function matchNote(text: string): CommandResult | null {
  if (/\bwhat'?s today\b/.test(text) || /\bwhat is today\b/.test(text)) {
    return { kind: "note", mode: "today", query: text };
  }
  const pull = text.match(/^(?:please\s+)?(?:pull up|show me|find|open)\s+(?:the\s+)?(?:note\s+)?(.+)$/);
  if (!pull) {
    if (text.endsWith("?") || /^(who|what|when|where|why|how|tell me|do i)\b/.test(text)) {
      return { kind: "note", mode: "ask", query: text };
    }
    return null;
  }
  const query = pull[1]?.replace(/\s+note$/, "").trim() ?? "";
  if (!query || query === "armory" || query === "screen help") {
    return null;
  }
  return { kind: "note", mode: "pull", query };
}

function confirm(action: HudAction): CommandResult {
  return { kind: "ask", pending: { kind: "confirm", action }, line: confirmLine(action) };
}

function confirmLine(action: HudAction): string {
  switch (action.type) {
    case "clock":
      return `The clock to the ${action.position}, sir?`;
    case "color":
      return `${capitalize(action.color)}, sir?`;
    case "density":
      return action.density === "loose" ? "A little looser, sir?" : "Denser, sir?";
    case "armory":
      return action.open ? "Open the Armory, sir?" : "Close the Armory, sir?";
    case "help":
      return action.open ? "Show screen help, sir?" : "Hide screen help, sir?";
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function choiceLine(pending: Pending): string {
  switch (pending.kind) {
    case "choose-clock":
      return "Left, right, top, or bottom, sir?";
    case "choose-color":
      return "Cyan, gold, or red, sir?";
    case "choose-density":
      return "Denser, or a little looser, sir?";
    case "choose-model":
      return "Grok 4, Grok 3, or Grok 2, sir?";
    case "book-title":
      return pending.when ? `What should I book for ${pending.when}, sir?` : "What should I book, sir?";
    case "book-when":
      return "When, sir?";
    case "confirm":
      return confirmLine(pending.action);
    default: {
      const exhaustive: never = pending;
      return exhaustive;
    }
  }
}

function readPosition(text: string): ClockPosition | null {
  const found: ClockPosition[] = [];
  if (hasWord(text, "left")) {
    found.push("left");
  }
  if (hasWord(text, "right")) {
    found.push("right");
  }
  if (hasWord(text, "top")) {
    found.push("top");
  }
  if (hasWord(text, "bottom")) {
    found.push("bottom");
  }
  if (found.length !== 1) {
    return null;
  }
  return found[0] ?? null;
}

function readColor(text: string): HudColor | null {
  const found: HudColor[] = [];
  if (hasWord(text, "cyan")) {
    found.push("cyan");
  }
  if (hasWord(text, "gold")) {
    found.push("gold");
  }
  if (hasWord(text, "red")) {
    found.push("red");
  }
  if (found.length !== 1) {
    return null;
  }
  return found[0] ?? null;
}

function readDensity(text: string): GraphDensity | null {
  if (text.includes("looser") || text.includes("less dense") || hasWord(text, "loose")) {
    return "loose";
  }
  if (text.includes("denser") || hasWord(text, "dense") || text.includes("tighter")) {
    return "denser";
  }
  return null;
}

function readModel(text: string): ReactorModel | null {
  const compact = text.replace(/\s+/g, "");
  if (compact.includes("grok4") || compact.includes("grok-4")) {
    return "grok-4";
  }
  if (compact.includes("grok3") || compact.includes("grok-3")) {
    return "grok-3";
  }
  if (compact.includes("grok2") || compact.includes("grok-2")) {
    return "grok-2";
  }
  const named = compact.includes("grok") ? null : text;
  if (named && isReactorModel(named)) {
    return named;
  }
  return null;
}

function readMinutes(text: string): number | null {
  const match = text.match(/\b(\d{1,3})\b/);
  if (!match?.[1]) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 1 || value > 180) {
    return null;
  }
  return value;
}

function splitTitleWhen(rest: string): { title: string; when: string | null } {
  const forOn = rest.match(/^(.*?)\s+(?:for|on)\s+(.+)$/);
  if (forOn?.[1] && forOn[2]) {
    return { title: cleanTitle(forOn[1]), when: cleanTitle(forOn[2]) };
  }
  const parts = rest.split(" ").filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && WHEN_WORD.test(last) && parts.length > 1) {
    return { title: cleanTitle(parts.slice(0, -1).join(" ")), when: last };
  }
  return { title: cleanTitle(rest), when: null };
}

function cleanTitle(value: string): string {
  return value.replace(/^(?:a|an|the|my)\s+/, "").trim();
}

function hasWord(text: string, word: string): boolean {
  return text.split(" ").includes(word);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
