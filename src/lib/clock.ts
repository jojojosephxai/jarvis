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

/** Only clearly general chat bypasses grounding. Ambiguous follow-ups keep their context. */
export function isQuickAsk(text: string, boardDigest = ""): boolean {
  const clean = tidy(text);
  if (!clean) return false;
  if (isClockQuestion(clean) || isSmallTalk(clean)) return true;
  if (/\b(my|mine|our|I|Joseph|calendar|schedule|remind|remember|vault|notes?|search|filter|focus|school|swim|health|people|projects?|goals?|Jarvis|today|tomorrow|yesterday|tonight|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|due|test|practice|week|deadline|it|that|those|these)\b|\b\d{4}-\d{2}-\d{2}\b/i.test(clean)) return false;
  const boilerplate = new Set(["the", "and", "for", "with", "waiting", "project", "projects", "next", "now", "status", "review"]);
  const boardWords = boardDigest.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  const words = new Set(clean.toLowerCase().match(/[a-z0-9-]+/g) ?? []);
  if (boardWords.some(word => !boilerplate.has(word) && words.has(word))) return false;
  return /^(?:what(?:'s| is| are)|who (?:is|was|are)|why |how (?:is|are|do|does|can)|explain |define |tell me (?:about|a joke)|write (?:a|an) )/i.test(clean);
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
