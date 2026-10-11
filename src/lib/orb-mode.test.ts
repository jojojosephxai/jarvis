import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { orbModeIndex, orbStatusWord, resolveOrbMode } from "./orb-mode";

describe("resolveOrbMode", () => {
  it("lets speaking win, then working, then listening, then ack", () => {
    assert.equal(
      resolveOrbMode({ speaking: true, working: true, listening: true, ack: true }),
      "speaking",
    );
    assert.equal(
      resolveOrbMode({ speaking: false, working: true, listening: true, ack: true }),
      "working",
    );
    assert.equal(
      resolveOrbMode({ speaking: false, working: false, listening: true, ack: true }),
      "listening",
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
  });
});

describe("orbStatusWord", () => {
  it("names the live state and hides the mark while exploring", () => {
    assert.equal(orbStatusWord("listening", null), "LISTENING");
    assert.equal(orbStatusWord("speaking", "CALENDAR-LIST"), "SPEAKING");
    assert.equal(orbStatusWord("working", null), "WORKING");
    assert.equal(orbStatusWord("working", "CALENDAR-LIST"), "CALENDAR-LIST");
    assert.equal(orbStatusWord("standby", null), null);
    assert.equal(orbStatusWord("ack", null), null);
    assert.equal(orbStatusWord("standby", "CALENDAR-LIST"), "CALENDAR-LIST");
  });
});
