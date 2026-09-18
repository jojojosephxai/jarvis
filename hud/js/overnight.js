import { PROFILE, dayContext, openItems } from "./profile-data.js";
import { probeBridge } from "./bridge-client.js";
import { typeInto } from "./typewriter.js";
import { beat } from "./motion.js";
import { brainRows } from "./brain-rows.js";

/**
 * The Overnight audit.
 *
 * Every row here is backed by a check that actually ran when the page loaded, or
 * by an unresolved item written down in JOSEPH.profile.md. Nothing in this repo
 * reads mail, sends mail, or runs while the browser is closed — so the audit says
 * that out loud instead of faking an "everything is handled" screen.
 */

const SESSION_KEY = "jarvis.lastSession";

/**
 * What needs Joseph types in first and stays above the fold. The clean rows are
 * still listed, just underneath — an audit panel shouldn't bury its conflicts.
 */
const STATUS_ORDER = { CONFLICT: 0, FLAG: 1, OK: 2 };

function readLastSession() {
  try {
    const raw = window.localStorage?.getItem(SESSION_KEY);
    const at = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null; // private mode / storage blocked — treated as a first run
  }
}

function writeSession(now) {
  try {
    window.localStorage?.setItem(SESSION_KEY, String(now));
  } catch {
    /* storage blocked; the audit already reported it as a first run */
  }
}

function humanGap(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "moments";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

function sessionRow(date) {
  const last = readLastSession();
  writeSession(date.getTime());
  if (last === null) {
    return {
      id: "session",
      status: "OK",
      label: "Session",
      detail: "First run in this browser. No prior session to compare against.",
    };
  }
  return {
    id: "session",
    status: "OK",
    label: "Session",
    detail: `${humanGap(date.getTime() - last)} since your last session on this machine.`,
  };
}

function voiceRow() {
  const canHear = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const canSpeak = Boolean(window.speechSynthesis);
  if (canHear && canSpeak) {
    return {
      id: "voice",
      status: "OK",
      label: "Voice stack",
      detail: "Speech in and out available. Mic button or Space to talk.",
    };
  }
  if (canSpeak) {
    return {
      id: "voice",
      status: "FLAG",
      label: "Voice stack",
      detail: "Output only — this browser has no speech recognition. Type instead.",
    };
  }
  return {
    id: "voice",
    status: "FLAG",
    label: "Voice stack",
    detail: "Unavailable in this browser. Typed commands still work.",
  };
}

function dayRow(date) {
  const ctx = dayContext(date);
  const detail = ctx.protect
    ? `${ctx.school}. ${ctx.swim} — protect it.`
    : `${ctx.school}. ${ctx.swim}.`;
  return { id: "day", status: "OK", label: ctx.weekday, detail };
}

const NOTHING_RAN = {
  id: "unattended",
  status: "FLAG",
  label: "Unattended work",
  detail: "None. No mail read, drafted, or sent; no agent runs while this page is closed.",
};

const PRIVACY = {
  id: "privacy",
  status: "OK",
  label: "Profile kernel",
  detail: "Joseph context resident. Body and medical detail withheld by standing rule.",
};

/**
 * Run the audit. Performs the real checks, then returns sorted rows plus counts.
 * @param {Date} [date]
 * @param {{ probeBridge?: boolean }} [options]
 */
export async function collectAudit(date = new Date(), { probeBridge: probe = true } = {}) {
  const bridge = probe
    ? await probeBridge()
    : { reachable: false, xai: false, cursor: false, skipped: true };

  const rows = [
    sessionRow(date),
    PRIVACY,
    voiceRow(),
    dayRow(date),
    ...brainRows(bridge),
    NOTHING_RAN,
    ...openItems(date),
  ].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  return {
    rows,
    ok: rows.filter((r) => r.status === "OK").length,
    flags: rows.filter((r) => r.status === "FLAG").length,
    conflicts: rows.filter((r) => r.status === "CONFLICT").length,
    bridge,
  };
}

function rowNode(row) {
  const li = document.createElement("li");
  li.className = "audit__row";
  li.dataset.status = row.status;
  li.innerHTML = `
    <span class="audit__chip">${row.status}</span>
    <span class="audit__body">
      <b class="audit__label"></b>
      <span class="audit__detail"></span>
    </span>
  `;
  li.querySelector(".audit__label").textContent = row.label;
  return li;
}

/**
 * Paint the audit into the panel, typing each row in.
 * @param {HTMLElement | null} list
 * @param {{ rows: Array<{ status: string, label: string, detail: string }> }} audit
 * @param {{ wait: (ms: number) => Promise<void>, isCut: boolean }} seq
 */
export async function renderAudit(list, audit, seq) {
  if (!list) return;
  list.textContent = "";

  for (const row of audit.rows) {
    const li = rowNode(row);
    list.appendChild(li);
    // One frame so the chip has a state to flash in from.
    await seq.wait(beat(45, 0));
    li.classList.add("is-in");
    await typeInto(li.querySelector(".audit__detail"), row.detail, { seq, charMs: 5 });
    await seq.wait(beat(95, 0));
  }
}
