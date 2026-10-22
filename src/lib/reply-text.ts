/** Old replies may contain the latency footer. Timing belongs to message metadata. */
export function stripReplyTiming(text: string): string {
  return text.replace(/\s*Brain\s+\d+(?:\.\d+)?\s*ms to first(?: token| word)?(?:\s*[·|,]\s*\d+(?:\.\d+)?\s*ms to voice)?\.?/gi, "").trim();
}

/** Remove legacy citations only for the retrieved source titles. */
export function stripReplySources(text: string, sources: string[] = []): string {
  let clean = text.replace(/(?:^|\n)\s*Notes used:[\s\S]*$/i, "");
  for (const source of sources) {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    clean = clean.replace(new RegExp(`\\s*\\(${escaped}\\)`, "gi"), "");
  }
  return clean.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}
