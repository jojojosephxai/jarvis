Agent id: bc-5a270762-af05-57da-bddc-8d67a63d17ed
Title: Origin rename to jarvis

--- VERBATIM LAUNCH PROMPT ---
Joseph wants this Origin repo renamed off the auto slug `mr-potato/tmp-310a2048b18e7d16` to something like `jarvis`.

FACTS from docs: Origin CLI has `origin repo create|list|view|clone|delete|edit` — edit can change default-branch/visibility/merge settings but NOT the repo name. There is no rename command. Namespace `mr-potato` stays.

YOUR JOB (no product feature coding):
1. Install Origin CLI if needed (`curl -fsSL https://downloads.cursor.com/origin/install.sh | sh` and put `~/.local/bin` on PATH).
2. Create a new Origin repo named `jarvis` under the same namespace: prefer `origin repo create mr-potato/jarvis` (or `origin repo create jarvis` if that lands in mr-potato).
3. If `jarvis` already exists, stop and report that — do not overwrite.
4. Push this repo's current `main` (all history) to the new remote. Keep the tmp repo intact; do NOT delete `tmp-310a2048b18e7d16`.
5. Confirm with `origin repo view mr-potato/jarvis` (or whatever was created).
6. Final report MUST include:
   - New codebase URL: `https://cursor.com/codebase/mr-potato/jarvis` (or actual name)
   - Clone URL
   - Confirmation tmp still exists
   - Exact commands Joseph should run on his PC to retarget his local clone at `Documents\tmp-310a2048b18e7d16` (git remote set-url + optional folder rename)

Success = new jarvis repo has the same main tip as this tmp repo, and you report the URLs.
--- END ---
