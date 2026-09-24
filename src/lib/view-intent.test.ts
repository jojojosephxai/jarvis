import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideFaceMode, parseViewIntent } from "./view-intent";

describe("parseViewIntent", () => {
  it("reads a bare view name", () => {
    assert.equal(parseViewIntent("graph"), "graph");
    assert.equal(parseViewIntent("orb"), "orb");
  });

  it("reads a polite switch", () => {
    assert.equal(parseViewIntent("show me the orb"), "orb");
    assert.equal(parseViewIntent("please switch to graph mode"), "graph");
    assert.equal(parseViewIntent("Jarvis, go to the graph"), "graph");
  });

  it("leaves questions and other tasks alone", () => {
    assert.equal(parseViewIntent("what is a graph"), null);
    assert.equal(parseViewIntent("show me the graph of plants"), null);
    assert.equal(parseViewIntent("Put soccer practice on my calendar tomorrow at 4pm"), null);
    assert.equal(parseViewIntent("ring mom"), null);
    assert.equal(parseViewIntent("please switch to ring mode"), null);
    assert.equal(parseViewIntent("switch view to cube"), null);
  });

  it("treats dynamic orb as the orb view", () => {
    assert.equal(parseViewIntent("dynamic orb"), "orb");
    assert.equal(parseViewIntent("show the dynamic orb"), "orb");
    assert.equal(parseViewIntent("switch to dynamic orb"), "orb");
  });
});

describe("decideFaceMode", () => {
  it("lets switch to dynamic orb win over a graph ask in the same line", () => {
    const decision = decideFaceMode("switch to dynamic orb and open the graph");
    assert.equal(decision.view, "orb");
    assert.equal(decision.exclusive, true);
    assert.equal(decision.kind, "phrase");
  });

  it("opens the graph for a path or a vault ask", () => {
    const path = decideFaceMode("path from About to School");
    assert.equal(path.view, "graph");
    assert.equal(path.exclusive, true);
    assert.equal(path.kind, "vault");
    assert.equal(path.pathFrom, "About");
    assert.equal(path.pathTo, "School");

    const vault = decideFaceMode("open the vault");
    assert.equal(vault.view, "graph");
    assert.equal(vault.exclusive, true);

    const focus = decideFaceMode("focus note Swim");
    assert.equal(focus.focusQuery, "Swim");
    assert.equal(focus.view, "graph");
  });

  it("keeps the graph open for work that is not a view switch", () => {
    const grade = decideFaceMode("What grade is Joseph in?");
    assert.equal(grade.view, "graph");
    assert.equal(grade.exclusive, false);
    assert.equal(grade.kind, "auto");

    const calendar = decideFaceMode("Put soccer practice on my calendar tomorrow at 4pm");
    assert.equal(calendar.view, "graph");
    assert.equal(calendar.exclusive, false);

    const plants = decideFaceMode("show me the graph of plants");
    assert.equal(plants.view, "graph");
    assert.equal(plants.exclusive, false);
  });
});
