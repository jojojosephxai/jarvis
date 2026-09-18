import { PROFILE, buildBriefing, greetingLine } from "./profile-data.js";
import { startStarfield } from "./stars.js";
import { playBootChirp, playAckBlip } from "./sfx.js";
import { askBridge, bridgeHealth } from "./bridge-client.js";
import { startWireOrb } from "./wire-orb.js";

const BOOT_LINES = [
  "Initializing personal instance…",
  "Loading Joseph profile kernel…",
  "Mounting Conestoga schedule bus…",
  "Syncing UMLY AG1B grid…",
  "Voice stack: Web Speech API",
  "Policy: no Grok Bot · no new subscriptions",
  "Arc reactor simulation online",
  "Briefing engine: armed",
  "Handshake complete. Welcome back.",
];

const state = {
  voiceOn: true,
  listening: false,
  recognition: null,
  bootDone: false,
  /** Bumps on every new command so stale replies/speech are ignored */
  cmdSeq: 0,
};

/** @type {{ setMode: (m: string) => void, destroy: () => void } | null} */
let wireOrb = null;

const el = {
  boot: document.getElementById("boot"),
  bootLog: document.getElementById("boot-log"),
  bootBar: document.getElementById("boot-bar"),
  bootPct: document.getElementById("boot-pct"),
  skip: document.getElementById("skip-boot"),
  hud: document.getElementById("hud"),
  clock: document.getElementById("clock"),
  statePill: document.getElementById("state-pill"),
  orb: document.getElementById("orb"),
  orbWire: document.getElementById("orb-wire"),
  briefing: document.getElementById("briefing"),
  overnight: document.getElementById("overnight"),
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
  stars: document.getElementById("starfield"),
  sysCursor: document.getElementById("sys-cursor"),
};

function setState(mode) {
  const map = {
    idle: ["STANDBY", "pill--idle"],
    listen: ["LISTENING", "pill--listen"],
    think: ["THINKING", "pill--think"],
    speak: ["SPEAKING", "pill--speak"],
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
    else if (mode === "speak") el.listenHint.textContent = "Speaking…";
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
  const now = new Date();
  el.clock.textContent = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

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
 * Speak reply. Starts first sentence ASAP; queues the rest so long dumps don't block the first beat.
 * @param {string} text
 * @param {number} [seq] command sequence — ignore if a newer command took over
 */
function speak(text, seq = state.cmdSeq) {
  if (!state.voiceOn || !window.speechSynthesis) {
    if (seq === state.cmdSeq) setState("idle");
    return;
  }
  cancelSpeech();
  const chunks = sentences(text);
  const voice = pickVoice();
  let i = 0;

  const next = () => {
    if (seq !== state.cmdSeq) return;
    if (i >= chunks.length) {
      setState("idle");
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[i]);
    i += 1;
    u.rate = 1.06;
    u.pitch = 0.92;
    if (voice) u.voice = voice;
    setState("speak");
    u.onend = next;
    u.onerror = () => {
      if (seq === state.cmdSeq) setState("idle");
    };
    window.speechSynthesis.speak(u);
  };
  next();
}

function addFeed(role, text) {
  const node = document.createElement("div");
  node.className = `msg${role === "You" ? " msg--user" : ""}`;
  node.innerHTML = `<strong>${role}</strong><div></div>`;
  node.querySelector("div").textContent = text;
  el.feed.prepend(node);
}

function renderBriefing() {
  const b = buildBriefing();
  if (el.overnight) {
    el.overnight.innerHTML = `
      <p><strong>While you were offline</strong></p>
      <ul>
        <li>Profile kernel loaded — Joseph context ready.</li>
        <li>No inbox automation running yet (Cursor Automations = phase 2).</li>
        <li>School + swim calendars active for today.</li>
        <li>Standing by for triage — say what’s due.</li>
      </ul>
    `;
  }
  el.briefing.innerHTML = `
    <p><strong>${b.title}</strong></p>
    <ul>${b.lines.map((l) => `<li>${l}</li>`).join("")}</ul>
  `;
  el.tonight.innerHTML = b.tonight.map((t) => `<li>${t}</li>`).join("");
}

/**
 * Offline fallback only — used when the live bridge is down.
 * Prefer Cursor SDK / Grok via `npm run jarvis:all` + .env keys.
 */
function jarvisReply(raw) {
  const q = raw.trim().toLowerCase();
  if (!q) return "Standing by.";

  if (/^(hey )?jarvis\b/.test(q) && q.replace(/^(hey )?jarvis[,!.\s]*/i, "").length < 2) {
    return `Yes, ${PROFILE.name}?`;
  }

  if (/brief|status|morning|wake|systems/.test(q)) {
    const b = buildBriefing();
    return `${b.title} ${b.lines.join(" ")}`;
  }

  if (/help|what can you do|commands|brain|offline/.test(q)) {
    return "Live brain needs the bridge: copy .env.example to .env, set CURSOR_API_KEY or XAI_API_KEY, run npm run jarvis:all. Then ask anything — I won't recycle canned lines.";
  }

  // Honest default — do not regurgitate keyword scripts
  return "Live brain offline. Run npm run jarvis:all with CURSOR_API_KEY (or XAI_API_KEY) in .env. Until then I only have a thin offline fallback.";
}

async function handleCommand(text) {
  const seq = ++state.cmdSeq;
  cancelSpeech();

  const cleaned = text.replace(/^(hey )?jarvis[,!.\s]*/i, "").trim() || text;

  // Immediate "heard you" feedback — before any await
  addFeed("You", text);
  playAckBlip();
  flashHeard();
  el.transcript.textContent = `Heard: ${text}`;
  setState("think");

  // Let the pill/orb paint one frame, then answer (no fake 280ms lag)
  await new Promise((r) => requestAnimationFrame(() => r()));

  const remote = await askBridge(cleaned);
  if (seq !== state.cmdSeq) return;

  const reply = remote?.reply || jarvisReply(cleaned);
  if (remote?.brain && el.sysCursor) {
    el.sysCursor.textContent = remote.brain.toUpperCase().slice(0, 6);
    el.sysCursor.classList.toggle("dim", remote.brain === "error");
  }
  addFeed("Jarvis", reply);
  el.transcript.textContent = reply;
  speak(reply, seq);
  if (!state.voiceOn && seq === state.cmdSeq) setState("idle");
}

function enterHud() {
  if (state.bootDone) return;
  state.bootDone = true;
  playBootChirp();
  el.boot.classList.add("is-done");
  setTimeout(async () => {
    el.boot.hidden = true;
    el.boot.classList.add("is-hidden");
    el.hud.hidden = false;
    el.hud.classList.remove("is-hidden");
    wireOrb?.setMode("idle");
    requestAnimationFrame(() => wireOrb?.setMode(state.listening ? "listen" : "idle"));
    renderBriefing();
    if (el.sysCursor) {
      const health = await bridgeHealth();
      if (health?.ok && health.brain) {
        el.sysCursor.textContent = String(health.brain).toUpperCase().slice(0, 6);
        el.sysCursor.classList.remove("dim");
        el.sysCursor.title = `Live brain: ${health.brain} (mode=${health.mode || "auto"})`;
      } else if (health) {
        el.sysCursor.textContent = "NO KEY";
        el.sysCursor.classList.add("dim");
        el.sysCursor.title = health.reason || "Bridge up but no API key";
      } else {
        el.sysCursor.textContent = "OFF";
        el.sysCursor.classList.add("dim");
        el.sysCursor.title = "Bridge offline — run npm run jarvis:all";
      }
    }
    const open = `${greetingLine()}, ${PROFILE.name}. Online.`;
    addFeed("Jarvis", open);
    el.transcript.textContent = open;
    speak(open);
  }, 280);
}

function runBoot() {
  let i = 0;
  const step = () => {
    if (state.bootDone) return;
    if (i < BOOT_LINES.length) {
      const li = document.createElement("li");
      li.classList.add("is-typing");
      li.textContent = BOOT_LINES[i];
      el.bootLog.appendChild(li);
      [...el.bootLog.querySelectorAll("li")].forEach((n) => {
        if (n !== li) n.classList.remove("is-typing");
      });
      i += 1;
      const pct = Math.round((i / BOOT_LINES.length) * 100);
      el.bootBar.style.width = `${pct}%`;
      el.bootPct.textContent = `${pct}%`;
      setTimeout(step, 280);
    } else {
      el.bootLog.querySelectorAll("li").forEach((n) => n.classList.remove("is-typing"));
      setTimeout(enterHud, 180);
    }
  };
  step();
}

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
  rec.onerror = () => {
    state.listening = false;
    el.mic.classList.remove("is-hot");
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

el.skip.addEventListener("click", enterHud);
el.mic.addEventListener("click", () => {
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
});
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

// Double-tap orb to re-run a short systems salute (movie flair)
el.orb?.addEventListener("dblclick", () => {
  handleCommand("brief me");
});

if (el.orbWire) wireOrb = startWireOrb(el.orbWire);

tickClock();
setInterval(tickClock, 1000);
window.speechSynthesis?.addEventListener?.("voiceschanged", () => {});
initVoice();
if (el.stars) startStarfield(el.stars);

document.addEventListener("keydown", (e) => {
  if (e.target === el.input) return;
  if (e.code === "Space" && !e.repeat && state.bootDone) {
    e.preventDefault();
    el.mic.click();
  }
  if (e.key === "Escape" && !state.bootDone) enterHud();
});

runBoot();
