import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeGraphCommand, parseGraphCommand } from "./graph-command";
import { buildNoteGraph } from "./note-graph";

describe("parseGraphCommand", () => {
  it("reads filter, search, focus, and clear", () => {
    assert.deepEqual(parseGraphCommand("show me my swim notes"), { action: "filter", hub: "Swim" });
    assert.deepEqual(parseGraphCommand("filter to School"), { action: "filter", hub: "School" });
    assert.deepEqual(parseGraphCommand("search for breaststroke"), { action: "search", query: "breaststroke" });
    assert.deepEqual(parseGraphCommand("focus on People"), { action: "focus", target: "People" });
    assert.deepEqual(parseGraphCommand("clear filter"), { action: "clear" });
    assert.equal(parseGraphCommand("what is the capital of France"), null);
  });
});

describe("describeGraphCommand", () => {
  it("counts the notes in the hub it filters", () => {
    const graph = buildNoteGraph([
      { path: "About.md", text: "# About me\n\nJoseph.\n" },
      { path: "Swim.md", text: "---\nssot: true\ntags:\n  - swim\n---\n# Swim\n\nLanes.\n" },
      { path: "Meet.md", text: "---\ntags:\n  - swim\n---\n# Meet\n\nBreaststroke.\n" },
      { path: "Warmup.md", text: "---\ntags:\n  - swim\n---\n# Warmup\n\nEasy.\n" },
    ]);
    const command = parseGraphCommand("show me my swim notes");
    assert.ok(command);
    const described = describeGraphCommand(command, graph.nodes);
    assert.equal(described.reply, "Showing 3 Swim notes");
    assert.deepEqual(described.directive, { action: "filter", value: "Swim" });
  });

  it("treats Me as the center hub", () => {
    const graph = buildNoteGraph([
      { path: "About.md", text: "# About me\n\nJoseph.\n" },
      { path: "Loose.md", text: "# Loose\n\nNo tag.\n" },
    ]);
    const command = parseGraphCommand("filter to Me");
    assert.ok(command);
    const described = describeGraphCommand(command, graph.nodes);
    assert.equal(described.directive.action, "filter");
    assert.equal(described.directive.value, "Me / Jarvis");
    assert.match(described.reply, /Me \/ Jarvis/);
    assert.equal(graph.nodes.some((node) => node.title === "Me" && node.kind === "folder"), false);
  });
});
