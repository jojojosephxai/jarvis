/**
 * Distilled profile for the HUD.
 *
 * Source of truth is `../../JOSEPH.profile.md`. This is the subset the face is
 * allowed to say out loud — body, weight, and medical detail are deliberately
 * absent per Joseph's standing omit rule.
 */
export const PROFILE = {
  name: "Joseph",
  fullName: "Joseph Michael Apoian",
  grade: "9th grade",
  schoolYear: "2026–27",
  school: "Conestoga High School",
  district: "Tredyffrin/Easttown School District",
  area: "Wayne / Main Line, Chester County, PA",
  tone: "direct, brief, plain English — lead with the answer; no fluff or cheerleading",
  swim: {
    team: "Upper Main Line YMCA (UMLY)",
    group: "AG1B",
    events: ["100 breast", "200 breast", "200 IM", "400 IM"],
    /** The §9 evening grid — the only schedule the HUD plans against. */
    week: [
      "Mon 6–8pm distance threshold",
      "Tue 4–6pm IM active rest",
      "Wed 6–8pm VO2 (protect)",
      "Thu 6:15–8:15pm sprint threshold (protect)",
      "Fri off / optional lift later",
      "Sat 10am–12pm active rest or IM",
      "Sun off",
    ],
  },
  schoolDay: {
    firstBell: "7:50",
    out: "2:50",
    lunch: "~10:30am",
    cycle: "Garnet / Gray alternating",
    heavy: ["AP Biology", "AP World History", "Algebra 2"],
    also: ["Spanish 3", "Band/Jazz", "Culinary / Personal Finance"],
    homeworkCutoff: "10:15pm — after that, stop; sleep wins",
    homeworkWindow: "~3:15–5:20pm",
  },
  tools: ["Cursor Pro", "SuperGrok", "phone + computer", "Atelier app"],
  avoid: ["Grok Bot heavy use", "new subscriptions", "Ollama/hardware shopping"],
  rules: [
    "Explain simply; beginner coder until shown otherwise",
    "Ask before emailing, posting, or changing accounts",
    "Don't write assignments to turn in",
    "School + swim before coding rabbit holes",
    "Truth over comfort; short over padded",
  ],
  projects: {
    atelier: "Private wardrobe organizer — Cursor-first, not social",
  },
  goalsNear: [
    "Stay current in AP Bio + AP World",
    "Protect Wed VO2 and Thu sprint",
    "Ship small Atelier pieces",
    "PA YMCA States wins in breast; Nationals night final long-term",
  ],
  meetsNear: [
    "Tetrathlon Sep 26 UMLY (in-house — ask coach events)",
    "SJAC Fall Classic Oct 10–11 (first real USA time that mattered)",
    "Confirm Jan 15–17 meet before planning around it",
  ],
};

/**
 * Per-weekday context, straight off the §9 grid.
 * `protect` marks the two sessions Joseph has said not to trade away.
 */
const WEEK = {
  Monday: { water: "6–8pm", focus: "distance threshold", protect: false },
  Tuesday: { water: "4–6pm", focus: "IM active rest", protect: false },
  Wednesday: { water: "6–8pm", focus: "VO2", protect: true },
  Thursday: { water: "6:15–8:15pm", focus: "sprint threshold", protect: true },
  Friday: { water: null, focus: "off — optional lift later", protect: false },
  Saturday: { water: "10am–12pm", focus: "active rest or IM", protect: false },
  Sunday: { water: null, focus: "off", protect: false },
};

/**
 * Open items pulled from `JOSEPH.profile.md` §11 and §9 that only Joseph can close.
 * The HUD surfaces these instead of guessing. `until` retires an item once its
 * date has passed so the audit doesn't keep asking about a meet that already ran.
 */
export const OPEN_ITEMS = [
  {
    id: "practice-grid",
    status: "CONFLICT",
    label: "Practice grid",
    detail:
      "Two versions were on file. Evening AG1B grid wins; the morning version is retired. Confirm it's current.",
  },
  {
    id: "full-week",
    status: "FLAG",
    label: "Training load",
    detail: "Assuming the full AG1B week after the return-to-water ramp. Say if that changed.",
  },
  {
    id: "tetrathlon",
    status: "FLAG",
    label: "Tetrathlon Sep 26",
    detail: "In-house meet, four events unknown. Ask your coach which four.",
    until: "2026-09-27",
  },
  {
    id: "jan-meet",
    status: "FLAG",
    label: "Jan 15–17 meet",
    detail: "Still TBD. I won't plan a January taper around a meet that may not exist.",
    until: "2027-01-18",
  },
];

/** Open items that are still live on `date`. */
export function openItems(date = new Date()) {
  return OPEN_ITEMS.filter((item) => !item.until || new Date(item.until) > date);
}

export function greetingLine(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Today's school + swim shape, used by both the briefing and the overnight audit. */
export function dayContext(date = new Date()) {
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const day = WEEK[weekday] || { water: null, focus: "unknown", protect: false };
  const schoolDay = weekday !== "Saturday" && weekday !== "Sunday";
  return {
    weekday,
    schoolDay,
    school: schoolDay
      ? `School ${PROFILE.schoolDay.firstBell}–${PROFILE.schoolDay.out}`
      : "No school",
    swim: day.water ? `UMLY ${day.water} — ${day.focus}` : `Swim ${day.focus}`,
    protect: day.protect,
  };
}

const DAY_HINTS = {
  Monday: "UMLY 6–8pm distance — homework window ~3:15–5:20 before practice.",
  Tuesday: "Tight commute: school out 2:50 → practice 4:00. Triage homework fast.",
  Wednesday: "VO2 night — protect it. Homework before 6pm; lights-out ~10:15–10:30.",
  Thursday:
    "Sprint threshold night — protect it. Homework before practice; lights-out ~10:15–10:30.",
  Friday: "Swim off. Optional upper lift later if the week felt survivable.",
  Saturday: "Practice 10am–12pm. Don't sleep till 10.",
  Sunday: "Off. Y 8am–4pm is no-touch for lifts.",
};

export function buildBriefing(date = new Date()) {
  const { weekday } = dayContext(date);

  return {
    title: `${greetingLine(date)}, ${PROFILE.name}.`,
    lines: [
      "Online. What do you need?",
      DAY_HINTS[weekday] || "Confirm today's swim before we plan load.",
      `Heavy classes: ${PROFILE.schoolDay.heavy.join(", ")}.`,
      `After ${PROFILE.schoolDay.homeworkCutoff.split("—")[0].trim()}, stop — sleep wins.`,
    ],
    tonight: [
      "Dump what's due (class + task).",
      "One AP deep block (25–40 min), then stop that subject.",
      "Pack tomorrow / suit if needed.",
      "Protect sleep.",
    ],
  };
}
