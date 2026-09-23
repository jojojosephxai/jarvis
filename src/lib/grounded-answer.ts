import path from "node:path";

import { grokConfigured, grokPhraseNotes, type GrokResult } from "./grok";
import type { BrainMode } from "./types";
import { loadVaultNotes, resolveVaultPath, type VaultNote } from "./vault-read";

/**
 * Answers a question from Obsidian vault note text only.
 * With no model key, a local reader quotes the notes. That is the default.
 * With XAI_API_KEY, Grok may word the same notes. Wording that leaves the
 * notes is dropped. Nothing is invented, including email claims.
 */

const STOP = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "am",
  "be",
  "been",
  "being",
  "what",
  "whats",
  "who",
  "whom",
  "whose",
  "why",
  "how",
  "when",
  "where",
  "which",
  "do",
  "does",
  "did",
  "doing",
  "my",
  "me",
  "i",
  "im",
  "you",
  "your",
  "yours",
  "we",
  "our",
  "about",
  "of",
  "to",
  "in",
  "on",
  "for",
  "and",
  "or",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "from",
  "please",
  "tell",
  "say",
  "says",
  "said",
  "can",
  "could",
  "would",
  "should",
  "have",
  "has",
  "had",
  "with",
  "any",
  "there",
  "here",
  "just",
  "also",
  "into",
  "than",
  "then",
  "them",
  "they",
  "he",
  "she",
  "his",
  "her",
  "their",
  "not",
  "no",
  "yes",
  "if",
  "but",
  "so",
  "as",
  "at",
  "by",
  "will",
  "want",
  "know",
  "anything",
  "something",
  "hey",
  "hi",
  "ok",
  "okay",
  "note",
  "notes",
]);

const GLUE = new Set([
  "notes",
  "note",
  "used",
  "checked",
  "vault",
  "from",
  "that",
  "this",
  "have",
  "dont",
  "don't",
  "does",
  "did",
  "not",
  "none",
  "them",
  "these",
  "those",
  "with",
  "only",
  "about",
  "there",
  "here",
  "written",
  "blank",
  "line",
  "lines",
  "says",
  "said",
  "mention",
  "mentions",
  "mentioned",
  "answer",
  "answers",
  "question",
  "following",
  "above",
  "given",
  "provided",
  "according",
  "based",
  "because",
  "nothing",
  "something",
  "listed",
  "list",
  "title",
  "titles",
  "read",
  "reading",
  "into",
  "which",
  "what",
  "when",
  "where",
  "your",
  "yours",
  "matching",
  "leaves",
  "leave",
  "part",
  "down",
]);

export type GroundedAnswer = {
  reply: string;
  mode: BrainMode;
  sources: string[];
  notice?: string;
};

export type AnswerOptions = {
  root?: string;
  vaultPath?: string | null;
  useModel?: boolean;
  complete?: (question: string, packet: string) => Promise<GrokResult>;
};

type ScoredNote = {
  note: VaultNote;
  score: number;
};

export function questionTerms(question: string): string[] {
  const raw = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of raw) {
    if (term.length < 2 || STOP.has(term) || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
  }
  return terms;
}

function occurrenceScore(hay: string, term: string): number {
  let score = 0;
  let from = 0;
  while (from < hay.length && score < 4) {
    const found = hay.indexOf(term, from);
    if (found === -1) break;
    score += 1;
    from = found + term.length;
  }
  return score;
}

function scoreNote(note: VaultNote, terms: string[], question: string): ScoredNote {
  const title = note.title.toLowerCase();
  const body = note.text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const inTitle = occurrenceScore(title, term);
    const inBody = occurrenceScore(body, term);
    if (inTitle + inBody === 0) continue;
    score += inTitle * 8 + inBody;
  }
  if (terms.length >= 2) {
    const phrase = terms.join(" ");
    if (body.includes(phrase) || title.includes(phrase)) score += 6;
  }
  const asksForGuide = /\b(obsidian|vault|open|readme)\b/i.test(question);
  if (path.basename(note.filePath).toLowerCase() === "readme.md" && !asksForGuide) {
    score = Math.round(score * 0.3);
  }
  return { note, score };
}

function contentLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#{1,6}\s/.test(line));
}

function cleanLine(line: string): string {
  return line.replace(/^[-*]\s+/, "").replace(/`/g, "").replace(/\s+/g, " ").trim();
}

function matchingLines(text: string, terms: string[]): string[] {
  const lines = contentLines(text);
  const hits = lines.filter((line) => {
    const hay = line.toLowerCase();
    return terms.some((term) => hay.includes(term));
  });
  return (hits.length > 0 ? hits : lines.slice(0, 2)).map(cleanLine).filter(Boolean);
}

function joinTitles(titles: string[]): string {
  if (titles.length === 0) return "none";
  if (titles.length === 1) return titles[0] ?? "none";
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  const head = titles.slice(0, -1).join(", ");
  return `${head}, and ${titles[titles.length - 1]}`;
}

function localReading(question: string, picked: ScoredNote[], allTitles: string[]): { reply: string; sources: string[] } {
  if (picked.length === 0) {
    return {
      reply: `I don't have that in the vault notes. I checked: ${joinTitles(allTitles)}.`,
      sources: [],
    };
  }

  const terms = questionTerms(question);
  const sources: string[] = [];
  const parts: string[] = [];
  for (const scored of picked) {
    sources.push(scored.note.title);
    const lines = matchingLines(scored.note.text, terms).slice(0, 3);
    for (const line of lines) {
      parts.push(`${scored.note.title}: ${line}`);
    }
  }

  const blank = parts.some((line) => /:\s*$/.test(line));
  const blankNote = blank ? "\n\nA matching line is blank, so that part is not written down." : "";
  return {
    reply: `${parts.join("\n")}${blankNote}\n\nNotes used: ${joinTitles(sources)}.`,
    sources,
  };
}

function packetFor(question: string, picked: ScoredNote[]): string {
  const blocks = picked.map((scored) => `# ${scored.note.title}\n${scored.note.text.trim()}`).join("\n\n");
  return `Question:\n${question}\n\nNotes:\n${blocks}`;
}

function replyWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

export function wordingStaysOnNotes(reply: string, notes: VaultNote[]): boolean {
  const corpus = notes.map((note) => `${note.title}\n${note.text}`).join("\n").toLowerCase();
  for (const word of replyWords(reply)) {
    if (word.length < 4 && !/\d/.test(word)) continue;
    if (GLUE.has(word)) continue;
    if (!corpus.includes(word)) return false;
  }
  return true;
}

function gaveUp(reply: string): boolean {
  return /don'?t have that|do not have that|not in the vault/i.test(reply);
}

function withSourcesFooter(reply: string, sources: string[]): string {
  if (sources.length === 0) return reply.trim();
  if (/notes used:/i.test(reply)) return reply.trim();
  return `${reply.trim()}\n\nNotes used: ${joinTitles(sources)}.`;
}

export async function answerFromVault(question: string, options: AnswerOptions = {}): Promise<GroundedAnswer> {
  const root = options.root ?? process.cwd();
  const directory = resolveVaultPath(root, options.vaultPath);
  const loaded = await loadVaultNotes(directory);

  if (!loaded.ok) {
    return {
      reply: `Brain wiring: the vault ${loaded.problem} (${loaded.directory}). Set OBSIDIAN_VAULT_PATH, or keep a vault folder in the project. I did not answer from anywhere else.`,
      mode: "demo",
      sources: [],
      notice: "Brain wiring: no vault notes were read.",
    };
  }

  const terms = questionTerms(question);
  const ranked =
    terms.length === 0
      ? []
      : loaded.notes
          .map((note) => scoreNote(note, terms, question))
          .filter((scored) => scored.score > 0)
          .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const picked = best
    ? ranked.filter((scored) => scored.score >= best.score * 0.55).slice(0, 3)
    : [];

  const allTitles = loaded.notes.map((note) => note.title);
  const local = localReading(question, picked, allTitles);
  const modelOn = options.useModel ?? grokConfigured();

  if (!modelOn || picked.length === 0) {
    return {
      reply: local.reply,
      mode: "demo",
      sources: local.sources,
      notice:
        modelOn && picked.length === 0
          ? "No vault note matched, so nothing was sent to a model."
          : undefined,
    };
  }

  const complete = options.complete ?? grokPhraseNotes;
  const result = await complete(question, packetFor(question, picked));
  const notes = picked.map((scored) => scored.note);
  if (result.ok && !gaveUp(result.text) && wordingStaysOnNotes(result.text, notes)) {
    return {
      reply: withSourcesFooter(result.text, local.sources),
      mode: "grok",
      sources: local.sources,
      notice: "Grok worded this from the vault notes only.",
    };
  }

  const notice = result.ok
    ? "Grok's wording did not stay on the notes, so it was dropped. This is the local reading."
    : `Grok did not answer (${result.reason}), so this is the local reading of the vault notes.`;
  return {
    reply: local.reply,
    mode: "demo",
    sources: local.sources,
    notice,
  };
}
