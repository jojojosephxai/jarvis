import assert from "node:assert/strict";
import { test } from "node:test";
import { stripReplySources, stripReplyTiming } from "./reply-text";

test("removes old inline timings while preserving reply content", () => {
  assert.equal(stripReplyTiming("All done. Brain 1871 ms to first token · 210 ms to voice"), "All done.");
  assert.equal(stripReplyTiming("Brain 1871 ms to first word\nAll done."), "All done.");
  assert.equal(stripReplyTiming("Your brain needs a rest."), "Your brain needs a rest.");
});

test("citations stay out of replies without removing real parentheticals", () => {
  assert.equal(stripReplySources("Practice (Tuesday only) is in your note (School).\n\nNotes used: School.", ["School"]), "Practice (Tuesday only) is in your note.");
});
