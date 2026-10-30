import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, type TestContext } from "node:test";

import { loadDoNext, type DoNextItem } from "./do-next.server";

const fixtures = path.resolve("tests/fixtures/do-next");

async function readAt(file: string | undefined) {
  const original = process.env.DO_NEXT_PATH;
  if (file === undefined) delete process.env.DO_NEXT_PATH;
  else process.env.DO_NEXT_PATH = file;
  try {
    return await loadDoNext();
  } finally {
    if (original === undefined) delete process.env.DO_NEXT_PATH;
    else process.env.DO_NEXT_PATH = original;
  }
}

async function tempFile(t: TestContext, contents: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "jarvis-do-next-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "do-next.json");
  await writeFile(file, contents);
  return file;
}

describe("local Do next reader (synthetic fixtures only)", () => {
  it("fails closed for unset, blank, relative, missing, and non-file paths", async () => {
    for (const file of [undefined, "", "  ", "tests/fixtures/do-next/items.json", path.join(fixtures, "missing.json"), fixtures]) {
      assert.equal(await readAt(file), null);
    }
  });

  it("returns an empty list for the empty fixture", async () => {
    assert.deepEqual(await readAt(path.join(fixtures, "empty.json")), { items: [] });
  });

  it("fails closed when reading a configured file is denied", async (t) => {
    t.mock.method(fs, "readFile", async () => { throw new Error("Synthetic read failure"); });
    assert.equal(await readAt(path.join(fixtures, "items.json")), null);
  });

  it("sorts the whole input before taking the first six", async (t) => {
    const expected: DoNextItem[] = JSON.parse(await readFile(path.join(fixtures, "items.json"), "utf8"));
    const input = [
      { task: "Unknown deadline", due: "not-a-date", bot: "Synthetic" },
      { task: "Later task", due: "2026-12-01", bot: "Synthetic" },
      ...[...expected].reverse(),
    ];
    assert.deepEqual(await readAt(await tempFile(t, JSON.stringify(input))), { items: expected });
  });

  it("compares timestamps by their timezone and preserves equal-date input order", async (t) => {
    const items = [
      { task: "Later", due: "2026-10-30T09:30:00-04:00", bot: "Synthetic" },
      { task: "First tie", due: "2026-10-30", bot: "Synthetic" },
      { task: "Earlier", due: "2026-10-30T14:00:00+02:00", bot: "Synthetic" },
      { task: "Second tie", due: "2026-10-30T00:00:00Z", bot: "Synthetic" },
    ];
    const data = await readAt(await tempFile(t, JSON.stringify(items)));
    assert.deepEqual(data?.items.map(item => item.task), ["First tie", "Second tie", "Earlier", "Later"]);
  });

  it("keeps invalid dates last, including impossible dates and ambiguous formats", async (t) => {
    const items = ["2026-02-30", "0", "2026-10-30T12:00:00", "", "2028-02-29"].map((due, index) => ({ task: `Task ${index}`, due, bot: "Synthetic" }));
    const data = await readAt(await tempFile(t, JSON.stringify(items)));
    assert.deepEqual(data?.items.map(item => item.task), ["Task 4", "Task 0", "Task 1", "Task 2", "Task 3"]);
    assert.deepEqual(data?.items.map(item => item.due), ["2028-02-29", "", "", "", ""]);
  });

  it("trims strings and returns only task, due, and bot", async (t) => {
    const input = [{ task: "  Synthetic task  ", due: " 2026-10-30 ", bot: " Synthetic bot ", extra: "ignored" }];
    assert.deepEqual(await readAt(await tempFile(t, JSON.stringify(input))), {
      items: [{ task: "Synthetic task", due: "2026-10-30", bot: "Synthetic bot" }],
    });
  });

  it("rejects invalid JSON and any bad-shaped row, even beyond the six-item limit", async (t) => {
    assert.equal(await readAt(path.join(fixtures, "invalid.json")), null);
    const good = { task: "Synthetic", due: "2026-10-30", bot: "Synthetic" };
    const inputs = ["{", "null", "{}", JSON.stringify([null]), JSON.stringify([[]]),
      JSON.stringify([{ ...good, task: " " }]), JSON.stringify([{ ...good, bot: "" }]),
      JSON.stringify([{ ...good, due: null }]), JSON.stringify([{ task: "Missing fields" }]),
      JSON.stringify([...Array(6).fill(good), { ...good, bot: 42 }])];
    for (const input of inputs) assert.equal(await readAt(await tempFile(t, input)), null);
  });

  it("rejects oversized files without exposing file contents", async (t) => {
    assert.equal(await readAt(await tempFile(t, " ".repeat(300_001))), null);
  });

  it("rereads the file only when called and never writes it", async (t) => {
    const file = await tempFile(t, "[]");
    assert.deepEqual(await readAt(file), { items: [] });
    const updated = '[{"task":"Updated synthetic task","due":"2026-10-30","bot":"Synthetic"}]';
    await writeFile(file, updated);
    assert.equal((await readAt(file))?.items[0].task, "Updated synthetic task");
    assert.equal(await readFile(file, "utf8"), updated);
  });
});
