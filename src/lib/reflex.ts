export type ReflexScores = {
  vault: number;
  finished: number;
  addressing: number;
  action: number;
  inside: number;
};

const ACTION_WORDS = [
  "move",
  "change",
  "open",
  "close",
  "pull",
  "book",
  "start",
  "stop",
  "read",
  "switch",
  "look",
  "focus",
  "put",
  "schedule",
  "show",
  "hide",
];

export function scoreReflex(
  raw: string,
  titles: readonly string[],
  options: { pending: boolean },
): ReflexScores {
  const text = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(" ").filter((word) => word.length > 2);
  const titleWords = new Set(
    titles.flatMap((title) =>
      title
        .toLowerCase()
        .replace(/\.md$/, "")
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2),
    ),
  );
  let hits = 0;
  for (const word of words) {
    if (titleWords.has(word)) {
      hits += 1;
    }
  }
  const vault = clamp(hits / Math.max(1, Math.min(words.length, 4)));
  const finished = /[.?!]$/.test(raw.trim()) || words.length >= 3 ? 1 : words.length === 0 ? 0 : 0.45;
  const addressing = /\bjarvis\b/.test(text) || options.pending ? 1 : words.length >= 2 ? 0.72 : 0.3;
  const question = /^(who|what|when|where|why|how|do|is|are)\b/.test(text) || raw.includes("?");
  const actionHit = ACTION_WORDS.some((word) => text.split(" ").includes(word));
  const action = actionHit && !question ? 0.92 : actionHit ? 0.55 : question ? 0.18 : 0.4;
  const inside = titles.some((title) => titleHits(text, title)) ? 0.96 : vault > 0 ? 0.5 : 0.12;
  return {
    vault: round(vault),
    finished: round(finished),
    addressing: round(addressing),
    action: round(action),
    inside: round(inside),
  };
}

function titleHits(text: string, title: string): boolean {
  const slug = title.toLowerCase().replace(/\.md$/, "").replace(/-/g, " ");
  if (text.includes(slug)) {
    return true;
  }
  return slug.split(" ").some((part) => part.length > 3 && text.includes(part));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
