import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isClockQuestion, isQuickAsk, isSmallTalk, localClockReply, readySentences } from "./clock";

describe("clock questions", () => {
  const now = new Date("2026-10-15T03:10:00Z");

  it("recognizes the time and the date, and leaves practice times alone", () => {
    assert.equal(isClockQuestion("what time is it"), "time");
    assert.equal(isClockQuestion("What's the time?"), "time");
    assert.equal(isClockQuestion("what time is it now"), "time");
    assert.equal(isClockQuestion("what day is it"), "date");
    assert.equal(isClockQuestion("what's the date"), "date");
    assert.equal(isClockQuestion("what time is swim practice"), null);
    assert.equal(isClockQuestion("what time is soccer"), null);
  });

  it("answers from the Eastern clock", () => {
    assert.equal(localClockReply("time", now), "It's 11:10 PM Eastern.");
    assert.equal(localClockReply("date", now), "It's Wednesday, October 14.");
  });

  it("sends greetings and short questions to the fast path", () => {
    assert.equal(isQuickAsk("hi"), true);
    assert.equal(isQuickAsk("what time is it"), true);
    assert.equal(isQuickAsk("how is the weather?"), true);
    assert.equal(isQuickAsk("what time is swim practice"), false);
    assert.equal(isQuickAsk("what did I write about the science fair project last spring"), false);
  });

  it("treats a short greeting as small talk", () => {
    assert.equal(isSmallTalk("hello"), true);
    assert.equal(isSmallTalk("good morning"), true);
    assert.equal(isSmallTalk("what time is it"), false);
    assert.equal(isSmallTalk("what time is swim practice"), false);
  });

  it("keeps a half-written sentence until the next one starts", () => {
    const split = readySentences("It's 11:10 PM Eastern. The rest is still");
    assert.deepEqual(split.ready, ["It's 11:10 PM Eastern."]);
    assert.equal(split.rest.trim(), "The rest is still");
  });
});
