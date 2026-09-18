import test from "node:test";
import assert from "node:assert/strict";
import { wantsFileEdit } from "./wants-file-edit.js";

test("ordinary talk is not a file edit", () => {
  assert.equal(wantsFileEdit("brief me"), false);
  assert.equal(wantsFileEdit("swim tonight"), false);
  assert.equal(wantsFileEdit("what's due"), false);
  assert.equal(wantsFileEdit("who am I"), false);
  assert.equal(wantsFileEdit("help"), false);
  assert.equal(wantsFileEdit(""), false);
});

test("capability questions stay talk", () => {
  assert.equal(wantsFileEdit("what can you change"), false);
  assert.equal(wantsFileEdit("how does the HUD work"), false);
});

test("HUD and source changes are file edits", () => {
  assert.equal(wantsFileEdit("add a new panel to the hud"), true);
  assert.equal(wantsFileEdit("rewrite your css"), true);
  assert.equal(wantsFileEdit("edit yourself"), true);
  assert.equal(wantsFileEdit("fix overnight.js"), true);
  assert.equal(wantsFileEdit("change your layout"), true);
  assert.equal(wantsFileEdit("can you add a panel"), true);
});

test("visual dials stay local (parseSelfEdit), not Cursor file edits", () => {
  assert.equal(wantsFileEdit("make the orb bigger"), false);
  assert.equal(wantsFileEdit("go amber"), false);
  assert.equal(wantsFileEdit("stars off"), false);
  assert.equal(wantsFileEdit("deeper voice"), false);
});
