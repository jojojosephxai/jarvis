import { PROFILE, buildBriefing, dayContext, greetingLine } from "./profile-data.js";
import { startStarfield } from "./stars.js";
import { playBootChirp, playAckBlip, unlockAudio } from "./sfx.js";
import { askBridge } from "./bridge-client.js";
import { startWireOrb } from "./wire-orb.js";
import { createSequence } from "./sequence.js";
import { playBoot, playVisor, playAssemble, markCut } from "./cinematic.js";
import { collectAudit, renderAudit } from "./overnight.js";
import { typeInto, deliverySpeed } from "./typewriter.js";
import { beat } from "./motion.js";

const state = {
  voiceOn: true,
  listening: false,
  recognition: null,
  /** True once the cinematic has handed control to the HUD. */
  live: false,
  /** Latest overnight audit, so "overnight" can be re-asked at any time. */
  audit: null,
  /** Set from the audit's bridge probe. Stays false unless a bridge answered,
   *  so we don't fire a doomed request (and log a console error) per command. */
  bridgeOnline: false,
  /** A line the browser refused to speak before the page was interacted with. */
  pendingSpeech: null,
  /** Bumps on every new command so stale replies/speech are ignored */
  cmdSeq: 0,
};

/** @type {{ setMode: (m: string) => void, destroy: () => void } | null} */
let wireOrb = null;

const el = {
  bootLog: document.getElementById("boot-log"),
  bootBar: document.getElementById("boot-bar"),
  bootPct: document.getElementById("boot-pct"),
  skip: document.getElementById("skip-boot"),
  clock: document.getElementById("clock"),
  statePill: document.getElementById("state-pill"),
  orb: document.getElementById("orb"),
  orbWire: document.getElementById("orb-wire"),
  briefing: document.getElementById("briefing"),
  audit: document.getElementById("audit"),
  tonight: document.getElementById("tonight-list"),
  feed: document.getElementById("feed"),
  transcript: document.getElementById("transcript"),
  listenHint: document.getElementById("listen-hint"),
  wave: document.getElementById("wave"),
  mic: document.getElementById("mic-btn"),
  form: document.getElementById("chat-form"),
  input: document.getElementById("chat-input"),
  briefBtn: document.getElementById("brief-btn"),
  speakToggle: document.getElementById("speak-toggle"),
  sysVoice: document.getElementById("sys-voice"),
  sysCursor: document.getElementById("sys-cursor"),
  stars: document.getElementById("starfield"),
};

/* ——— HUD state ——— */

/** True when a reply will actually be read out loud, not just printed. */
function voiceActive() {
  return state.voiceOn && Boolean(window.speechSynthesis) && !state.pendingSpeech;
}

function setState(mode) {
  const map = {
    idle: ["STANDBY", "pill--idle"],
    listen: ["LISTENING", "pill--listen"],
    think: ["THINKING", "pill--think"],
    // Don't claim to be speaking when the voice is muted or blocked.
    speak: [voiceActive() ? "SPEAKING" : "REPLYING", "pill--speak"],
  };
  const [label, cls] = map[mode] || map.idle;
  el.statePill.className = `pill ${cls}`;
  el.statePill.textContent = label;
  el.orb.classList.toggle("is-listen", mode === "listen");
  el.orb.classList.toggle("is-speak", mode === "speak");
  el.orb.classList.toggle("is-think", mode === "think");
  el.wave?.classList.toggle("is-on", mode === "listen" || mode === "speak" || mode === "think");
  el.listenHint?.classList.toggle("is-active", mode === "listen");
  if (el.listenHint) {
    if (mode === "listen") el.listenHint.textContent = "Listening…";
    else if (mode === "think") el.listenHint.textContent = "Got it — thinking…";
    else if (mode === "speak") el.listenHint.textContent = voiceActive() ? "Speaking…" : "Replying…";
    else if (state.pendingSpeech) el.listenHint.textContent = "Click anywhere to let me speak";
    else el.listenHint.textContent = "Say “Hey Jarvis” or press the mic";
  }
  wireOrb?.setMode(mode);
}

function flashHeard() {
  el.orb?.classList.add("is-heard");
  el.transcript?.classList.add("is-echo");
  window.setTimeout(() => {
    el.orb?.classList.remove("is-heard");
    el.transcript?.classList.remove("is-echo");
  }, 450);
}

function cancelSpeech() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

function tickClock() {
  el.clock.textContent = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* ——— Speech ——— */

/** Split into sentences so voice can start the first beat immediately. */
function sentences(text) {
  const parts = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  return (parts || [text]).map((s) => s.trim()).filter(Boolean);
}

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return (
    voices.find((v) => /en(-|_)GB/i.test(v.lang) && /male|daniel|george|ryan/i.test(v.name)) ||
    voices.find((v) => /en(-|_)GB/i.test(v.lang)) ||
    voices.find((v) => /en(-|_)US/i.test(v.lang)) ||
    null
  );
}

/**
 * Speak a reply. Starts the first sentence ASAP and queues the rest so a long
 * answer doesn't delay the first beat. Resolves when the voice is done, or
 * immediately when voice is off or unavailable.
 * @param {string} text
 * @param {number} seq command sequence — bail if a newer command took over
 * @returns {Promise<void>}
 */
function speak(text, seq) {
  return new Promise((resolve) => {
    if (!state.voiceOn || !window.speechSynthesis) return resolve();
    cancelSpeech();
    const chunks = sentences(text);
    const voice = pickVoice();
    let i = 0;

    const next = () => {
      if (seq !== state.cmdSeq || i >= chunks.length) return resolve();
      const u = new SpeechSynthesisUtterance(chunks[i]);
      const isFirst = i === 0;
      i += 1;
      u.rate = 1.04;
      u.pitch = 0.9;
      if (voice) u.voice = voice;
      u.onend = next;
      u.onerror = (ev) => {
        // Browsers refuse to speak until the page has been interacted with, and
        // a machine with no voices installed fails outright. Hold the line
        // rather than dropping it silently.
        if (isFirst && /not-allowed|synthesis-failed|blocked/i.test(ev.error || "")) {
          state.pendingSpeech = text;
        }
        resolve();
      };
      window.speechSynthesis.speak(u);
    };
    next();
  });
}

/** @type {{ cut: () => void } | null} */
let delivery = null;

/**
 * Deliver a reply: type it onto the transcript while the voice reads it, and
 * hold the SPEAKING state until both finish. The state is tied to delivery
 * rather than to the voice alone, so the HUD still reads correctly with the
 * voice muted or unavailable.
 */
async function deliverReply(text, seq, { feed = true } = {}) {
  if (seq !== state.cmdSeq) return; // a newer command already owns the transcript
  delivery?.cut();
  const ctl = createSequence();
  delivery = ctl;

  if (feed) addFeed("Jarvis", text);
  setState("speak");

  const startedAt = performance.now();
  const voice = speak(text, seq);
  await typeInto(el.transcript, text, { seq: ctl, charMs: deliverySpeed(text.length) });
  await voice;

  // Without a voice — muted, blocked, or motion reduced so the text lands at
  // once — delivery can finish in a frame. Hold the state long enough to read.
  const remaining = 420 - (performance.now() - startedAt);
  if (remaining > 0) await ctl.wait(remaining);

  if (seq === state.cmdSeq) setState("idle");
}

let gestureSeen = false;

/** First click or keypress unblocks audio and delivers any held wake line. */
function onFirstGesture() {
  if (gestureSeen) return;
  gestureSeen = true;
  unlockAudio();

  const held = state.pendingSpeech;
  state.pendingSpeech = null; // audio is unlocked now; re-set it if speech still fails
  if (!held) return;

  // That click may have been aimed at Brief me or the mic. Give the command it
  // started a moment to claim the reply rather than talking over it.
  const seq = state.cmdSeq;
  window.setTimeout(() => {
    if (seq === state.cmdSeq) deliverReply(held, seq, { feed: false });
  }, 140);
}

/* ——— Panels ——— */

function addFeed(role, text) {
  const node = document.createElement("div");
  node.className = `msg${role === "You" ? " msg--user" : ""}`;
  node.innerHTML = `<strong>${role}</strong><div></div>`;
  node.querySelector("div").textContent = text;
  el.feed.prepend(node);
}

function renderBriefing() {
  const b = buildBriefing();
  el.briefing.innerHTML = `
    <p><strong>${b.title}</strong></p>
    <ul>${b.lines.map((l) => `<li>${l}</li>`).join("")}</ul>
  `;
  el.tonight.innerHTML = b.tonight.map((t) => `<li>${t}</li>`).join("");
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

function count(n, noun) {
  const word = NUMBER_WORDS[n] ?? String(n);
  return `${word} ${noun}${n === 1 ? "" : "s"}`;
}

/** One short line from a steward reporting in — not a chatbot greeting. */
function wakeLine(audit, date = new Date()) {
  const tally = [];
  if (audit.conflicts) tally.push(count(audit.conflicts, "conflict"));
  if (audit.flags) tally.push(count(audit.flags, "flag"));
  const verdict = tally.length ? `${tally.join(", ")}` : "nothing outstanding";
  return [
    `${greetingLine(date)}, ${PROFILE.name}. Systems online.`,
    `Overnight audit: ${verdict}.`,
    "Nothing ran on your behalf, and nothing was sent.",
  ].join(" ");
}

function overnightReply() {
  if (!state.audit) return "The audit is still running. One moment.";
  const notable = state.audit.rows.filter((r) => r.status !== "OK");
  const head = `${count(state.audit.conflicts, "conflict")}, ${count(
    state.audit.flags,
    "flag",
  )}, ${count(state.audit.ok, "row")} clear. Nothing ran on your behalf and nothing was sent.`;
  if (!notable.length) return head;
  return [head, ...notable.map((r) => `${r.label}: ${r.detail}`)].join("\n");
}

/* ——— Local brain ———
   Profile is silent memory. Dry and helpful by default; only dump school/swim
   detail when Joseph actually asks for it. */

function jarvisReply(raw) {
  const q = raw.trim().toLowerCase();
  if (!q) return "Standing by.";

  if (/^(hey )?jarvis\b/.test(q) && q.replace(/^(hey )?jarvis[,!.\s]*/i, "").length < 2) {
    return `Yes, ${PROFILE.name}?`;
  }

  if (/overnight|audit|flags?|conflicts?/.test(q)) {
    return overnightReply();
  }

  if (/brief|status|morning|wake|systems/.test(q)) {
    const b = buildBriefing();
    return `${b.title} ${b.lines.join(" ")}`;
  }

  if (/school|homework|bio|world|tonight|due/.test(q)) {
    const today = dayContext();
    const beforePractice = today.swim.startsWith("UMLY")
      ? `Homework window ${PROFILE.schoolDay.homeworkWindow}, before practice.`
      : "No practice tonight — the whole evening is yours.";
    return [
      "School first.",
      `Heavy load: ${PROFILE.schoolDay.heavy.join(", ")}.`,
      beforePractice,
      "Send what's due — class and task. I'll triage must-submit, must-study, can-slide.",
      "I won't write the assignment. Quiz and map only.",
      PROFILE.schoolDay.homeworkCutoff,
    ].join(" ");
  }

  if (/swim|practice|umly|breast|meet|vo2/.test(q)) {
    return [
      `${PROFILE.swim.team}, ${PROFILE.swim.group}. Events: ${PROFILE.swim.events.join(", ")}.`,
      "Week:",
      `${PROFILE.swim.week.join("; ")}.`,
      "That grid is still unconfirmed — say if it changed.",
      `Near meets: ${PROFILE.meetsNear.join("; ")}.`,
    ].join(" ");
  }

  if (/atelier|code|cursor|app/.test(q)) {
    return "Atelier stays private — no social creep. Smallest finished piece in Cursor. File, bug, done-for-tonight. No new subscriptions.";
  }

  if (/who am i|about me|profile|remember/.test(q)) {
    return [
      `${PROFILE.fullName}. ${PROFILE.grade}, ${PROFILE.school}.`,
      `Near goals: ${PROFILE.goalsNear.slice(0, 3).join("; ")}.`,
      "I keep the rest quiet unless you ask.",
    ].join(" ");
  }

  if (/faith|church|bible|scripture/.test(q)) {
    return "Noted. I can close serious character topics with brief biblical and logical support — not a sermon on every homework question.";
  }

  if (/remind|watch|research topic|ping/.test(q)) {
    return "Name the topic and the ping rule. School block wins if both fight for the same hour.";
  }

  if (/sleep|bed|tired|10:15/.test(q)) {
    return "Sleep is a performance input. After 10:15: homework stops, kitchen closed, phone off the pillow.";
  }

  if (/help|what can you do|commands/.test(q)) {
    return "Try: brief me · overnight · school tonight · swim · atelier · who am I · sleep. Mic or Space to talk.";
  }

  return "Understood. Say the job — school, swim, Atelier, or a quick question — and I'll take it from there.";
}

async function handleCommand(text) {
  const seq = ++state.cmdSeq;
  cancelSpeech();
  delivery?.cut();

  const cleaned = text.replace(/^(hey )?jarvis[,!.\s]*/i, "").trim() || text;

  // Immediate "heard you" feedback — before any await
  addFeed("You", text);
  playAckBlip();
  flashHeard();
  el.transcript.textContent = `Heard: ${text}`;
  setState("think");

  // Let the pill/orb paint one frame, then answer (no fake lag)
  await new Promise((r) => requestAnimationFrame(() => r()));

  const remote = state.bridgeOnline ? await askBridge(cleaned) : null;
  if (seq !== state.cmdSeq) return;

  await deliverReply(remote || jarvisReply(cleaned), seq);
}

/* ——— Opening sequence ——— */

const sequence = createSequence();

function cutCinematic() {
  if (state.live || sequence.isCut) return;
  markCut();
  sequence.cut();
}

async function runOpening() {
  // Captured once. If Joseph gets a command in before the opening finishes, his
  // command owns the transcript and the wake line is dropped rather than typed
  // over the top of his answer.
  const openingSeq = state.cmdSeq;

  // Kick the audit off during boot so its bridge probe is already resolved by
  // the time the panel is ready to type.
  const auditPromise = collectAudit();

  await playBoot({ log: el.bootLog, bar: el.bootBar, pct: el.bootPct }, sequence);
  playBootChirp();
  renderBriefing();

  await playVisor(sequence);
  await playAssemble(sequence);

  state.live = true;
  if (state.cmdSeq === openingSeq) setState("idle");
  wireOrb?.setMode(state.listening ? "listen" : "idle");

  const audit = await auditPromise;
  state.audit = audit;
  const link = audit.rows.find((r) => r.id === "link");
  state.bridgeOnline = link?.status === "OK";
  if (el.sysCursor) {
    el.sysCursor.textContent = state.bridgeOnline ? "ONLINE" : "NOT WIRED";
    el.sysCursor.classList.toggle("dim", !state.bridgeOnline);
    el.sysCursor.title = link?.detail || "";
  }

  await sequence.wait(beat(260, 0));
  await renderAudit(el.audit, audit, sequence);

  await deliverReply(wakeLine(audit), openingSeq);
}

/* ——— Voice input ——— */

/** Why the mic stopped, in plain English. `null` means "don't say anything". */
const RECOGNITION_ERRORS = {
  "audio-capture": "No microphone found. Type instead.",
  "not-allowed": "Microphone blocked. Allow mic access for this page, then try again.",
  "service-not-allowed": "This browser's speech service isn't available. Type instead.",
  network: "Speech service unreachable. Type instead.",
  "no-speech": "Didn't catch that — say it again.",
  aborted: null,
};

/** Errors that mean voice input will not work at all in this browser. */
const FATAL_RECOGNITION_ERRORS = new Set([
  "audio-capture",
  "not-allowed",
  "service-not-allowed",
]);

function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    el.sysVoice.textContent = "LIMITED";
    el.sysVoice.title = "Speech recognition not in this browser — type instead";
    return;
  }
  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.onstart = () => {
    state.listening = true;
    el.mic.classList.add("is-hot");
    setState("listen");
  };
  rec.onend = () => {
    state.listening = false;
    el.mic.classList.remove("is-hot");
    // Don't clobber THINKING / SPEAKING if a command already started
    if (el.statePill.textContent === "LISTENING") setState("idle");
  };
  rec.onerror = (ev) => {
    state.listening = false;
    el.mic.classList.remove("is-hot");
    const message = RECOGNITION_ERRORS[ev.error] ?? "Mic stopped unexpectedly. Type instead.";
    if (message) el.transcript.textContent = message;
    if (FATAL_RECOGNITION_ERRORS.has(ev.error)) {
      el.sysVoice.textContent = "LIMITED";
      el.sysVoice.title = message || "";
    }
    if (el.statePill.textContent === "LISTENING") setState("idle");
  };
  rec.onresult = (ev) => {
    let final = "";
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) final += t;
      else interim += t;
    }
    const live = (final || interim).trim();
    if (live) {
      el.transcript.textContent = final ? `Heard: ${live}` : `… ${live}`;
      el.transcript.classList.toggle("is-echo", Boolean(final || interim));
    }
    if (final) handleCommand(final.trim());
  };
  state.recognition = rec;
}

function toggleMic() {
  if (!state.recognition) {
    el.transcript.textContent = "Voice input isn't available here — type a command.";
    return;
  }
  if (state.listening) {
    state.recognition.stop();
    return;
  }
  cancelSpeech(); // stop talking so he can talk
  try {
    state.recognition.start();
  } catch {
    /* already started */
  }
}

/* ——— Wiring ——— */

window.addEventListener("pointerdown", onFirstGesture, { capture: true });
window.addEventListener("keydown", onFirstGesture, { capture: true });

el.skip.addEventListener("click", cutCinematic);
el.mic.addEventListener("click", toggleMic);

el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = el.input.value.trim();
  if (!v) return;
  el.input.value = "";
  handleCommand(v);
});

el.briefBtn.addEventListener("click", () => handleCommand("brief me"));

el.speakToggle.addEventListener("click", () => {
  state.voiceOn = !state.voiceOn;
  el.speakToggle.dataset.on = state.voiceOn ? "1" : "0";
  el.speakToggle.textContent = state.voiceOn ? "Voice on" : "Voice off";
  if (!state.voiceOn) {
    cancelSpeech();
    if (el.statePill.textContent === "SPEAKING") setState("idle");
  }
});

// Double-tap the orb for a systems salute (movie flair)
el.orb?.addEventListener("dblclick", () => handleCommand("brief me"));

document.addEventListener("keydown", (e) => {
  if (e.target === el.input) return;
  if (e.key === "Escape") {
    cutCinematic();
    return;
  }
  if (e.code === "Space" && !e.repeat && state.live) {
    e.preventDefault();
    toggleMic();
  }
});

if (el.orbWire) wireOrb = startWireOrb(el.orbWire);
if (el.stars) startStarfield(el.stars);

tickClock();
setInterval(tickClock, 1000);
initVoice();

runOpening();
