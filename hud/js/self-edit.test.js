import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, SCHEMA, coerce, nudge, sanitize, withDefaults } from "./settings.js";
import { parseSelfEdit } from "./self-edit.js";

const fresh = () => ({ ...DEFAULTS });

/* ——— The schema is the security boundary ——— */

test("unknown keys are dropped, not written", () => {
  assert.deepEqual(sanitize({ rm: "-rf /", accent: "amber" }), { accent: "amber" });
  assert.deepEqual(sanitize({ __proto__: "x", eval: "y" }), {});
  assert.equal(coerce("notASetting", 1), undefined);
});

test("numbers are clamped to their range", () => {
  assert.equal(coerce("orbSize", 99999), SCHEMA.orbSize.max);
  assert.equal(coerce("orbSize", -5), SCHEMA.orbSize.min);
  assert.equal(coerce("voiceRate", "abc"), undefined);
});

test("enums and booleans reject anything off-list", () => {
  assert.equal(coerce("accent", "chartreuse"), undefined);
  assert.equal(coerce("accent", "gold"), "gold");
  assert.equal(coerce("starfield", "yes"), undefined);
  assert.equal(coerce("starfield", false), false);
});

test("a corrupt settings file still yields a usable HUD", () => {
  assert.deepEqual(withDefaults(null), DEFAULTS);
  assert.deepEqual(withDefaults({ accent: "not-a-colour", orbSize: "huge" }), DEFAULTS);
});

test("nudging stops at the edge instead of running away", () => {
  assert.equal(nudge("orbSize", SCHEMA.orbSize.max, 1), SCHEMA.orbSize.max);
  assert.equal(nudge("orbSize", SCHEMA.orbSize.min, -1), SCHEMA.orbSize.min);
});

/* ——— Understanding Joseph ——— */

test("plain commands become real patches", () => {
  assert.equal(parseSelfEdit("make the orb bigger", fresh()).patch.orbSize, 460);
  assert.equal(parseSelfEdit("smaller orb", fresh()).patch.orbSize, 340);
  assert.equal(parseSelfEdit("go amber", fresh()).patch.accent, "amber");
  assert.equal(parseSelfEdit("make yourself gold", fresh()).patch.accent, "gold");
  assert.equal(parseSelfEdit("turn off the scanlines", fresh()).patch.scanlines, 0);
  assert.equal(parseSelfEdit("stars off", fresh()).patch.starfield, false);
  assert.equal(parseSelfEdit("talk slower", fresh()).patch.voiceRate, 0.94);
  assert.equal(parseSelfEdit("deeper voice", fresh()).patch.voicePitch, 0.8);
});

test("boot speed goes the intuitive way", () => {
  assert.ok(parseSelfEdit("boot faster", fresh()).patch.bootSpeed > DEFAULTS.bootSpeed);
  assert.ok(parseSelfEdit("slower boot", fresh()).patch.bootSpeed < DEFAULTS.bootSpeed);
  assert.equal(parseSelfEdit("skip the cinematic", fresh()).patch.bootSpeed, SCHEMA.bootSpeed.max);
  assert.ok(parseSelfEdit("more cinematic boot", fresh()).patch.bootSpeed < DEFAULTS.bootSpeed);
});

test("wake line can be trimmed or silenced", () => {
  assert.equal(parseSelfEdit("keep the wake line brief", fresh()).patch.wakeStyle, "brief");
  assert.equal(parseSelfEdit("don't talk when you wake up", fresh()).patch.wakeStyle, "silent");
  assert.equal(parseSelfEdit("full wake line", fresh()).patch.wakeStyle, "steward");
});

test("reset restores every default", () => {
  const edited = { ...DEFAULTS, accent: "crimson", orbSize: 520 };
  assert.deepEqual(parseSelfEdit("reset yourself", edited).patch, DEFAULTS);
  assert.deepEqual(parseSelfEdit("back to default", edited).patch, DEFAULTS);
});

test("it says so when a dial is already pinned", () => {
  const maxed = { ...DEFAULTS, orbSize: SCHEMA.orbSize.max };
  const result = parseSelfEdit("bigger orb", maxed);
  assert.deepEqual(result.patch, {});
  assert.match(result.say, /as far as I go/);
});

test("it reports what it has changed about itself", () => {
  assert.match(parseSelfEdit("what have you changed", fresh()).say, /exactly as I shipped/);
  const edited = { ...DEFAULTS, accent: "gold" };
  const said = parseSelfEdit("what have you changed", edited).say;
  assert.match(said, /accent gold/);
  assert.match(said, /jarvis\.settings\.json/);
});

/* ——— Knowing where the line is ——— */

test("it refuses code changes instead of pretending", () => {
  const result = parseSelfEdit("add a new panel to your UI", fresh());
  assert.deepEqual(result.patch, {});
  assert.match(result.say, /CURSOR_API_KEY/);
  assert.match(result.say, /cloud-agents/);
});

test("ordinary commands are left to the normal brain", () => {
  assert.equal(parseSelfEdit("brief me", fresh()), null);
  assert.equal(parseSelfEdit("swim", fresh()), null);
  assert.equal(parseSelfEdit("what's due tonight", fresh()), null);
  assert.equal(parseSelfEdit("atelier", fresh()), null);
  assert.equal(parseSelfEdit("help", fresh()), null);
  assert.equal(parseSelfEdit("", fresh()), null);
});
