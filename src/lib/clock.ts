const ZONE = "America/New_York";

const CLOCK_RE =
  /^(?:what(?:'s| is) the time(?: now)?|what time is it(?: now)?|do you (?:know|have) the time(?: now)?|tell me the time)$/i;
const DATE_RE =
  /^(?:what(?:'s| is) (?:the |today'?s )?date(?: today)?|what day is it(?: today)?|what(?:'s| is) today)$/i;
const SMALL_RE =
  /^(?:hi|hey|hello|good morning|good afternoon|good evening|how are you|thanks|thank you)(?: there)?$/i;

function tidy(text: string): string {
  return text.replace(/[?.!]+$/g, "").replace(/\s+/g, " ").trim();
}

export function clockStamp(now = new Date(), timeZone = ZONE): string {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);
  return `${date}, ${time}`;
}

export function isClockQuestion(text: string): "time" | "date" | null {
  const clean = tidy(text);
  if (CLOCK_RE.test(clean)) return "time";
  if (DATE_RE.test(clean)) return "date";
  return null;
}

export function isSmallTalk(text: string): boolean {
  return SMALL_RE.test(tidy(text));
}

/** Greetings, the clock, and short questions use the fast model. Vault lookups stay on the hard model. */
export function isQuickAsk(text: string): boolean {
  const clean = tidy(text);
  if (!clean) return false;
  if (isClockQuestion(clean) || isSmallTalk(clean)) return true;
  const words = clean.split(" ").filter(Boolean);
  if (words.length > 8) return false;
  if (/\b(calendar|schedule|remind|remember|vault|search|filter|focus|swim|school|practice)\b/i.test(clean)) return false;
  return clean.endsWith("?") || words.length <= 4;
}

export function localClockReply(kind: "time" | "date", now = new Date()): string {
  if (kind === "date") {
    const date = new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE,
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(now);
    return `It's ${date}.`;
  }
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  return `It's ${time} Eastern.`;
}

/** Sentences that already ended, plus the unfinished tail still arriving. */
export function readySentences(buffer: string): { ready: string[]; rest: string } {
  const ready: string[] = [];
  let index = 0;
  for (let cursor = 0; cursor < buffer.length; cursor += 1) {
    const ch = buffer[cursor];
    if (ch !== "." && ch !== "?" && ch !== "!") continue;
    const next = buffer[cursor + 1];
    if (next === undefined || !/\s/.test(next)) continue;
    const sentence = buffer.slice(index, cursor + 1).trim();
    if (sentence) ready.push(sentence);
    index = cursor + 1;
  }
  return { ready, rest: buffer.slice(index) };
}
