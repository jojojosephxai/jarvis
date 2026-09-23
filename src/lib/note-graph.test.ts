import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildNoteGraph, loadVaultGraph, MAX_GRAPH_NODES, resolveVaultPath } from "./note-graph";

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
    assert.deepEqual(
      graph.edges.map((edge) => edge.reason).sort(),
      ["folder", "tag", "wikilink"],
    );
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
      assert.equal(graph.nodes.some((note) => note.title === "About"), true);
      assert.equal(graph.nodes.some((note) => note.title === "School"), true);
      assert.equal(graph.noteCount <= MAX_GRAPH_NODES, true);
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
