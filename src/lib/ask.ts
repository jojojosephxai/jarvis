import { localButlerLine, type NoteSnippet } from "@/lib/answer";

type AskInput = {
  question: string;
  notes: readonly NoteSnippet[];
  model: string;
  image?: string;
};

export async function askJarvis(input: AskInput): Promise<string> {
  const fallback = input.image
    ? "I have the picture, sir, but I am working without Grok, so I cannot describe it."
    : localButlerLine(input.question, input.notes);
  try {
    const response = await fetch("/api/jarvis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: input.question,
        notes: input.notes.map((note) => ({ title: note.title, body: note.body })),
        model: input.model,
        image: input.image,
      }),
    });
    if (!response.ok) {
      return fallback;
    }
    const data = (await response.json()) as { line?: string };
    if (typeof data.line === "string" && data.line.trim()) {
      return data.line.trim();
    }
  } catch {
    return fallback;
  }
  return fallback;
}
