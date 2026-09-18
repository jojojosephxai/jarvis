import test from "node:test";
import assert from "node:assert/strict";
import { buildBriefing, dayContext, greetingLine, openItems, PROFILE } from "./profile-data.js";

test("profile has Joseph identity", () => {
  assert.equal(PROFILE.name, "Joseph");
  assert.match(PROFILE.school, /Conestoga/);
  assert.ok(PROFILE.swim.events.includes("100 breast"));
});

test("briefing is day-aware", () => {
  const thu = new Date("2026-09-17T15:00:00");
  const b = buildBriefing(thu);
  assert.match(b.title, /Joseph/);
  assert.ok(b.lines.some((l) => /Sprint|protect/i.test(l)));
  assert.equal(b.tonight.length, 4);
});

test("greeting changes by hour", () => {
  assert.equal(greetingLine(new Date("2026-09-17T09:00:00")), "Good morning");
  assert.equal(greetingLine(new Date("2026-09-17T15:00:00")), "Good afternoon");
  assert.equal(greetingLine(new Date("2026-09-17T20:00:00")), "Good evening");
});

test("only the evening grid is on file — no morning practices, no doubles", () => {
  const week = PROFILE.swim.week.join(" ").toLowerCase();
  assert.ok(!week.includes("am "), "grid should have no morning sessions");
  assert.ok(!week.includes("double"), "grid should have no doubles");
  assert.match(PROFILE.swim.week.join(" "), /Wed 6–8pm VO2/);
});

test("day context protects the Wednesday and Thursday sessions", () => {
  assert.equal(dayContext(new Date("2026-09-16T16:00:00")).protect, true); // Wed
  assert.equal(dayContext(new Date("2026-09-17T16:00:00")).protect, true); // Thu
  assert.equal(dayContext(new Date("2026-09-18T16:00:00")).protect, false); // Fri
});

test("day context knows when there is no school", () => {
  const sat = dayContext(new Date("2026-09-19T09:00:00"));
  assert.equal(sat.schoolDay, false);
  assert.match(sat.swim, /10am–12pm/);
});

test("the practice grid conflict stays open until Joseph confirms it", () => {
  const conflict = openItems(new Date("2026-09-18T07:00:00")).find((i) => i.id === "practice-grid");
  assert.equal(conflict.status, "CONFLICT");
  assert.match(conflict.detail, /morning version is retired/);
});

test("dated open items retire once their date has passed", () => {
  const before = openItems(new Date("2026-09-18T07:00:00")).map((i) => i.id);
  assert.ok(before.includes("tetrathlon"), "Tetrathlon is still ahead on Sep 18");

  const after = openItems(new Date("2026-10-01T07:00:00")).map((i) => i.id);
  assert.ok(!after.includes("tetrathlon"), "Tetrathlon should retire after Sep 26");
  assert.ok(after.includes("jan-meet"), "the January meet is still unconfirmed");

  const muchLater = openItems(new Date("2027-06-01T07:00:00")).map((i) => i.id);
  assert.deepEqual(muchLater, ["practice-grid", "full-week"]);
});
