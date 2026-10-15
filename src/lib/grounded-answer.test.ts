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

  it("keeps a model answer and still cites the notes that matched", async () => {
    const root = await makeVault();
    const answer = await answerFromVault("What grade is Joseph in?", {
      root,
      vaultPath: path.join(root, "vault"),
      useModel: true,
      complete: async (_question, packet) => {
        assert.match(packet, /School/);
        return { ok: true, text: "Joseph is in 9th grade (School)." };
      },
    });
    assert.equal(answer.mode, "grok");
    assert.match(answer.reply, /9th grade/);
    assert.match(answer.reply, /\(School\)/);
    assert.match(answer.reply, /Notes used:/);
    assert.match(answer.notice ?? "", /Notes used as context/);
  });

  it("calls the model for a greeting when no vault note matches", async () => {
    const root = await makeVault();
    let calls = 0;
    const answer = await answerFromVault("hello", {
      root,
      vaultPath: path.join(root, "vault"),
      useModel: true,
      complete: async (question, packet) => {
        calls += 1;
        assert.equal(question, "hello");
        assert.match(packet, /No vault note matched/);
        return { ok: true, text: "Hello. How can I help?" };
      },
    });
    assert.equal(calls, 1);
    assert.equal(answer.mode, "grok");
    assert.equal(answer.sources.length, 0);
    assert.match(answer.reply, /Hello\. How can I help\?/);
    assert.doesNotMatch(answer.reply, /don't have that in the vault notes|nothing was sent to a model/i);
    assert.equal(answer.notice, undefined);
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

  it("answers the clock without searching the vault", async () => {
    const now = new Date("2026-10-15T03:10:00Z");
    const result = await think([{ role: "user", content: "what time is it" }], {
      root: "/tmp/jarvis-no-vault-jos46",
      vaultPath: "/tmp/jarvis-no-vault-jos46/missing",
      useModel: false,
      now,
    });
    assert.equal(result.reply, "It's 11:10 PM Eastern.");
    assert.equal(result.sources?.length ?? 0, 0);
    assert.doesNotMatch(result.reply, /vault|school|practice/i);
  });

  it("still searches the vault for a practice time", async () => {
    const root = await makeVault();
    const result = await think([{ role: "user", content: "What time is swim practice?" }], {
      root,
      vaultPath: path.join(root, "vault"),
      useModel: false,
    });
    assert.match(result.reply, /Notes used:/);
    assert.match(result.reply, /Swim/);
  });

  it("sends the current time with a vault question", async () => {
    const root = await makeVault();
    let packet = "";
    await answerFromVault("What grade is Joseph in?", {
      root,
      vaultPath: path.join(root, "vault"),
      useModel: true,
      now: new Date("2026-10-15T03:10:00Z"),
      complete: async (_question, text) => {
        packet = text;
        return { ok: true, text: "Joseph is in 9th grade (School)." };
      },
    });
    assert.match(packet, /Current time:/);
    assert.match(packet, /America\/New_York/);
  });

  it("sends a greeting to the model instead of stopping at the vault", async () => {
    const root = await makeVault();
    let calls = 0;
    const result = await think([{ role: "user", content: "hello" }], {
      root,
      vaultPath: path.join(root, "vault"),
      useModel: true,
      complete: async () => {
        calls += 1;
        return { ok: true, text: "Hello. I am here." };
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.mode, "grok");
    assert.match(result.reply, /Hello\. I am here\./);
    assert.doesNotMatch(result.reply ?? "", /nothing was sent to a model/i);
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
    assert.match(swim.reply, /6|8pm|practice|AG1B|evening/i);
    assert.doesNotMatch(swim.reply, /don't have that in the vault notes/i);

    const email = await answerFromVault("Did you email me overnight?", {
      vaultPath: vault,
      useModel: false,
    });
    assert.match(email.reply, /don't have that in the vault notes/);
    assert.equal(email.sources.length, 0);
    assert.doesNotMatch(email.reply, /\b(sent|emailed|inbox)\b/i);
  });
});
