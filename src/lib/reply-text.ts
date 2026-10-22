/** Old replies may contain the latency footer. Timing belongs to message metadata. */
export function stripReplyTiming(text: string): string {
  return text.replace(/\s*Brain\s+\d+(?:\.\d+)?\s*ms to first(?: token| word)?(?:\s*[·|,]\s*\d+(?:\.\d+)?\s*ms to voice)?\.?/gi, "").trim();
}
