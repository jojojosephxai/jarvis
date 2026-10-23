import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanReplyText, stripReplySources, stripReplyTiming } from "./reply-text";

test("removes old inline timings while preserving reply content", () => {
  assert.equal(stripReplyTiming("All done. Brain 1871 ms to first token · 210 ms to voice"), "All done.");
  assert.equal(stripReplyTiming("Brain 1871 ms to first word\nAll done."), "All done.");
  assert.equal(stripReplyTiming("Your brain needs a rest."), "Your brain needs a rest.");
});

test("citations stay out of replies without removing real parentheticals", () => {
  assert.equal(stripReplySources("Practice (Tuesday only) is in your note (School).\n\nNotes used: School.", ["School"]), "Practice (Tuesday only) is in your note.");
  assert.equal(stripReplySources("Ready. Notes used: School.", ["School"]), "Ready.");
});


test("every streamed prefix hides source tags and timing tails without losing reply words", () => {
  const sources = ["School-schedule", "Desktop-and-on-behalf"];
  const raw = "The map (School-schedule) is ready [[Desktop-and-on-behalf]]. Brain 1871 ms to first token · 210 ms to voice";
  const final = cleanReplyText(raw, sources);
  assert.equal(final, "The map is ready.");
  for (let end = 0; end <= raw.length; end++) {
    const shown = cleanReplyText(raw.slice(0, end), sources, true);
    assert.ok(final.startsWith(shown), `${end}: ${shown}`);
    assert.doesNotMatch(shown, /[()\[\]]|School|Desktop|Brain|1871|210/);
  }
  for (let end = 0; end <= "Notes used: School-schedule.".length; end++) {
    assert.equal(cleanReplyText("Done.\n" + "Notes used: School-schedule.".slice(0, end), sources, true), "Done.");
  }
});

test("stream cleanup preserves real parentheticals and waits for legacy source metadata", () => {
  const raw = "Practice (Tuesday only) starts soon.";
  assert.equal(cleanReplyText(raw, ["School"], true), raw);
  assert.equal(cleanReplyText("Practice (Tuesday", ["School"], true), "Practice");
  assert.equal(cleanReplyText("Practice [[School]", ["School"], true), "Practice");
  assert.equal(cleanReplyText("Ready (School).", undefined, true), "Ready");
  assert.equal(cleanReplyText("Ready (School).", ["School"], true), "Ready.");
  assert.equal(cleanReplyText("Your brain needs a rest. Notes are useful.", [], true), "Your brain needs a rest. Notes are useful.");
});
