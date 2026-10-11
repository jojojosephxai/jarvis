import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildNoteGraph,
  loadVaultGraph,
  MAX_GRAPH_NODES,
  nodeDiameterPx,
  resolveVaultPath,
} from "./note-graph";

describe("buildNoteGraph", () => {
  it("connects wikilinks, shared tags, and a folder parent", () => {
    const graph = buildNoteGraph([
      {
        path: "school/index.md",
        text: "---\ntags:\n  - school\n---\n# School\n\nHome room.\n",
      },
      {
        path: "school/fair.md",
        text: "# Science fair\n\nSee [[School|the board]].\n\n#school\n",
      },
    ]);
    assert.equal(graph.status, "ready");
    assert.equal(graph.noteCount, 2);
    assert.equal(graph.edges.some((edge) => edge.reason === "folder"), true);
    assert.equal(graph.edges.some((edge) => edge.reason === "wikilink"), true);
    assert.equal(
      graph.edges.some((edge) => edge.reason === "tag" && (edge.from === "tag:school" || edge.to === "tag:school")),
      true,
    );
    assert.equal(graph.nodes.some((node) => node.id === "tag:school" && node.nodeType === "hub"), true);
    assert.equal(
      graph.nodes.find((note) => note.id === "school/fair.md")?.excerpt.includes("[[School|the board]]"),
      true,
    );
  });

  it("caps the map so a weak computer is not asked to draw everything", () => {
    const files = Array.from({ length: MAX_GRAPH_NODES + 5 }, (_, index) => ({
      path: `notes/note-${index}.md`,
      text: `# Note ${index}\n\nPlain text.\n`,
    }));
    const graph = buildNoteGraph(files);
    assert.equal(graph.noteCount, MAX_GRAPH_NODES);
    assert.equal(graph.hiddenCount, 5);
    assert.equal(graph.capped, true);
  });

  it("connects notes in one folder even when nothing links them", () => {
    const graph = buildNoteGraph([
      { path: "About.md", text: "# About\n\nJoseph.\n" },
      { path: "School.md", text: "# School\n\nClass.\n" },
    ]);
    assert.equal(graph.noteCount, 2);
    assert.equal(graph.nodes.filter((node) => node.kind === "folder").length, 1);
    assert.equal(graph.connectionCount, 2);
    assert.equal(
      graph.edges.every((edge) => edge.reason === "folder"),
      true,
    );
  });

  it("keeps a real parent note instead of adding a folder hub", () => {
    const graph = buildNoteGraph([
      { path: "school/index.md", text: "# School\n\nHome.\n" },
      { path: "school/fair.md", text: "# Fair\n\nPlants.\n" },
    ]);
    assert.equal(
      graph.nodes.some((node) => node.kind === "folder"),
      false,
    );
    assert.equal(graph.edges.filter((edge) => edge.reason === "folder").length, 1);
  });

  it("marks ssot notes and counts only types that are on the graph", () => {
    const graph = buildNoteGraph([
      { path: "People.md", text: "---\ntags:\n  - people\n---\n# People\n\nMom.\n" },
      { path: "Decisions.md", text: "---\ntags:\n  - decisions\n---\n# Decisions\n\nLocked.\n" },
      { path: "Journal/2026-10-04.md", text: "---\ntags:\n  - journal\n---\n# Day\n\nRest.\n" },
      { path: "School.md", text: "---\nssot: false\ntags:\n  - school\n---\n# School\n\nClass.\n" },
      {
        path: "School-schedule.md",
        text: "---\nssot: true\ntags:\n  - school\n---\n# School schedule\n\nBells.\n",
      },
      { path: "Links.md", text: "---\ntype: url\ntags:\n  - school\n---\n# Link\n\nhttps://example.com\n" },
    ]);
    assert.equal(graph.nodes.find((node) => node.id === "People.md")?.nodeType, "person");
    assert.equal(graph.nodes.find((node) => node.id === "Decisions.md")?.nodeType, "decision");
    assert.equal(graph.nodes.find((node) => node.id === "Journal/2026-10-04.md")?.nodeType, "journal");
    assert.equal(graph.nodes.find((node) => node.id === "School.md")?.ssot, false);
    assert.equal(graph.nodes.find((node) => node.id === "School.md")?.nodeType, "note");
    const schedule = graph.nodes.find((node) => node.id === "School-schedule.md");
    assert.equal(schedule?.ssot, true);
    assert.equal(schedule?.hubs[0], "tag:school");
    assert.equal(graph.nodes.find((node) => node.id === "Links.md")?.nodeType, "link");
    assert.equal(graph.legend.some((entry) => entry.type === "file"), false);
    assert.equal(graph.legend.find((entry) => entry.type === "person")?.count, 1);
    assert.equal(graph.legend.find((entry) => entry.type === "person")?.color, "#F5C451");
    assert.equal(graph.legend.some((entry) => entry.type === "hub" && entry.count > 0), true);
    assert.equal(nodeDiameterPx({ kind: "folder", nodeType: "hub", ssot: false, title: "School" }), 22);
    assert.equal(nodeDiameterPx({ kind: "folder", nodeType: "hub", ssot: false, title: "Conestoga" }), 16);
    assert.equal(nodeDiameterPx({ kind: "note", nodeType: "note", ssot: true, title: "School schedule" }), 14);
    assert.equal(nodeDiameterPx({ kind: "note", nodeType: "note", ssot: false, title: "About" }), 12);
  });

  it("returns no nodes for an empty list", () => {
    const graph = buildNoteGraph([]);
    assert.equal(graph.status, "empty");
    assert.equal(graph.noteCount, 0);
    assert.equal(graph.connectionCount, 0);
  });
});

describe("resolveVaultPath", () => {
  it("uses the project vault folder unless another path is set", () => {
    assert.equal(resolveVaultPath("  ", "/somewhere", "/proj"), "");
    assert.equal(resolveVaultPath(undefined, "  /custom/vault  ", "/proj"), "/custom/vault");
    assert.equal(resolveVaultPath(undefined, "", "/proj"), path.join("/proj", "vault"));
  });
});

describe("loadVaultGraph", () => {
  it("stays empty when no vault folder is configured", async () => {
    const graph = await loadVaultGraph("  ");
    assert.equal(graph.status, "not-wired");
    assert.equal(graph.noteCount, 0);
    assert.equal(graph.nodes.length, 0);
    assert.match(graph.detail, /not wired yet/i);
  });

  it("says the folder is missing instead of inventing notes", async () => {
    const graph = await loadVaultGraph(path.join(tmpdir(), "jarvis-missing-vault"));
    assert.equal(graph.status, "missing");
    assert.equal(graph.nodes.length, 0);
  });

  it("reads the project vault notes without inventing any", async () => {
    const previous = process.env.OBSIDIAN_VAULT_PATH;
    delete process.env.OBSIDIAN_VAULT_PATH;
    try {
      const graph = await loadVaultGraph();
      assert.equal(graph.status, "ready");
      assert.equal(graph.nodes.some((note) => /about/i.test(note.title)), true);
      assert.equal(graph.nodes.some((note) => note.title === "School"), true);
      assert.equal(graph.noteCount <= MAX_GRAPH_NODES, true);
      assert.equal(graph.connectionCount > 0, true);
      assert.equal(
        graph.edges.some((edge) => edge.reason === "folder"),
        true,
      );
      assert.equal(
        graph.edges.some((edge) => edge.reason === "wikilink"),
        true,
      );
    } finally {
      if (previous === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
      else process.env.OBSIDIAN_VAULT_PATH = previous;
    }
  });

  it("reads markdown from a real folder", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "jarvis-vault-"));
    try {
      await mkdir(path.join(root, "school"), { recursive: true });
      await writeFile(path.join(root, "school", "index.md"), "# School\n\n#class\n", "utf8");
      await writeFile(
        path.join(root, "school", "fair.md"),
        "# Science fair\n\nSee [[School]].\n\n#class\n",
        "utf8",
      );
      const graph = await loadVaultGraph(root);
      assert.equal(graph.status, "ready");
      assert.equal(graph.noteCount, 2);
      assert.equal(graph.connectionCount >= 2, true);
      assert.equal(graph.nodes.some((note) => note.title === "Science fair"), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
