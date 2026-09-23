import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { think } from "./brain";
import { resolveHand } from "./hands";
import { commitVaultWrite } from "./vault-write";

const roots: string[] = [];

async function makeVault(): Promise<{ root: string; vault: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "jarvis-write-"));
  roots.push(root);
  const vault = path.join(root, "vault");
  await mkdir(vault, { recursive: true });
  await writeFile(path.join(vault, "Preferences.md"), "# Preferences\n\n- Short rules.\n", "utf8");
  await writeFile(path.join(vault, "Swim.md"), "# Swim\n\n- Practice time:\n", "utf8");
  await writeFile(path.join(vault, "School.md"), "# School\n\n- Soccer is after school.\n", "utf8");
  await writeFile(path.join(vault, "Goals.md"), "# Goals\n\n- Science fair.\n", "utf8");
  await writeFile(path.join(vault, "About.md"), "# About\n\n- Name: Joseph\n", "utf8");
  return { root, vault };
}

function ask(root: string, vault: string, content: string) {
  return think([{ role: "user", content }], { root, vaultPath: vault, useModel: false });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("vault write-back", () => {
  it("adds a preference to Preferences.md and does not read it back", async () => {
    const { root, vault } = await makeVault();
    const saved = await ask(root, vault, "Remember that I like quiet reminders");
    assert.match(saved.reply, /Wrote Preferences\.md/);
    assert.match(saved.reply, /what changed/i);
    assert.doesNotMatch(saved.reply, /quiet reminders/);
    assert.doesNotMatch(saved.reply, /Short rules/);
    assert.equal(saved.receipts[0]?.input.file, "Preferences.md");
    assert.equal(saved.receipts[0]?.input.text, undefined);

    const note = await readFile(path.join(vault, "Preferences.md"), "utf8");
    assert.match(note, /I like quiet reminders/);
    assert.equal(note.match(/I like quiet reminders/g)?.length, 1);

    const again = await ask(root, vault, "Remember that I like quiet reminders");
    assert.match(again.reply, /did not write it again/i);
    const still = await readFile(path.join(vault, "Preferences.md"), "utf8");
    assert.equal(still.match(/I like quiet reminders/g)?.length, 1);

    const names = (await readdir(vault)).filter((name) => name.endsWith(".md"));
    assert.equal(names.length, 5);

    const receipt = await ask(root, vault, "what changed");
    assert.match(receipt.reply, /Preferences\.md/);
    assert.match(receipt.reply, /quiet reminders/);
    assert.match(receipt.reply, /Wrote it/);
    assert.match(receipt.reply, /receipt/i);
  });

  it("updates Swim.md for a swim fact instead of making a new note", async () => {
    const { root, vault } = await makeVault();
    const saved = await ask(root, vault, "Remember that swim practice is at 6am");
    assert.match(saved.reply, /Wrote Swim\.md/);
    assert.doesNotMatch(saved.reply, /6am/);
    const note = await readFile(path.join(vault, "Swim.md"), "utf8");
    assert.match(note, /swim practice is at 6am/i);
    const names = (await readdir(vault)).filter((name) => name.endsWith(".md"));
    assert.equal(names.length, 5);
  });

  it("puts a decision on Preferences.md", async () => {
    const { root, vault } = await makeVault();
    const saved = await ask(root, vault, "Remember that I decided practice stays in the morning");
    assert.match(saved.reply, /Preferences\.md/);
    const note = await readFile(path.join(vault, "Preferences.md"), "utf8");
    assert.match(note, /decided practice stays in the morning/i);
    const names = (await readdir(vault)).filter((name) => name.endsWith(".md"));
    assert.equal(names.length, 5);
  });

  it("waits for a yes before writing a secret", async () => {
    const { root, vault } = await makeVault();
    const waiting = await ask(root, vault, "Remember that my password is swordfish");
    assert.equal(waiting.plan?.state, "waiting");
    assert.equal(waiting.plan?.gate, "confirm");
    assert.equal(waiting.receipts.length, 0);
    assert.match(waiting.reply, /have not written/i);
    assert.equal(waiting.plan?.input.file?.includes(".."), false);
    const namesBefore = await readdir(vault);
    assert.equal(namesBefore.some((name) => /password/i.test(name)), false);
    const prefs = await readFile(path.join(vault, "Preferences.md"), "utf8");
    assert.doesNotMatch(prefs, /swordfish/);

    assert.ok(waiting.plan);
    const done = await resolveHand({ tool: "notes.keep", input: waiting.plan.input }, "yes", root, vault);
    assert.match(done.reply, /what changed/i);
    assert.doesNotMatch(done.reply, /swordfish/);
    assert.doesNotMatch(done.plan.steps.join("\n"), /Preview:/);
    const written = await readFile(path.join(vault, waiting.plan.input.file), "utf8");
    assert.match(written, /swordfish/);

    const receipt = await ask(root, vault, "what changed");
    assert.match(receipt.reply, new RegExp(waiting.plan.input.file.replace(".", "\\.")));
    assert.match(receipt.reply, /swordfish/);
    assert.match(receipt.reply, /Wrote it/);
  });

  it("does not write a long note until yes", async () => {
    const { root, vault } = await makeVault();
    const blob = `Remember that ${"a".repeat(500)}`;
    const waiting = await ask(root, vault, blob);
    assert.equal(waiting.plan?.gate, "confirm");
    assert.equal(waiting.receipts.length, 0);
    const names = (await readdir(vault)).filter((name) => name.endsWith(".md"));
    assert.equal(names.length, 5);
  });

  it("records an Obsidian edit without narrating it", async () => {
    const { root, vault } = await makeVault();
    await ask(root, vault, "hello");
    const schoolPath = path.join(vault, "School.md");
    const school = await readFile(schoolPath, "utf8");
    await writeFile(schoolPath, `${school}\n- Homeroom is period 9.\n`, "utf8");

    const answer = await ask(root, vault, "hello again");
    assert.match(answer.notice ?? "", /what changed/i);
    assert.match(answer.notice ?? "", /did not read it back/i);
    assert.doesNotMatch(answer.reply, /period 9/);
    assert.doesNotMatch(answer.reply, /reloaded/i);

    const receipt = await ask(root, vault, "what changed");
    assert.match(receipt.reply, /School\.md/);
    assert.match(receipt.reply, /period 9/);
    assert.match(receipt.reply, /Edited in Obsidian/);
    assert.doesNotMatch(receipt.reply, /Wrote it/);
  });

  it("does not claim a write when nothing changed", async () => {
    const { root, vault } = await makeVault();
    const receipt = await ask(root, vault, "what changed");
    assert.match(receipt.reply, /did not write a note/i);
    assert.doesNotMatch(receipt.reply, /Wrote/);
  });

  it("refuses a path outside the vault", async () => {
    const { root, vault } = await makeVault();
    const result = await commitVaultWrite(
      root,
      vault,
      { text: "leave the vault", file: "../secret.md", action: "create", needsConfirm: "no" },
      true,
    );
    assert.equal(result.status, "failed");
    await assert.rejects(readFile(path.join(root, "secret.md"), "utf8"));
  });
});
