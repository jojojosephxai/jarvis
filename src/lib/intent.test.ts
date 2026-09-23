import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseIntent, parseToolJson } from "./intent";

describe("parseIntent", () => {
  it("reads the calendar sentence from the try steps", () => {
    const parsed = parseIntent("Put soccer practice on my calendar tomorrow at 4pm");
    assert.equal(parsed.kind, "tool");
    if (parsed.kind !== "tool") return;
    assert.equal(parsed.request.tool, "calendar.write");
    assert.equal(parsed.request.input.title, "soccer practice");
    assert.equal(parsed.request.input.when.toLowerCase(), "tomorrow at 4pm");
  });

  it("reads a reminder with a weekday and a clock", () => {
    const parsed = parseIntent("remind me to finish the science worksheet tomorrow at 5pm");
    assert.equal(parsed.kind, "tool");
    if (parsed.kind !== "tool") return;
    assert.equal(parsed.request.tool, "calendar.write");
    assert.equal(parsed.request.input.title, "finish the science worksheet");
    assert.match(parsed.request.input.when, /tomorrow at 5pm/i);
  });

  it("asks instead of saving a calendar event with no time", () => {
    const parsed = parseIntent("Put soccer practice on my calendar");
    assert.equal(parsed.kind, "chat");
  });

  it("lists the demo calendar", () => {
    const parsed = parseIntent("What's on my calendar?");
    assert.equal(parsed.kind, "tool");
    if (parsed.kind !== "tool") return;
    assert.equal(parsed.request.tool, "calendar.list");
  });

  it("saves a note", () => {
    const parsed = parseIntent("Remember that the library book is due Friday");
    assert.equal(parsed.kind, "tool");
    if (parsed.kind !== "tool") return;
    assert.equal(parsed.request.tool, "notes.keep");
    assert.match(parsed.request.input.text, /library book is due Friday/);
  });

  it("searches notes", () => {
    const parsed = parseIntent("What do my notes say about the science fair?");
    assert.equal(parsed.kind, "tool");
    if (parsed.kind !== "tool") return;
    assert.equal(parsed.request.tool, "notes.recall");
    assert.equal(parsed.request.input.query, "science fair");
  });

  it("refuses a phone call", () => {
    assert.equal(parseIntent("call my mom").kind, "refuse-call");
    assert.equal(parseIntent("Please dial the school").kind, "refuse-call");
  });

  it("leaves ordinary chat alone", () => {
    assert.equal(parseIntent("Who are you?").kind, "chat");
    assert.equal(parseIntent("what do you call this light?").kind, "chat");
  });
});

describe("parseToolJson", () => {
  it("reads a fenced tool call", () => {
    const parsed = parseToolJson('```json\n{"tool":"calendar.list","input":{}}\n```');
    assert.equal(parsed.kind, "call");
    if (parsed.kind !== "call") return;
    assert.equal(parsed.request.tool, "calendar.list");
  });

  it("ignores prose and flags unknown tools", () => {
    assert.equal(parseToolJson("I can help with that.").kind, "none");
    const unknown = parseToolJson('{"tool":"phone.call","input":{"who":"Mom"}}');
    assert.equal(unknown.kind, "unknown");
    if (unknown.kind !== "unknown") return;
    assert.equal(unknown.name, "phone.call");
  });
});
