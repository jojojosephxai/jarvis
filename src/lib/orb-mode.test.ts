import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { orbModeIndex, orbStatusWord, resolveOrbMode } from "./orb-mode";

describe("resolveOrbMode", () => {
  it("lets speaking win, then working, then listening, then thinking, then ack", () => {
    assert.equal(
      resolveOrbMode({ speaking: true, working: true, listening: true, thinking: true, ack: true }),
      "speaking",
    );
    assert.equal(
      resolveOrbMode({ speaking: false, working: true, listening: true, thinking: true, ack: true }),
      "working",
    );
    assert.equal(
      resolveOrbMode({ speaking: false, working: false, listening: true, thinking: true, ack: true }),
      "listening",
    );
    assert.equal(
      resolveOrbMode({ speaking: false, working: false, listening: false, thinking: true, ack: true }),
      "thinking",
    );
    assert.equal(
      resolveOrbMode({ speaking: false, working: false, listening: false, ack: true }),
      "ack",
    );
    assert.equal(
      resolveOrbMode({ speaking: false, working: false, listening: false, ack: false }),
      "standby",
    );
  });

  it("maps each mode to a stable shader index", () => {
    assert.equal(orbModeIndex("standby"), 0);
    assert.equal(orbModeIndex("listening"), 1);
    assert.equal(orbModeIndex("speaking"), 2);
    assert.equal(orbModeIndex("ack"), 3);
    assert.equal(orbModeIndex("working"), 4);
    assert.equal(orbModeIndex("thinking"), 5);
  });
});

describe("orbStatusWord", () => {
  it("names the live state and the skill on one line", () => {
    assert.equal(orbStatusWord("standby", null), "Idle");
    assert.equal(orbStatusWord("listening", null), "Listening");
    assert.equal(orbStatusWord("listening", "brain"), "Listening · brain");
    assert.equal(orbStatusWord("speaking", "calendar"), "Speaking · calendar");
    assert.equal(orbStatusWord("speaking", "brain"), "Speaking · brain");
    assert.equal(orbStatusWord("ack", null), "Thinking");
    assert.equal(orbStatusWord("thinking", null), "Thinking");
    assert.equal(orbStatusWord("thinking", "calendar"), "Thinking · calendar");
    assert.equal(orbStatusWord("working", null), "Working");
    assert.equal(orbStatusWord("working", "calendar"), "Working · calendar");
  });
});
