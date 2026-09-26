import fs from "node:fs";
import path from "node:path";
import { isFolder, type Folder, type Note } from "@/lib/notes";

export function readVault(): Note[] {
  const root = path.join(process.cwd(), "notes");
  if (!fs.existsSync(root)) {
    return [];
  }
  const notes: Note[] = [];
  for (const folderName of fs.readdirSync(root)) {
    if (!isFolder(folderName)) {
      continue;
    }
    const folderPath = path.join(root, folderName);
    if (!fs.statSync(folderPath).isDirectory()) {
      continue;
    }
    for (const fileName of fs.readdirSync(folderPath)) {
      if (!fileName.endsWith(".md")) {
        continue;
      }
      const raw = fs.readFileSync(path.join(folderPath, fileName), "utf8");
      notes.push(parseNote(raw, folderName, fileName));
    }
  }
  return connect(notes);
}

function parseNote(raw: string, folder: Folder, fileName: string): Note {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const meta = match?.[1] ?? "";
  const body = (match?.[2] ?? raw).trim();
  const linksLine = meta.match(/^links:\s*(.*)$/m)?.[1] ?? "";
  const id = fileName.replace(/\.md$/, "");
  return {
    id,
    file: `${folder}/${fileName}`,
    title: fileName,
    folder,
    body,
    links: linksLine
      .split(",")
      .map((link) => link.trim().replace(/\.md$/, ""))
      .filter((link) => link.length > 0 && link !== id),
  };
}

function connect(notes: Note[]): Note[] {
  const byId = new Map(notes.map((note) => [note.id, note]));
  for (const note of notes) {
    note.links = note.links.filter((id) => byId.has(id));
  }
  for (const note of notes) {
    for (const id of [...note.links]) {
      const other = byId.get(id);
      if (other && !other.links.includes(note.id)) {
        other.links.push(note.id);
      }
    }
  }
  return notes;
}
