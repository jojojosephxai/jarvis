export type Folder = "Today" | "School" | "Projects" | "People" | "Lab";

export type Note = {
  id: string;
  file: string;
  title: string;
  folder: Folder;
  body: string;
  links: string[];
};

export const FOLDERS: readonly Folder[] = ["Today", "School", "Projects", "People", "Lab"];

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "sir",
  "what",
  "whats",
  "who",
  "when",
  "where",
  "why",
  "how",
  "tell",
  "pull",
  "show",
  "open",
  "note",
  "please",
  "about",
]);

export function isFolder(value: string): value is Folder {
  switch (value) {
    case "Today":
    case "School":
    case "Projects":
    case "People":
    case "Lab":
      return true;
    default:
      return false;
  }
}

export function folderColor(folder: Folder): string {
  switch (folder) {
    case "Today":
      return "#3ee0ff";
    case "School":
      return "#e6c15a";
    case "Projects":
      return "#7aa2ff";
    case "People":
      return "#ff8a5b";
    case "Lab":
      return "#5ddeaf";
    default: {
      const exhaustive: never = folder;
      return exhaustive;
    }
  }
}

export function getNote(notes: readonly Note[], id: string): Note | null {
  return notes.find((note) => note.id === id) ?? null;
}

export function linkedNotes(notes: readonly Note[], id: string): Note[] {
  const note = getNote(notes, id);
  if (!note) {
    return [];
  }
  return note.links.flatMap((linkId) => {
    const linked = getNote(notes, linkId);
    return linked ? [linked] : [];
  });
}

export function findNotes(notes: readonly Note[], query: string): Note[] {
  const q = query.toLowerCase().replace(/\.md$/, "").trim();
  if (!q) {
    return [];
  }
  const words = q.split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  return notes
    .map((note) => {
      const title = note.title.toLowerCase();
      const file = note.file.toLowerCase();
      const body = note.body.toLowerCase();
      let score = 0;
      if (note.id === q || title === `${q}.md`) {
        score += 12;
      }
      if (title.includes(q) || file.includes(q) || note.id.includes(q.replace(/\s+/g, "-"))) {
        score += 6;
      }
      for (const word of words) {
        if (title.includes(word) || note.id.includes(word)) {
          score += 3;
        }
        if (body.includes(word)) {
          score += 1;
        }
      }
      return { note, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.note);
}
