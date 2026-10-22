import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it, mock } from "node:test";

import { pinnedContext } from "./pinned-context";
import { think, streamTurn } from "./brain";
import { answerFromVault, wordingStaysOnNotes } from "./grounded-answer";
import { promises as fs } from "node:fs";
import { chunkVaultNote, loadVaultNotes, type VaultNote } from "./vault-read";

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
    assert.doesNotMatch(answer.reply, /Notes used:/);
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
    assert.doesNotMatch(answer.reply, /Notes used:/);
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
    const answer = await answerFromVault("What grade is Joseph in at School?", {
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
    assert.doesNotMatch(answer.reply, /\(School\)/);
    assert.ok(answer.sources.length > 0);
    assert.doesNotMatch(answer.reply, /Notes used:/);
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
    assert.doesNotMatch(result.reply, /Notes used:/);
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
    assert.doesNotMatch(result.reply, /Notes used:/);
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

describe("synthetic fixture vault", () => {
  it("answers grade, the science fair, a blank swim time, and an email gap", async () => {
    const vault = path.resolve("tests/fixtures/vault");
    const grade = await answerFromVault("What grade is Joseph in?", {
      vaultPath: vault,
      useModel: false,
    });
    assert.match(grade.reply, /9th/);
    assert.doesNotMatch(grade.reply, /Notes used:/);
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

describe("pinned context and follow-ups", () => {
  const fixture = path.resolve("tests/fixtures/vault");
  const now = new Date("2026-10-22T16:00:00Z");
  it("pins About and today's Eastern weekday even without a retrieval hit", async () => {
    await answerFromVault("zebras", { vaultPath: fixture, now, useModel: true,
      complete: async (_question, packet) => {
        assert.match(packet, /About/);
        assert.match(packet, /Thursday/);
        assert.match(packet, /Map worksheet due Thursday/);
        assert.match(packet, /No vault note matched/);
        return { ok: true, text: "Zebras have stripes." };
      },
    });
  });
  it("answers tomorrow from the pinned schedule without a keyword hit", async () => {
    await answerFromVault("What do I have tomorrow?", { vaultPath: fixture, now, useModel: true,
      complete: async (_question, packet) => {
        assert.match(packet, /Tomorrow/);
        assert.match(packet, /Botany report due Friday/);
        assert.match(packet, /No vault note matched/);
        return { ok: true, text: "Your botany report is due Friday." };
      },
    });
  });
  it("uses the previous user question to retrieve a short follow-up", async () => {
    const answer = await answerFromVault("and on Friday?", { vaultPath: fixture, now, useModel: true,
      history: [{ role: "user", content: "what's due Thursday" }, { role: "assistant", content: "A map worksheet." }],
      complete: async (_question, packet, history) => {
        assert.match(packet, /# School-schedule/);
        assert.match(packet, /Botany report due Friday/);
        assert.equal(history?.[0].content, "what's due Thursday");
        return { ok: true, text: "The botany report is due Friday." };
      },
    });
    assert.ok(answer.sources.includes("School-schedule"));
  });
  it("keeps the complete pinned block under 1,400 characters with a full board", async () => {
    const block = await pinnedContext("tomorrow", { vaultPath: fixture, now, boardDigest: () => "Waiting on Joseph: model bridge. ".repeat(100) });
    assert.ok(block.length <= 1400, String(block.length));
    for (const label of ["About", "Preferences", "Voice-and-tone", "Today", "Tomorrow", "Goals", "Life dashboard"]) assert.ok(block.includes(label));
    assert.match(block, /Waiting on Joseph/);
  });
  it("includes the same profile in quick brain calls", async () => {
    await think([{ role: "user", content: "hi" }], { vaultPath: fixture, now, useModel: true,
      complete: async (_question, packet) => {
        assert.match(packet, /About/);
        assert.match(packet, /Map worksheet due Thursday/);
        return { ok: true, text: "Hello, Joseph." };
      },
    });
  });
  it("refreshes the profile when its file mtime changes and skips missing files", async () => {
    const root = await makeVault();
    const options = { root, vaultPath: "vault", now };
    assert.match(await pinnedContext("hello", options), /9th/);
    await writeFile(path.join(root, "vault", "About.md"), "# About\nSynthetic updated profile: pottery.");
    assert.match(await pinnedContext("hello", options), /pottery/);
    assert.doesNotMatch(await pinnedContext("hello", { ...options, vaultPath: "missing" }), /pottery/);
  });
});

describe("personal routing", () => {
  it("routes board project names through the grounded packet and hard model", async () => {
    const messages = [{ role: "user" as const, content: "How is Beacon?" }];
    const options = { vaultPath: path.resolve("tests/fixtures/vault"), boardDigest: () => "Project Beacon: waiting on Joseph.", useModel: true,
      complete: async (_question: string, packet: string) => {
        assert.doesNotMatch(packet, /No vault search/);
        assert.match(packet, /Life dashboard/);
        return { ok: true as const, text: "Beacon is waiting on you." };
      },
    };
    assert.equal((await think(messages, options)).model, "grok-4.7");
    for await (const event of streamTurn(messages, options)) if (event.type === "done") assert.equal(event.response.model, "grok-4.7");
  });
});


describe("heading retrieval and vault cache", () => {
  const fixture = path.resolve("tests/fixtures/vault");
  it("retrieves a deep section beyond the old 900-character clip", async () => {
    const answer = await answerFromVault("What is the prism calibration?", { vaultPath: fixture, useModel: true,
      complete: async (_question, packet) => {
        assert.match(packet, /# Long-note › Long note › Prism calibration/);
        assert.match(packet, /violet reference at 42 degrees/);
        assert.doesNotMatch(packet, /Background 0/);
        return { ok: true, text: "Use a violet reference at 42 degrees." };
      },
    });
    assert.deepEqual(answer.sources, ["Long-note"]);
  });
  it("bounds sections at 700 characters and preserves aliases and wikilinks", async () => {
    const loaded = await loadVaultNotes(fixture);
    assert.ok(loaded.ok);
    const chunks = loaded.notes.flatMap(chunkVaultNote);
    assert.ok(chunks.every(chunk => chunk.text.length <= 700));
    assert.ok(chunks.some(chunk => chunk.aliases.includes("Beacon")));
    assert.ok(chunks.some(chunk => chunk.links.includes("Spectrum lab")));
    for (const question of ["Beacon prism", "Spectrum lab"]) {
      const answer = await answerFromVault(question, { vaultPath: fixture, useModel: false });
      assert.ok(answer.sources.includes("Long-note"));
      assert.match(answer.reply, /42 degrees/);
    }
  });
  it("prefers a recent Journal entry when the terms match both dates", async () => {
    const answer = await answerFromVault("model bridge rehearsal", { vaultPath: fixture, now: new Date("2026-10-22T16:00:00Z"), useModel: false });
    assert.equal(answer.sources[0], "2026-10-22");
  });
  it("never promotes unknown model source ids into chips", async () => {
    const answer = await answerFromVault("prism calibration", { vaultPath: fixture, useModel: true,
      complete: async () => ({ ok: true, text: "Use 42 degrees.\n\nNotes used: Invented-private-note." }),
    });
    assert.deepEqual(answer.sources, ["Long-note"]);
    assert.doesNotMatch(answer.reply, /Notes used:|Invented-private-note/);
  });
  it("coalesces loads, checks at most every ten seconds, and reuses unchanged mtimes", async () => {
    const root = await makeVault();
    const directory = path.join(root, "vault");
    const read = mock.method(fs, "readFile", fs.readFile);
    const stat = mock.method(fs, "stat", fs.stat);
    try {
      await Promise.all([loadVaultNotes(directory, 1000), loadVaultNotes(directory, 1000)]);
      const reads = read.mock.callCount(), stats = stat.mock.callCount();
      assert.ok(reads > 0);
      await loadVaultNotes(directory, 9000);
      assert.equal(read.mock.callCount(), reads);
      assert.equal(stat.mock.callCount(), stats);
      await loadVaultNotes(directory, 11001);
      assert.equal(read.mock.callCount(), reads);
      assert.ok(stat.mock.callCount() > stats);
      await writeFile(path.join(directory, "School.md"), "# School\nA synthetic amended timetable.");
      const changed = await loadVaultNotes(directory, 21002);
      assert.ok(changed.ok && changed.notes.some(note => note.text.includes("amended timetable")));
      assert.equal(read.mock.callCount(), reads + 1);
      await rm(path.join(directory, "School.md"));
      const removed = await loadVaultNotes(directory, 31003);
      assert.ok(removed.ok && !removed.notes.some(note => note.title === "School"));
    } finally { read.mock.restore(); stat.mock.restore(); }
  });
});
