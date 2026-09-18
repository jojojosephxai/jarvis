/**
 * True when Joseph is asking Jarvis to change files / the HUD / backend,
 * not just talk. Shared by the HUD and the bridge so they route the same way.
 *
 * @param {string} raw
 * @returns {boolean}
 */
export function wantsFileEdit(raw) {
  const q = String(raw || "")
    .trim()
    .toLowerCase();
  if (!q) return false;

  const asking =
    /^(what|what's|whats|which|how|who|why|when|where|can you|could you|do you|did you)\b/.test(q);
  const imperative =
    /\b(make|add|rewrite|implement|fix|patch|create|delete|remove|rename|build|turn|switch|set|enable|disable)\b/.test(
      q,
    );
  if (asking && !imperative) return false;

  if (/\.(js|mjs|cjs|css|html|json|md|ts)\b/.test(q) && /\b(edit|fix|change|update|rewrite|patch)\b/.test(q)) {
    return true;
  }

  if (
    /\b(rewrite|refactor|implement|patch)\b/.test(q) &&
    /\b(file|code|css|html|js|hud|ui|panel|backend|source|server|bridge|yourself)\b/.test(q)
  ) {
    return true;
  }

  if (
    /\b(add|create|delete|remove|rename)\b/.test(q) &&
    /\b(file|panel|page|button|route|endpoint|setting)\b/.test(q)
  ) {
    return true;
  }

  if (
    /\b(edit|change|modify|update|fix|tweak)\b/.test(q) &&
    /\b(yourself|your (own )?(code|ui|interface|layout|source|css|html|js|look|face|panel|self)|the hud|the (css|html|js|ui|backend|bridge|server))\b/.test(
      q,
    )
  ) {
    return true;
  }

  if (
    /\b(make (the |yourself )?(orb|visor|scanlines?|starfield|accent)|go (amber|gold|ice|green|crimson)|boot (faster|slower)|stars? (on|off)|scanlines? (on|off)|talk (faster|slower)|deeper voice)\b/.test(
      q,
    )
  ) {
    return true;
  }

  if (/\b(self-?edit|edit yourself|change your (code|source|html|css|js|ui))\b/.test(q)) {
    return true;
  }

  return false;
}
