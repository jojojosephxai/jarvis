import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchGraphNode, matchingNodes, shortestPath, topHubs } from "./graph-nav";

const nodes = [
  { id: "folder:", title: "Vault", folder: "", tags: [] },
  { id: "About.md", title: "About", folder: "", tags: ["joseph"] },
  { id: "School.md", title: "School", folder: "", tags: ["school"] },
  { id: "school/fair.md", title: "Science fair", folder: "school", tags: ["school"] },
];

const edges = [
  { from: "About.md", to: "folder:" },
  { from: "School.md", to: "folder:" },
  { from: "School.md", to: "school/fair.md" },
];

describe("shortestPath", () => {
  it("walks folder links between two notes", () => {
    assert.deepEqual(shortestPath(edges, "About.md", "school/fair.md"), [
      "About.md",
      "folder:",
      "School.md",
      "school/fair.md",
    ]);
  });

  it("returns null when the notes do not connect", () => {
    assert.equal(shortestPath([{ from: "About.md", to: "folder:" }], "About.md", "school/fair.md"), null);
  });

  it("stays on one note when the ends match", () => {
    assert.deepEqual(shortestPath(edges, "About.md", "About.md"), ["About.md"]);
  });
});

describe("topHubs", () => {
  it("lists the most connected notes first", () => {
    const hubs = topHubs(nodes, edges, 2);
    assert.deepEqual(
      hubs.map((hub) => [hub.node.title, hub.degree]),
      [
        ["School", 2],
        ["Vault", 2],
      ],
    );
  });
});

describe("matchGraphNode", () => {
  it("prefers an exact title over a longer title that contains it", () => {
    assert.equal(matchGraphNode(nodes, "School")?.id, "School.md");
    assert.equal(matchGraphNode(nodes, "science")?.id, "school/fair.md");
  });

  it("finds notes by title, path, folder, or tag", () => {
    assert.deepEqual(
      matchingNodes(nodes, "school").map((node) => node.id),
      ["School.md", "school/fair.md"],
    );
    assert.equal(matchingNodes(nodes, "joseph")[0]?.id, "About.md");
  });
});
