import assert from "node:assert/strict";
import { test } from "node:test";
import { createSentenceQueue } from "./sentence-queue";
import { SPEAK_LIMIT } from "./types";

test("streams every sentence in order, including arrivals during playback and after an idle gap", async () => {
  const played: string[] = [];
  const ended: string[] = [];
  let release!: () => void;
  const first = new Promise<void>((resolve) => { release = resolve; });
  const queue = createSentenceQueue(async (text) => {
    played.push(text);
    if (played.length === 1) await first;
    ended.push(text);
  }, new AbortController().signal);
  queue.enqueue("First words");
  await Promise.resolve();
  queue.enqueue("finish the first sentence. Second sentence!");
  queue.enqueue("Third sentence? Fourth sentence without punctuation");
  assert.deepEqual(played, ["First words"]);
  release();
  await queue.drain();
  queue.enqueue("Fifth sentence.");
  await queue.drain();
  const expected = ["First words", "finish the first sentence.", "Second sentence!", "Third sentence?", "Fourth sentence without punctuation", "Fifth sentence."];
  assert.deepEqual(played, expected);
  assert.deepEqual(ended, expected);
});

test("splits long speech without losing words at the provider limit", async () => {
  const played: string[] = [];
  const queue = createSentenceQueue(async (text) => { played.push(text); }, new AbortController().signal);
  const reply = "Every word must be heard ".repeat(90).trim() + ".";
  queue.enqueue(reply);
  await queue.drain();
  assert.equal(played.join(" "), reply);
  assert.ok(played.every((text) => text.length <= SPEAK_LIMIT));
});

test("an explicit stop cancels the remaining chunks", async () => {
  const abort = new AbortController();
  const played: string[] = [];
  const queue = createSentenceQueue(async (text) => { played.push(text); abort.abort(); }, abort.signal);
  queue.enqueue("One. Two. Three.");
  await queue.drain();
  assert.deepEqual(played, ["One."]);
});
