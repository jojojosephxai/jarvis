import { readySentences } from "../clock";
import { butlerSpeech } from "./policy";
import { SPEAK_LIMIT } from "./types";

/** One reply owns one promise chain, so arriving chunks never interrupt playback. */
export function createSentenceQueue(play: (text: string) => Promise<unknown>, signal: AbortSignal) {
  let tail = Promise.resolve();
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
          tail = tail.then(async () => {
            if (signal.aborted) return;
            try { await play(chunk); }
            catch (error) { if (!signal.aborted) console.error("Speech chunk failed; continuing reply.", error); }
          });
        }
      }
    },
    drain: () => tail,
  };
}
