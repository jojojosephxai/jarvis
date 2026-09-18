import test from "node:test";
import assert from "node:assert/strict";
import { brainRows } from "./brain-rows.js";

test("offline bridge is a FLAG, not a fake OK", () => {
  const rows = brainRows({ reachable: false, xai: false, cursor: false });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "FLAG");
  assert.match(rows[0].detail, /not a model/i);
});

test("reachable with no keys tells Joseph how to mint them", () => {
  const [row] = brainRows({ reachable: true, xai: false, cursor: false });
  assert.equal(row.status, "FLAG");
  assert.match(row.detail, /console\.x\.ai/);
  assert.match(row.detail, /SuperGrok/);
  assert.match(row.detail, /cloud-agents/);
});

test("wired xAI and Cursor are separate honest OK rows", () => {
  const rows = brainRows({ reachable: true, xai: true, cursor: true });
  assert.equal(rows.find((r) => r.id === "xai").status, "OK");
  assert.equal(rows.find((r) => r.id === "link").status, "OK");
  assert.match(rows.find((r) => r.id === "link").detail, /not a silent cloud PR/i);
});

test("only Cursor still flags missing Grok", () => {
  const rows = brainRows({ reachable: true, xai: false, cursor: true });
  assert.equal(rows.find((r) => r.id === "xai").status, "FLAG");
  assert.equal(rows.find((r) => r.id === "link").status, "OK");
});
