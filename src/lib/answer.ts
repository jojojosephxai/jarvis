export type NoteSnippet = {
  title: string;
  body: string;
};

export function localButlerLine(question: string, notes: readonly NoteSnippet[]): string {
  if (notes.length === 0) {
    return "I am working from the notes alone, sir, and none of them match.";
  }
  const [top, ...rest] = notes;
  if (!top) {
    return "I am working from the notes alone, sir, and none of them match.";
  }
  const also = rest.slice(0, 2).map((note) => note.title);
  const tail = also.length > 0 ? ` Linked notes: ${also.join(", ")}.` : "";
  if (/\btoday\b/i.test(question)) {
    const date = question.match(/it is [^.]+\./i)?.[0] ?? "";
    return `I am working from the notes alone, sir. ${date} ${top.body}`.replace(/\s+/g, " ").trim();
  }
  return `I am working from the notes alone, sir. ${top.title}: ${top.body}${tail}`;
}
