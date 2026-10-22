import { readySentences } from "../clock";
import { butlerSpeech } from "./policy";
import { SPEAK_LIMIT } from "./types";

/** One reply owns one promise chain, so arriving chunks never interrupt playback. */
export function createSentenceQueue<T = unknown>(play: (text: string, prepared?: Promise<T>) => Promise<unknown>, signal: AbortSignal, prepare?: (text: string, signal: AbortSignal) => Promise<T>) {
  let tail = Promise.resolve();
  const pending: Array<{ text: string; prepared?: Promise<T> }> = [];
  let playing = 0;
  const prime = (index: number) => {
    const item = pending[index];
    if (item && !item.prepared && prepare && !signal.aborted) item.prepared = prepare(item.text, signal);
  };
  return {
    enqueue(text: string) {
      const split = readySentences(`${butlerSpeech(text)} `);
      const sentences = [...split.ready, split.rest];
      for (const sentence of sentences) {
        let rest = sentence.trim();
        while (rest) {
          const space = rest.lastIndexOf(" ", SPEAK_LIMIT);
          const end = rest.length <= SPEAK_LIMIT ? rest.length : space > 0 ? space : SPEAK_LIMIT;
          const chunk = rest.slice(0, end).trim();
          rest = rest.slice(end).trim();
          const index = pending.length;
          pending.push({ text: chunk });
          if (index <= playing + 1) prime(index);
          tail = tail.then(async () => {
            if (signal.aborted) return;
            playing = index;
            prime(index);
            prime(index + 1);
            try { await play(chunk, pending[index].prepared); }
            catch (error) { if (!signal.aborted) console.error("Speech chunk failed; continuing reply.", error); }
          });
        }
      }
    },
    drain: () => tail,
  };
}

/** Reconcile the final answer by ordered words, including an unfinished streamed prefix. */
export function unspokenTail(finalReply: string, streamed: string): string {
  const final = butlerSpeech(finalReply);
  const heard = butlerSpeech(streamed).trim();
  if (!heard) return final;
  if (final.startsWith(heard)) return final.slice(heard.length).trim();
  const remaining = [...readySentences(`${final} `).ready];
  for (const sentence of readySentences(`${heard} `).ready) {
    const index = remaining.findIndex((part) => part === sentence);
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining.join(" ");
}
