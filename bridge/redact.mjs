/** Strip API key shapes from error text before it reaches logs or spoken replies. */
export function redact(s) {
  return String(s)
    .replace(/cursor_[A-Za-z0-9._-]+/g, "cursor_…")
    .replace(/xai-[A-Za-z0-9._-]+/g, "xai-…")
    .replace(/Bearer\s+\S+/gi, "Bearer …");
}
