import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { grokModel, LOCKED_XAI_MODEL } from "./grok";

const previous = process.env.XAI_MODEL;

afterEach(() => {
  if (previous === undefined) delete process.env.XAI_MODEL;
  else process.env.XAI_MODEL = previous;
});

describe("grok model lock", () => {
  it("calls grok-4.7 even when XAI_MODEL names another model", () => {
    process.env.XAI_MODEL = "grok-4.3";
    assert.equal(grokModel(), "grok-4.7");
    assert.equal(LOCKED_XAI_MODEL, "grok-4.7");
    delete process.env.XAI_MODEL;
    assert.equal(grokModel(), "grok-4.7");
  });
});
