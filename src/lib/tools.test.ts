import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { resolveHand } from "./hands";
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
    assert.match(receipt.outcome, /No calendar is connected/);
    assert.doesNotMatch(receipt.outcome, /demo calendar/);
    assert.match(receipt.outcome, /Auto-approved/);
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
    assert.equal(receipt.outcome, "Calendar not connected.");
    assert.doesNotMatch(receipt.outcome, /Soccer practice/);
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

  it("searches local notes and writes a vault note", async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, "vault"), { recursive: true });
    await writeFile(path.join(root, "vault", "Preferences.md"), "# Preferences\n\n- Notes live here.\n", "utf8");
    const found = await executeTool(
      { tool: "notes.recall", input: { query: "science fair" } },
      root,
    );
    assert.equal(found.status, "done");
    assert.match(found.outcome, /plants grow/);

    const kept = await executeTool(
      { tool: "notes.keep", input: { text: "I like quiet reminders" } },
      root,
      { approved: true, vaultDir: path.join(root, "vault") },
    );
    assert.equal(kept.status, "done");
    assert.equal(kept.input.file, "Preferences.md");
    assert.equal(kept.input.text, undefined);
    assert.match(kept.outcome, /Wrote Preferences\.md/);
    assert.match(kept.outcome, /what changed/i);
    assert.doesNotMatch(kept.outcome, /quiet reminders/);
    const saved = await readFile(path.join(root, "vault", "Preferences.md"), "utf8");
    assert.match(saved, /I like quiet reminders/);
  });

  it("stubs a browser open and does not claim the page loaded", async () => {
    const root = await makeRoot();
    const hand = await resolveHand(
      { tool: "browser.open", input: { url: "https://example.com" } },
      undefined,
      root,
    );
    assert.equal(hand.plan.gate, "auto");
    assert.equal(hand.plan.state, "approved");
    assert.equal(hand.receipts.length, 1);
    const receipt = hand.receipts[0];
    assert.equal(receipt?.status, "stub");
    assert.match(receipt?.outcome ?? "", /not running/i);
    assert.match(receipt?.outcome ?? "", /did not open/i);
    assert.doesNotMatch(receipt?.outcome ?? "", /successfully|I opened the page|page loaded/i);
  });

  it("waits for a yes before send, spend, or delete", async () => {
    const root = await makeRoot();
    const waiting = await resolveHand(
      { tool: "message.send", input: { to: "coach", body: "Practice moved" } },
      undefined,
      root,
    );
    assert.equal(waiting.plan.state, "waiting");
    assert.equal(waiting.plan.gate, "confirm");
    assert.equal(waiting.receipts.length, 0);
    assert.match(waiting.reply, /have not sent/i);

    const blocked = await executeTool(
      { tool: "message.send", input: { to: "coach", body: "Practice moved" } },
      root,
    );
    assert.equal(blocked.status, "blocked");
    assert.match(blocked.outcome, /did not send/i);
    assert.doesNotMatch(blocked.outcome, /email sent|sent the email|delivered/i);
  });

  it("still does not send mail after a yes", async () => {
    const root = await makeRoot();
    const hand = await resolveHand(
      {
        tool: "message.send",
        input: { to: "me", body: "the homework overnight" },
      },
      "yes",
      root,
    );
    assert.equal(hand.plan.state, "approved");
    assert.equal(hand.receipts[0]?.status, "stub");
    assert.match(hand.receipts[0]?.outcome ?? "", /did not send/i);
    assert.match(hand.receipts[0]?.outcome ?? "", /nothing is queued/i);
    assert.doesNotMatch(hand.receipts[0]?.outcome ?? "", /email sent|delivered|success/i);
  });

  it("does not spend money after a yes", async () => {
    const root = await makeRoot();
    const hand = await resolveHand(
      { tool: "money.spend", input: { amount: "$12", item: "pizza" } },
      "yes",
      root,
    );
    assert.equal(hand.receipts[0]?.status, "stub");
    assert.match(hand.receipts[0]?.outcome ?? "", /did not spend/i);
    assert.doesNotMatch(hand.receipts[0]?.outcome ?? "", /charged your|payment sent|success/i);
  });

  it("deletes a demo event only after yes", async () => {
    const root = await makeRoot();
    await executeTool(
      { tool: "calendar.write", input: { title: "Soccer practice", when: "tomorrow at 4pm" } },
      root,
    );

    const waiting = await resolveHand(
      { tool: "calendar.delete", input: { title: "Soccer practice" } },
      undefined,
      root,
    );
    assert.equal(waiting.receipts.length, 0);
    const stillThere = JSON.parse(
      await readFile(path.join(root, "data", "calendar.json"), "utf8"),
    ) as Array<{ title: string }>;
    assert.equal(stillThere.length, 1);

    const declined = await resolveHand(
      { tool: "calendar.delete", input: { title: "Soccer practice" } },
      "no",
      root,
    );
    assert.equal(declined.receipts[0]?.status, "declined");
    const afterNo = JSON.parse(
      await readFile(path.join(root, "data", "calendar.json"), "utf8"),
    ) as Array<{ title: string }>;
    assert.equal(afterNo.length, 1);

    const removed = await resolveHand(
      { tool: "calendar.delete", input: { title: "soccer practice" } },
      "yes",
      root,
    );
    assert.equal(removed.receipts[0]?.status, "done");
    assert.match(removed.receipts[0]?.outcome ?? "", /No calendar is connected/);
    assert.doesNotMatch(removed.receipts[0]?.outcome ?? "", /demo calendar/i);
    const afterYes = JSON.parse(
      await readFile(path.join(root, "data", "calendar.json"), "utf8"),
    ) as Array<{ title: string }>;
    assert.equal(afterYes.length, 0);
  });

  it("shows an auto-approved plan for a calendar write", async () => {
    const root = await makeRoot();
    const hand = await resolveHand(
      { tool: "calendar.write", input: { title: "Soccer practice", when: "tomorrow at 4pm" } },
      undefined,
      root,
    );
    assert.equal(hand.plan.gate, "auto");
    assert.equal(hand.plan.state, "approved");
    assert.equal(hand.receipts[0]?.status, "demo");
    assert.match(hand.plan.steps.join(" "), /auto-approved/i);
    assert.match(hand.receipts[0]?.outcome ?? "", /Auto-approved/);
  });
});
