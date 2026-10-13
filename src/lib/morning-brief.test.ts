import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { think } from "./brain";
import { composeMorningBrief, isMorningBriefRequest, loadMorningBrief, MAIL_LINE } from "./morning-brief";
import type { CalendarEvent } from "./types";
import type { VaultNote } from "./vault-read";

const NOW = new Date("2026-09-23T14:00:00.000Z");

function event(title: string, when: string): CalendarEvent {
  return {
    id: `evt_${title}`,
    title,
    when,
    detail: "",
    createdAt: "2026-09-23T12:00:00.000Z",
  };
}

function note(title: string, text: string): VaultNote {
  return { title, filePath: `/vault/${title}.md`, text };
}

describe("isMorningBriefRequest", () => {
  it("accepts the morning brief commands", () => {
    assert.equal(isMorningBriefRequest("morning brief"), true);
    assert.equal(isMorningBriefRequest("Jarvis, show me my daily brief."), true);
    assert.equal(isMorningBriefRequest("what's my morning brief?"), true);
    assert.equal(isMorningBriefRequest("brief me"), true);
  });

  it("leaves vault questions and mail alone", () => {
    assert.equal(isMorningBriefRequest("Did you email me overnight?"), false);
    assert.equal(isMorningBriefRequest("What grade is Joseph in?"), false);
    assert.equal(isMorningBriefRequest("What time is swim practice?"), false);
    assert.equal(isMorningBriefRequest("Put soccer practice on my calendar tomorrow at 4pm"), false);
  });
});

describe("composeMorningBrief", () => {
  it("says the calendar is empty and does not invent events or mail", () => {
    const brief = composeMorningBrief({
      now: NOW,
      timeZone: "UTC",
      events: [],
      loaded: {
        ok: true,
        directory: "/vault",
        notes: [
          note(
            "Goals",
            "# Goals\n\nThe science fair project is about how light changes how fast plants grow. The board needs a title, three sections, and a few photos.\n\nNo other goals were in the old notes. Add yours below this line.\n\n-\n",
          ),
          note(
            "School",
            "# School\n\nJoseph is in 9th grade.\n\n- Soccer practice is usually after school.\n- A library book is due Friday. The book title was not written down.\n- Science fair idea: how light changes how fast plants grow. The board needs a title, three sections, and a few photos.\n",
          ),
          note(
            "About",
            "# About\n\n- Name: Joseph\n- Grade: 9th\n- This folder is the Obsidian vault for Jarvis.\n",
          ),
          note(
            "Swim",
            "# Swim\n\nThis page is for swim.\n\nWrite the real details when you have them:\n\n- Team or pool:\n- Practice days:\n- Practice time:\n- What you are working on:\n",
          ),
          note("README", "# Open this folder\n\nOpen the vault folder in Obsidian.\n"),
        ],
      },
    });

    assert.equal(brief.heading, "Wednesday, September 23");
    assert.equal(brief.calendarEmpty, true);
    assert.equal(brief.events.length, 0);
    assert.equal(brief.vaultThin, true);
    assert.equal(brief.calendarNote, "Calendar not connected");
    assert.match(brief.reply, /Calendar not connected/);
    assert.doesNotMatch(brief.reply, /demo calendar|Notes checked:|did not call Grok/i);
    assert.doesNotMatch(brief.reply, /^Not written down$/m);
    assert.match(brief.spoken, /Good afternoon\. The calendar is not connected/i);
    assert.doesNotMatch(brief.spoken, /Notes checked|Not written down|demo calendar|did not call Grok/i);
    assert.match(brief.reply, /library book is due Friday/i);
    assert.match(brief.reply, /science fair project/i);
    assert.match(brief.reply, /Soccer practice is usually after school/i);
    assert.equal(brief.priorities.filter((item) => /science fair/i.test(item.line)).length, 1);
    assert.equal(brief.priorities.some((item) => /name: joseph/i.test(item.line)), false);
    assert.equal(brief.priorities.some((item) => /^#|grade: 9th/i.test(item.line)), false);
    assert.equal(brief.gaps.some((gap) => /write the real details/i.test(gap.field)), false);
    assert.ok(brief.gaps.some((gap) => gap.note === "Swim" && gap.field === "Practice time"));
    assert.equal(brief.mail, MAIL_LINE);
    assert.match(brief.reply, /No mail was read/);
    assert.doesNotMatch(brief.reply, /did not call Grok/i);
    assert.match(brief.reply, /Ask in the talk box/i);
    assert.doesNotMatch(brief.reply, /emailed you|email was sent|sent you an email|in your inbox/i);
    assert.equal(brief.sources.includes("README"), false);
    assert.equal(brief.checked.includes("README"), true);
  });

  it("lists saved events exactly and skips a model when the vault is filled in", () => {
    const brief = composeMorningBrief({
      now: NOW,
      timeZone: "UTC",
      events: [event("Soccer practice", "tomorrow at 4pm"), event("Library return", "Friday at 3pm")],
      loaded: {
        ok: true,
        directory: "/vault",
        notes: [
          note("Goals", "# Goals\n\n- Finish the plant lab writeup.\n- Pack the science board photos.\n"),
          note("Swim", "# Swim\n\n- Practice days: Monday and Wednesday\n- Practice time: 6:30am\n"),
        ],
      },
    });

    assert.equal(brief.calendarEmpty, true);
    assert.equal(brief.events.length, 0);
    assert.equal(brief.calendarNote, "Calendar not connected");
    assert.equal(brief.vaultThin, false);
    assert.equal(brief.escalate, null);
    assert.doesNotMatch(brief.reply, /Soccer practice|tomorrow at 4pm|Library return/);
    assert.match(brief.reply, /Finish the plant lab writeup/);
    assert.match(brief.reply, /Practice time: 6:30am/);
    assert.doesNotMatch(brief.reply, /Apple Calendar event|Google event|new meeting/i);
    assert.doesNotMatch(brief.reply, /emailed you|email was sent/i);
  });

  it("does not invent priorities when the vault folder is missing", () => {
    const brief = composeMorningBrief({
      now: NOW,
      timeZone: "UTC",
      events: [],
      loaded: { ok: false, directory: "/missing", problem: "that folder was not found" },
    });

    assert.equal(brief.vaultThin, true);
    assert.equal(brief.priorities.length, 0);
    assert.match(brief.vaultNote, /Brain wiring/);
    assert.match(brief.vaultNote, /not found/);
    assert.match(brief.reply, /Nothing was invented/i);
    assert.doesNotMatch(brief.reply, /did not call Grok/i);
    assert.doesNotMatch(brief.reply, /library book|soccer|swim practice at/i);
  });
});

describe("loadMorningBrief", () => {
  it("does not treat the calendar file as the day", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "brief-"));
    await mkdir(path.join(root, "vault"), { recursive: true });
    await mkdir(path.join(root, "data"), { recursive: true });
    await writeFile(
      path.join(root, "vault", "Goals.md"),
      "# Goals\n\n- Finish the plant lab writeup.\n- Pack the science board photos.\n",
    );
    await writeFile(
      path.join(root, "data", "calendar.json"),
      JSON.stringify([event("Soccer", "tomorrow at 4pm")]),
    );

    const brief = await loadMorningBrief({ root, now: NOW, timeZone: "UTC" });
    assert.equal(brief.calendarEmpty, true);
    assert.equal(brief.events.length, 0);
    assert.match(brief.reply, /Calendar not connected/);
    assert.doesNotMatch(brief.reply, /Soccer/);
    assert.match(brief.reply, /Finish the plant lab writeup/);
    assert.match(brief.reply, /No mail was read/);

    const response = await think([{ role: "user", content: "morning brief" }], {
      root,
      useModel: true,
      complete: async () => {
        throw new Error("Grok should not be called for the morning brief");
      },
    });
    assert.equal(response.mode, "demo");
    assert.equal(response.receipts.length, 0);
    assert.match(response.reply, /Morning brief —/);
    assert.match(response.reply, /Calendar not connected/);
    assert.doesNotMatch(response.reply, /Soccer/);
    assert.equal(response.brief?.events.length, 0);
    assert.match(response.brief?.spoken ?? "", /calendar is not connected/i);
  });

  it("stays honest when this computer has no demo events", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "brief-empty-"));
    await mkdir(path.join(root, "vault"), { recursive: true });
    await writeFile(path.join(root, "vault", "Goals.md"), "# Goals\n\nAdd yours below this line.\n\n-\n");

    const brief = await loadMorningBrief({ root, now: NOW, timeZone: "UTC" });
    assert.equal(brief.calendarEmpty, true);
    assert.equal(brief.events.length, 0);
    assert.equal(brief.priorities.length, 0);
    assert.match(brief.reply, /Calendar not connected/);
    assert.match(brief.reply, /vault is thin/i);
    assert.doesNotMatch(brief.reply, /tomorrow at 4pm|Soccer/);
  });
});
