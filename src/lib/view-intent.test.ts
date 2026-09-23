import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseViewIntent } from "./view-intent";

describe("parseViewIntent", () => {
  it("reads a bare view name", () => {
    assert.equal(parseViewIntent("graph"), "graph");
    assert.equal(parseViewIntent("orb"), "orb");
  });

  it("reads a polite switch", () => {
    assert.equal(parseViewIntent("please switch to ring mode"), "ring");
    assert.equal(parseViewIntent("show me the orb"), "orb");
    assert.equal(parseViewIntent("switch view to cube"), "cube");
    assert.equal(parseViewIntent("Jarvis, go to the graph"), "graph");
  });

  it("leaves questions and other tasks alone", () => {
    assert.equal(parseViewIntent("what is a graph"), null);
    assert.equal(parseViewIntent("show me the graph of plants"), null);
    assert.equal(parseViewIntent("Put soccer practice on my calendar tomorrow at 4pm"), null);
    assert.equal(parseViewIntent("ring mom"), null);
  });
});
