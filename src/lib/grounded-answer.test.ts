import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { think } from "./brain";
import { answerFromVault, wordingStaysOnNotes } from "./grounded-answer";
import type { VaultNote } from "./vault-read";

const roots: string[] = [];

async function makeVault(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "jarvis-vault-"));
  roots.push(root);
  const vault = path.join(root, "vault");
  await mkdir(path.join(root, "data", "notes"), { recursive: true });
  await mkdir(vault, { recursive: true });
  await writeFile(
    path.join(root, "data", "notes", "secret.md"),
    "# Secret\n\nThe poster board color is orange.\n",
    "utf8",
  );
  await writeFile(
    path.join(vault, "School.md"),
    "# School\n\nJoseph is in 9th grade. The school name is not in the old notes.\n\n- Soccer practice is usually after school.\n- Science fair idea: how light changes how fast plants grow.\n",
    "utf8",
  );
  await writeFile(
    path.join(vault, "Goals.md"),
    "# Goals\n\nThe science fair project is about how light changes how fast plants grow.\n",
    "utf8",
  );
  await writeFile(
    path.join(vault, "Swim.md"),
    "# Swim\n\nPractice time:\n",
    "utf8",
  );
  await writeFile(
    path.join(vault, "About.md"),
    "# About\n\n- Name: Joseph\n- Grade: 9th\n",
    "utf8",
  );
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("answerFromVault", () => {
  it("quotes grade from the vault and does not invent a school name", async () => {
    const root = await makeVault();
    const answer = await answerFromVault("What grade is Joseph in?", {
      root,
      vaultPath: path.join(root, "vault"),
      useModel: false,
    });
    assert.match(answer.reply, /9th/);
    assert.match(answer.reply, /Notes used: .*School/);
    assert.ok(answer.sources.includes("School") || answer.sources.includes("About"));
    assert.doesNotMatch(answer.reply, /Lincoln|emailed|overnight/i);
    assert.equal(answer.mode, "demo");
  });

  it("cites the science fair notes", async () => {
    const root = await makeVault();
    const answer = await answerFromVault("What is the science fair project about?", {
      root,
      vaultPath: path.join(root, "vault"),
      useModel: false,
    });
    assert.match(answer.reply, /light/);
    assert.match(answer.reply, /plants/);
    assert.match(answer.reply, /Goals|School/);
    assert.match(answer.reply, /Notes used:/);
  });

  it("admits a blank swim time", async () => {
    const root = await makeVault();
    const answer = await answerFromVault("What time is swim practice?", {
      root,
      vaultPath: path.join(root, "vault"),
      useModel: false,
    });
    assert.ok(answer.sources.includes("Swim"));
    assert.match(answer.reply, /blank|Practice time:/i);
    assert.doesNotMatch(answer.reply, /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(am|pm)\b/i);
  });

  it("does not invent an overnight email", async () => {
    const root = await makeVault();
    const answer = await answerFromVault("Did you email me overnight?", {
      root,
      vaultPath: path.join(root, "vault"),
      useModel: false,
    });
    assert.match(answer.reply, /don't have that in the vault notes/);
    assert.equal(answer.sources.length, 0);
    assert.doesNotMatch(answer.reply, /\b(sent|emailed|inbox)\b/i);
  });

  it("ignores facts that are only in data/notes", async () => {
    const root = await makeVault();
    const answer = await answerFromVault("What color is the poster board?", {
      root,
      vaultPath: path.join(root, "vault"),
      useModel: false,
    });
    assert.match(answer.reply, /don't have that/);
    assert.doesNotMatch(answer.reply, /orange/);
  });

  it("says when the vault folder is missing", async () => {
    const root = await makeVault();
    const answer = await answerFromVault("What grade is Joseph in?", {
      root,
      vaultPath: path.join(root, "missing-vault"),
      useModel: false,
    });
    assert.match(answer.reply, /Brain wiring/);
    assert.doesNotMatch(answer.reply, /9th/);
    assert.equal(answer.sources.length, 0);
  });

  it("drops model wording that leaves the notes", async () => {
    const root = await makeVault();
    const answer = await answerFromVault("What grade is Joseph in?", {
      root,
      vaultPath: path.join(root, "vault"),
      useModel: true,
      complete: async () => ({
        ok: true,
        text: "Joseph attends Lincoln High and I emailed you overnight.",
      }),
    });
    assert.equal(answer.mode, "demo");
    assert.match(answer.reply, /9th/);
    assert.match(answer.notice ?? "", /dropped/);
    assert.doesNotMatch(answer.reply, /Lincoln|emailed/i);
  });

  it("keeps model wording that stays on the notes", async () => {
    const root = await makeVault();
    const answer = await answerFromVault("What grade is Joseph in?", {
      root,
      vaultPath: path.join(root, "vault"),
      useModel: true,
      complete: async () => ({
        ok: true,
        text: "Joseph is in 9th grade (School).",
      }),
    });
    assert.equal(answer.mode, "grok");
    assert.match(answer.reply, /9th grade/);
    assert.match(answer.reply, /Notes used:/);
    assert.match(answer.notice ?? "", /vault notes only/);
  });
});

describe("wordingStaysOnNotes", () => {
  const notes: VaultNote[] = [
    { title: "School", filePath: "School.md", text: "Joseph is in 9th grade." },
  ];

  it("rejects a school name that is not in the note", () => {
    assert.equal(wordingStaysOnNotes("Joseph attends Lincoln High (School).", notes), false);
  });

  it("accepts a sentence made of note words", () => {
    assert.equal(wordingStaysOnNotes("Joseph is in 9th grade (School).", notes), true);
  });
});

describe("think vault answers", () => {
  it("answers a note question from the vault", async () => {
    const root = await makeVault();
    const result = await think(
      [{ role: "user", content: "What do my notes say about the science fair?" }],
      { root, vaultPath: path.join(root, "vault"), useModel: false },
    );
    assert.equal(result.receipts.length, 0);
    assert.match(result.reply, /light/);
    assert.match(result.reply, /Notes used:/);
    assert.doesNotMatch(result.reply, /orange/);
  });

  it("still saves a calendar event", async () => {
    const root = await makeVault();
    const result = await think(
      [{ role: "user", content: "Put soccer practice on my calendar tomorrow at 4pm" }],
      { root, vaultPath: path.join(root, "vault"), useModel: false },
    );
    assert.equal(result.receipts[0]?.tool, "calendar.write");
    assert.equal(result.receipts[0]?.status, "demo");
  });
});

describe("starter vault", () => {
  it("answers grade, the science fair, a blank swim time, and an email gap", async () => {
    const vault = path.resolve("vault");
    const grade = await answerFromVault("What grade is Joseph in?", {
      vaultPath: vault,
      useModel: false,
    });
    assert.match(grade.reply, /9th/);
    assert.match(grade.reply, /Notes used:/);
    assert.ok(grade.sources.includes("School") || grade.sources.includes("About"));
    assert.doesNotMatch(grade.reply, /Lincoln|emailed/i);

    const fair = await answerFromVault("What is the science fair project about?", {
      vaultPath: vault,
      useModel: false,
    });
    assert.match(fair.reply, /light/);
    assert.ok(fair.sources.includes("Goals") || fair.sources.includes("School"));

    const swim = await answerFromVault("What time is swim practice?", {
      vaultPath: vault,
      useModel: false,
    });
    assert.ok(swim.sources.includes("Swim"));
    assert.match(swim.reply, /blank|not filled|do not mention/i);
    assert.doesNotMatch(swim.reply, /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(am|pm)\b/i);

    const email = await answerFromVault("Did you email me overnight?", {
      vaultPath: vault,
      useModel: false,
    });
    assert.match(email.reply, /don't have that in the vault notes/);
    assert.equal(email.sources.length, 0);
    assert.doesNotMatch(email.reply, /\b(sent|emailed|inbox)\b/i);
  });
});
