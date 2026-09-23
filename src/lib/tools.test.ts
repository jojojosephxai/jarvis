import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { executeTool } from "./tools";

const roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "jarvis-"));
  roots.push(root);
  await mkdir(path.join(root, "data", "notes"), { recursive: true });
  await writeFile(
    path.join(root, "data", "notes", "science-fair.md"),
    "# Science fair\n\nThe project idea is how light changes how fast plants grow.\n",
    "utf8",
  );
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("executeTool", () => {
  it("writes the demo calendar and returns a receipt", async () => {
    const root = await makeRoot();
    const receipt = await executeTool(
      {
        tool: "calendar.write",
        input: { title: "Soccer practice", when: "tomorrow at 4pm" },
      },
      root,
    );

    assert.equal(receipt.tool, "calendar.write");
    assert.equal(receipt.status, "demo");
    assert.equal(receipt.input.title, "Soccer practice");
    assert.match(receipt.outcome, /demo calendar/);
    assert.match(receipt.id, /^rcp_/);

    const saved = JSON.parse(
      await readFile(path.join(root, "data", "calendar.json"), "utf8"),
    ) as Array<{ title: string }>;
    assert.equal(saved[0]?.title, "Soccer practice");
  });

  it("lists what was saved", async () => {
    const root = await makeRoot();
    await executeTool(
      { tool: "calendar.write", input: { title: "Soccer practice", when: "tomorrow at 4pm" } },
      root,
    );
    const receipt = await executeTool({ tool: "calendar.list", input: {} }, root);
    assert.equal(receipt.status, "demo");
    assert.match(receipt.outcome, /Soccer practice/);
  });

  it("fails clearly when a calendar write is incomplete", async () => {
    const root = await makeRoot();
    const receipt = await executeTool(
      { tool: "calendar.write", input: { title: "Soccer" } },
      root,
    );
    assert.equal(receipt.status, "failed");
    assert.match(receipt.outcome, /time/);
  });

  it("searches local notes and saves a new one", async () => {
    const root = await makeRoot();
    const found = await executeTool(
      { tool: "notes.recall", input: { query: "science fair" } },
      root,
    );
    assert.equal(found.status, "done");
    assert.match(found.outcome, /plants grow/);

    const kept = await executeTool(
      { tool: "notes.keep", input: { text: "Buy poster board" } },
      root,
    );
    assert.equal(kept.status, "done");
    assert.match(kept.outcome, /Saved a note/);

    const again = await executeTool(
      { tool: "notes.recall", input: { query: "poster board" } },
      root,
    );
    assert.match(again.outcome, /poster board/i);
  });
});
