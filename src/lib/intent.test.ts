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

  it("reads a vault receipt request", () => {
    assert.equal(parseIntent("what changed").kind, "changes");
    assert.equal(parseIntent("What did you change in my notes?").kind, "changes");
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

  it("opens a link with the browser hand", () => {
    const parsed = parseIntent("Open https://example.com");
    assert.equal(parsed.kind, "tool");
    if (parsed.kind !== "tool") return;
    assert.equal(parsed.request.tool, "browser.open");
    assert.equal(parsed.request.input.url, "https://example.com/");
  });

  it("keeps a longer web request as a browser task", () => {
    const parsed = parseIntent("Open https://example.com and tell me the title");
    assert.equal(parsed.kind, "tool");
    if (parsed.kind !== "tool") return;
    assert.equal(parsed.request.tool, "browser.task");
    assert.equal(parsed.request.input.url, "https://example.com/");
    assert.match(parsed.request.input.task, /title/i);
  });

  it("asks before sending mail", () => {
    const parsed = parseIntent("Send an email to my coach that practice moved to 5");
    assert.equal(parsed.kind, "tool");
    if (parsed.kind !== "tool") return;
    assert.equal(parsed.request.tool, "message.send");
    assert.equal(parsed.request.input.to, "my coach");
    assert.match(parsed.request.input.body, /practice moved to 5/);
  });

  it("treats an overnight email as a send, not a finished delivery", () => {
    const parsed = parseIntent("email me the homework overnight");
    assert.equal(parsed.kind, "tool");
    if (parsed.kind !== "tool") return;
    assert.equal(parsed.request.tool, "message.send");
    assert.equal(parsed.request.input.to, "me");
    assert.match(parsed.request.input.body, /overnight/);
  });

  it("asks before spending", () => {
    const parsed = parseIntent("Spend $12 on pizza");
    assert.equal(parsed.kind, "tool");
    if (parsed.kind !== "tool") return;
    assert.equal(parsed.request.tool, "money.spend");
    assert.equal(parsed.request.input.amount, "$12");
    assert.equal(parsed.request.input.item, "pizza");
  });

  it("asks before deleting a calendar event", () => {
    const parsed = parseIntent("Delete soccer practice from my calendar");
    assert.equal(parsed.kind, "tool");
    if (parsed.kind !== "tool") return;
    assert.equal(parsed.request.tool, "calendar.delete");
    assert.equal(parsed.request.input.title, "soccer practice");
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
