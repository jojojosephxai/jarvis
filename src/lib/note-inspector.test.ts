import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { inspectorDocument, parseMarkdown } from "./note-inspector";
import { buildNoteGraph } from "./note-graph";
import { readVaultMarkdown } from "./vault-read";

describe("inspectorDocument", () => {
  it("shows the hub's own file, a member list, and a heading's parent note", () => {
    const school = "---\nssot: true\ntags:\n  - school\n---\n# School\n\nClass.\n\n## Bells\n\nRing at eight.\n\n```\nroom 12\n```\n";
    const meet = "# Meet\n\nSee [[Swim]].\n";
    const files = [
      { path: "About.md", text: "# About me\n\nJoseph.\n" },
      { path: "School.md", text: school },
      { path: "Meet.md", text: "---\ntags:\n  - swim\n---\n" + meet },
      { path: "Journal/day.md", text: "# Day\n\nRest.\n" },
    ];
    const graph = buildNoteGraph(files);
    const byPath = new Map(files.map((file) => [file.path, file.text]));
    const schoolHub = graph.nodes.find((node) => node.id === "area:school");
    const swimHub = graph.nodes.find((node) => node.id === "area:swim");
    const heading = graph.nodes.find((node) => node.anchor === "Bells");
    const about = graph.nodes.find((node) => node.id === "About.md");
    assert.ok(schoolHub && swimHub && heading && about);

    const schoolView = inspectorDocument(schoolHub, graph.nodes, byPath);
    assert.equal(schoolView.kind, "note");
    if (schoolView.kind === "note") {
      assert.equal(schoolView.path, "School.md");
      assert.equal(schoolView.markdown, school);
    }

    const swimView = inspectorDocument(swimHub, graph.nodes, byPath);
    assert.equal(swimView.kind, "members");
    if (swimView.kind === "members") {
      assert.deepEqual(
        swimView.members.map((member) => member.id),
        ["Meet.md"],
      );
    }

    const headingView = inspectorDocument(heading, graph.nodes, byPath);
    assert.equal(headingView.kind, "note");
    if (headingView.kind === "note") {
      assert.equal(headingView.path, "School.md");
      assert.equal(headingView.heading, "Bells");
      assert.equal(headingView.markdown, school);
    }

    const aboutView = inspectorDocument(about, graph.nodes, byPath);
    assert.equal(aboutView.kind, "note");
    if (aboutView.kind === "note") assert.match(aboutView.markdown, /Joseph/);
  });
});

describe("parseMarkdown", () => {
  it("keeps headings, lists, links, and code", () => {
    const blocks = parseMarkdown("# Title\n\n- one\n- [[School|class]]\n\nSee [home](https://example.com).\n\n```\nroom 12\n```\n");
    assert.equal(blocks.some((block) => block.kind === "h" && block.text === "Title"), true);
    assert.equal(blocks.some((block) => block.kind === "ul" && block.items.includes("[[School|class]]")), true);
    assert.equal(blocks.some((block) => block.kind === "p" && block.text.includes("[home](https://example.com)")), true);
    assert.equal(blocks.some((block) => block.kind === "code" && block.text === "room 12"), true);
  });
});

describe("readVaultMarkdown", () => {
  it("reads a note inside the vault and refuses a path that leaves it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "jarvis-note-"));
    await mkdir(path.join(dir, "Journal"));
    const body = "# Day\n\nRest.\n";
    await writeFile(path.join(dir, "Journal", "day.md"), body);
    const note = await readVaultMarkdown(dir, "Journal/day.md");
    assert.equal(note?.path, "Journal/day.md");
    assert.equal(note?.markdown, body);
    assert.equal(await readVaultMarkdown(dir, "../secret.md"), null);
    assert.equal(await readVaultMarkdown(dir, "Journal/missing.md"), null);
  });
});
