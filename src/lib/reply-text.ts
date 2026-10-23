/** Old replies may contain the latency footer. Timing belongs to message metadata. */
export function stripReplyTiming(text: string): string {
  return text.replace(/\s*Brain\s+\d+(?:\.\d+)?\s*ms to first(?: token| word)?(?:\s*[·|,]\s*\d+(?:\.\d+)?\s*ms to voice)?\.?/gi, "").trim();
}

/** Remove legacy citations only for the retrieved source titles. */
export function stripReplySources(text: string, sources: string[] = []): string {
  let clean = text.replace(/(?:^|\s)Notes used:[\s\S]*$/i, "");
  for (const source of sources) {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    clean = clean.replace(new RegExp(`\\s*(?:\\(${escaped}\\)|\\[\\[${escaped}(?:\\|[^\\]]+)?\\]\\]|\\[${escaped}\\])`, "gi"), "");
  }
  return clean.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

/** Hide undecided citation/footer prefixes until another token or source metadata resolves them. */
export function cleanReplyText(text: string, sources?: string[], streaming = false): string {
  if (streaming) {
    const footer = text.search(/(?:^|\s)(?:Brain\s+\d|Notes used:)/i);
    if (footer >= 0) text = text.slice(0, footer);
    for (const marker of ["Brain ", "Notes used:"]) {
      for (let size = 1; size <= marker.length; size++) {
        const start = text.length - size;
        if (start >= 0 && (start === 0 || /\s/.test(text[start - 1])) && text.slice(start).toLowerCase() === marker.slice(0, size).toLowerCase()) {
          text = text.slice(0, start);
          break;
        }
      }
    }
    const opens: { char: string; index: number }[] = [];
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === "(" || char === "[") {
        // Older transports send sources only at completion, so keep ambiguous tags pending.
        if (sources === undefined) { text = text.slice(0, index); break; }
        opens.push({ char, index });
      } else if ((char === ")" && opens.at(-1)?.char === "(") || (char === "]" && opens.at(-1)?.char === "[")) opens.pop();
    }
    if (opens.length) text = text.slice(0, opens[0].index);
  }
  return stripReplySources(stripReplyTiming(text), sources);
}
