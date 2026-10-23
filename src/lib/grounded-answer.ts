import path from "node:path";

import { stripReplySources } from "./reply-text";
import { pinnedContext, type PinnedOptions } from "./pinned-context";
import { grokConfigured, grokPhraseNotes, grokStreamSentences, type GrokResult } from "./grok";
import type { BrainMode, ChatMessageInput } from "./types";
import { loadVaultNotes, vaultNoteDate, OLDER_CONTEXT_DAYS, resolveVaultPath, chunkVaultNote, type VaultChunk, type VaultNote } from "./vault-read";

/**
 * Answers with grok-4.7 when a key is set. Matching vault notes are context.
 * A miss in the vault does not skip the model. With no key, a local reader
 * quotes the notes and says when nothing matched.
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

export type AnswerOptions = PinnedOptions & {
  useModel?: boolean;
  onToken?: (text: string) => void;
  history?: ChatMessageInput[];
  complete?: (question: string, packet: string, history?: ChatMessageInput[]) => Promise<GrokResult>;
  stream?: (question: string, packet: string, history?: ChatMessageInput[]) => AsyncIterable<string>;
};

type ScoredNote = VaultChunk & {
  score: number;
  hitTerms: number;
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

function occurrences(text: string, term: string): number {
  return (text.toLowerCase().match(new RegExp(`\\b${term}\\b`, "g")) ?? []).length;
}

function nextStepAsk(question: string): boolean {
  return /\b(next|what should i do|what (?:do|should) i work on|prioriti[sz]e|focus on)\b/i.test(question);
}

function rankChunks(notes: VaultNote[], terms: string[], question: string, now = new Date()): ScoredNote[] {
  const chunks = notes.flatMap(chunkVaultNote);
  const length = (text: string) => (text.match(/[a-z0-9]+/gi) ?? []).length;
  const average = chunks.reduce((n, chunk) => n + length(chunk.text), 0) / (chunks.length || 1);
  const idf = new Map(terms.map(term => {
    const count = chunks.filter(c => occurrences(`${c.note.title} ${c.heading} ${c.text} ${c.aliases} ${c.links}`, term)).length;
    return [term, Math.log(1 + (chunks.length - count + 0.5) / (count + 0.5))];
  }));
  const nextStep = nextStepAsk(question);
  return chunks.map(chunk => {
    let score = 0, hitTerms = 0;
    for (const term of terms) {
      const tf = occurrences(chunk.text, term);
      const boost = occurrences(chunk.note.title, term) * 3 + occurrences(chunk.heading, term) * 2
        + occurrences(chunk.aliases, term) * 3 + occurrences(chunk.links, term) * 2;
      if (!tf && !boost) continue;
      hitTerms++;
      const bm25 = tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * length(chunk.text) / (average || 1)));
      score += (idf.get(term) ?? 0) * (bm25 + boost);
    }
    // A multi-term ask still needs more than one overlapping word.
    if (terms.length >= 2 && hitTerms < 2) score *= 0.15;
    if (path.basename(chunk.note.filePath).toLowerCase() === "readme.md" && !/\b(obsidian|vault|open|readme)\b/i.test(question)) score *= 0.3;
    const dated = vaultNoteDate(chunk.note);
    if (dated) {
      const age = Math.max(0, Math.floor((now.getTime() - Date.parse(dated)) / 86_400_000));
      score *= 1 + 0.3 / (1 + age);
      if (nextStep && age <= 7) score = Math.max(score, 1);
    }
    return { ...chunk, score, hitTerms };
  }).filter(chunk => chunk.score >= 0.8).sort((a, b) =>
    (nextStep ? (vaultNoteDate(b.note) ?? "").localeCompare(vaultNoteDate(a.note) ?? "") : 0) || b.score - a.score);
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
    if (!sources.includes(scored.note.title)) sources.push(scored.note.title);
    const lines = matchingLines(scored.text, terms).slice(0, 3);
    for (const line of lines) {
      if (!parts.includes(line)) parts.push(line);
    }
  }

  const blank = parts.some((line) => /:\s*$/.test(line));
  const blankNote = blank ? "\n\nA matching line is blank, so that part is not written down." : "";
  return {
    reply: `${parts.join("\n")}${blankNote}`,
    sources,
  };
}

const CONTEXT_NOTES = 3;

function packetFor(question: string, picked: ScoredNote[], pinned: string, now: Date): string {
  const blocks = picked
    .slice(0, CONTEXT_NOTES)
    .map(scored => {
      const date = vaultNoteDate(scored.note);
      const older = date && now.getTime() - Date.parse(date) > OLDER_CONTEXT_DAYS * 86_400_000;
      return `# ${scored.note.title} › ${scored.heading}${date ? ` (${date}${older ? ", older context" : ""})` : ""}\n${scored.text}`;
    })
    .join("\n\n");
  return `${pinned}\n\nQuestion:\n${question}\n\nNotes:\n${blocks}`;
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


type GatheredAnswer = {
  modelOn: boolean;
  packet: string;
  localReply: string;
  sources: string[];
  blocked?: GroundedAnswer;
};

async function gatherAnswer(question: string, options: AnswerOptions): Promise<GatheredAnswer> {
  const root = options.root ?? process.cwd();
  const directory = resolveVaultPath(root, options.vaultPath);
  const loaded = await loadVaultNotes(directory);

  if (!loaded.ok) {
    return {
      modelOn: false,
      packet: "",
      localReply: "",
      sources: [],
      blocked: {
        reply: `Brain wiring: the vault ${loaded.problem} (${loaded.directory}). Set OBSIDIAN_VAULT_PATH, or keep a vault folder in the project. I did not answer from anywhere else.`,
        mode: "demo",
        sources: [],
        notice: "Brain wiring: no vault notes were read.",
      },
    };
  }

  const previous = options.history?.filter(message => message.role === "user").at(-1)?.content;
  const followup = question.split(/\s+/).length <= 6 || /\b(it|that|what about|and on)\b/i.test(question);
  const query = previous && followup ? `${previous} ${question}` : question;
  const terms = questionTerms(query);
  const ranked = terms.length ? rankChunks(loaded.notes, terms, query, options.now) : [];

  const best = ranked[0];
  const picked = best
    ? ranked.filter(scored => scored.score >= best.score * 0.55 || (nextStepAsk(question) && (vaultNoteDate(scored.note) ?? "") >= (vaultNoteDate(best.note) ?? "~"))).slice(0, CONTEXT_NOTES)
    : [];

  const allTitles = loaded.notes.map((note) => note.title);
  const local = localReading(query, picked, allTitles);
  const pinned = await pinnedContext(question, options);
  const packet =
    picked.length > 0
      ? packetFor(question, picked, pinned, options.now ?? new Date())
      : `${pinned}\n\nQuestion:\n${question}\n\nNotes:\nNo vault note matched. Answer anyway.`;
  return {
    modelOn: options.useModel ?? grokConfigured(),
    packet,
    localReply: local.reply,
    sources: local.sources,
  };
}

export async function answerFromVault(question: string, options: AnswerOptions = {}): Promise<GroundedAnswer> {
  const gathered = await gatherAnswer(question, options);
  if (gathered.blocked) return gathered.blocked;
  if (!gathered.modelOn) {
    return {
      reply: gathered.localReply,
      mode: "demo",
      sources: gathered.sources,
    };
  }

  const complete = options.complete ?? grokPhraseNotes;
  const result = await complete(question, gathered.packet, options.history);
  if (result.ok && result.text.trim()) {
    return {
      reply: stripReplySources(result.text, gathered.sources),
      mode: "grok",
      sources: gathered.sources,
      // Quiet on a miss — shouting “no vault note matched” under hello-style chat feels unfinished.
      notice: gathered.sources.length > 0 ? "Notes used as context." : undefined,
    };
  }

  const notice = result.ok
    ? "Grok's reply was empty, so this is the local reading of the vault notes."
    : `Grok did not answer (${result.reason}), so this is the local reading of the vault notes.`;
  return {
    reply: gathered.localReply,
    mode: "demo",
    sources: gathered.sources,
    notice,
  };
}

export type StreamedAnswer =
  | { type: "sentence"; text: string }
  | { type: "done"; answer: GroundedAnswer };

/** Vault search first, then sentences as the model writes them. */
export async function* streamAnswerFromVault(
  question: string,
  options: AnswerOptions = {},
): AsyncGenerator<StreamedAnswer> {
  const gathered = await gatherAnswer(question, options);
  if (gathered.blocked) {
    yield { type: "done", answer: gathered.blocked };
    return;
  }
  if (!gathered.modelOn) {
    yield {
      type: "done",
      answer: { reply: gathered.localReply, mode: "demo", sources: gathered.sources },
    };
    return;
  }
  if (options.complete) {
    yield { type: "done", answer: await answerFromVault(question, options) };
    return;
  }

  let full = "";
  try {
    for await (const sentence of (options.stream ? options.stream(question, gathered.packet, options.history) : grokStreamSentences(question, gathered.packet, options.history, undefined, options.onToken))) {
      const clean = stripReplySources(sentence, gathered.sources);
      if (!clean) continue;
      full = full ? `${full} ${clean}` : clean;
      yield { type: "sentence", text: clean };
    }
  } catch {
    full = "";
  }

  if (!full.trim()) {
    yield {
      type: "done",
      answer: {
        reply: gathered.localReply,
        mode: "demo",
        sources: gathered.sources,
        notice: "Grok did not answer, so this is the local reading of the vault notes.",
      },
    };
    return;
  }

  yield {
    type: "done",
    answer: {
      reply: stripReplySources(full, gathered.sources),
      mode: "grok",
      sources: gathered.sources,
      notice: gathered.sources.length > 0 ? "Notes used as context." : undefined,
    },
  };
}
