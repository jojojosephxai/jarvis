import test from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "./load-env.mjs";
import { createBridge } from "./server.mjs";
import { buildSystemPrompt } from "./prompt.mjs";

test("parseEnv ignores comments and does not require quotes", () => {
  const env = parseEnv(`
# hi
XAI_API_KEY=abc
CURSOR_API_KEY="def ghi"
NOT A LINE
_OK=1
`);
  assert.equal(env.XAI_API_KEY, "abc");
  assert.equal(env.CURSOR_API_KEY, "def ghi");
  assert.equal(env._OK, "1");
  assert.equal(env["NOT A LINE"], undefined);
});

test("health reports keys without pinging a model", async () => {
  const { server } = createBridge({
    env: { XAI_API_KEY: "xai-test", CURSOR_API_KEY: "" },
    profile: "test profile",
    chatXai: async () => {
      throw new Error("should not chat on health");
    },
    runCursor: async () => {
      throw new Error("should not edit on health");
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.xai, true);
    assert.equal(data.cursor, false);
    assert.equal(data.brain, "live");
  } finally {
    server.close();
  }
});

test("talk goes to xAI and not Cursor", async () => {
  const calls = [];
  const { handleChat } = createBridge({
    env: { XAI_API_KEY: "xai-test", CURSOR_API_KEY: "cursor_test" },
    profile: "Joseph is a swimmer.",
    chatXai: async ({ messages }) => {
      calls.push("xai");
      assert.equal(messages.at(-1).content, "what's due tonight");
      return "AP Bio first.";
    },
    runCursor: async () => {
      calls.push("cursor");
      throw new Error("should not run");
    },
  });
  const out = await handleChat({ message: "what's due tonight" });
  assert.deepEqual(calls, ["xai"]);
  assert.equal(out.via, "xai");
  assert.equal(out.reply, "AP Bio first.");
});

test("file edits go to Cursor, not xAI", async () => {
  const calls = [];
  const { handleChat } = createBridge({
    env: { XAI_API_KEY: "xai-test", CURSOR_API_KEY: "cursor_test" },
    profile: "Joseph",
    chatXai: async () => {
      calls.push("xai");
      throw new Error("should not chat");
    },
    runCursor: async (prompt) => {
      calls.push("cursor");
      assert.match(prompt, /add a new panel/);
      return "Added a panel in hud/index.html.";
    },
  });
  const out = await handleChat({ message: "add a new panel to the hud" });
  assert.deepEqual(calls, ["cursor"]);
  assert.equal(out.via, "cursor");
  assert.match(out.reply, /Added a panel/);
});

test("talk without xAI falls back to the local HUD brain", async () => {
  const { handleChat } = createBridge({
    env: { CURSOR_API_KEY: "cursor_test" },
    profile: "Joseph",
    chatXai: async () => {
      throw new Error("should not chat");
    },
    runCursor: async () => {
      throw new Error("should not edit");
    },
  });
  const out = await handleChat({ message: "brief me" });
  assert.equal(out.fallback, "local");
});

test("edit without Cursor is refused out loud, even if xAI is up", async () => {
  const { handleChat } = createBridge({
    env: { XAI_API_KEY: "xai-test" },
    profile: "Joseph",
    chatXai: async () => {
      throw new Error("should not chat");
    },
    runCursor: async () => {
      throw new Error("should not edit");
    },
  });
  const out = await handleChat({ message: "add a new panel to the hud" });
  assert.equal(out.via, "none");
  assert.match(out.reply, /CURSOR_API_KEY/);
  assert.match(out.reply, /cloud-agents/);
});

test("xAI failures are spoken, not swapped for a premade line", async () => {
  const { handleChat } = createBridge({
    env: { XAI_API_KEY: "xai-test" },
    profile: "Joseph",
    chatXai: async () => {
      throw new Error("xAI rejected the key. It has to come from https://console.x.ai");
    },
  });
  const out = await handleChat({ message: "hello" });
  assert.equal(out.error, "xai_failed");
  assert.match(out.reply, /console\.x\.ai/);
  assert.doesNotMatch(out.reply, /Understood\. Say the job/);
});

test("system prompt forbids writing schoolwork and leaking keys", () => {
  const prompt = buildSystemPrompt({ profile: "Joseph swims breaststroke.", audit: null });
  assert.match(prompt, /Never write schoolwork/);
  assert.match(prompt, /Do not reveal API keys/);
  assert.match(prompt, /breaststroke/);
});
