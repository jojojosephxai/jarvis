# Cursor launch — JOS-50 Face: 1024 layout + centered orb + chat fixes

**Agent:** `bc-cdbefa9a-2a5a-51c6-8456-427206120ab6`
**Action:** launch
**Title:** JOS-50 Face: 1024 layout + centered orb + chat fixes

## Prompt

JOS-50 Face fix: layout at small desktop widths (Joseph's real window is ~1024x576). Desktop only, no phone/mobile layout.

Step 0: Confirm you are on face-orb-redo-keep at 3beebf9 or newer (`git log --oneline -3`). If not, stop and say so.

Joseph's screenshot at ~1024 wide shows these bugs. Fix all of them:
1) The Chat/Tasks/Log box sits on top of the Inspector's bottom half and covers its content. They must never overlap. Dock the chat under the Inspector in one right column with its own height (Inspector scrolls internally), or collapse one of them when both are open.
2) NEW LAYOUT (Joseph, 5:39pm Oct 21: "center the dashboard around your orb"; this replaces the old orb-docked-to-the-side rule): the orb sits in the center of the screen and the dashboard is arranged around it. Search/Hubs panel on the left, Inspector on the right, Chat under or beside the Inspector (never overlapping it), Ask bar directly under the orb. The 3D graph fills the free space around the orb between the panels, sized to that space, and is not a small cluster off to one side. No node may be clipped at panel or viewport edges. All of this must fit at 1024x576.
3) Labels float far from their nodes ("How Jarvis should use this", "Owed (finish these)") and "Official bell schedule (202…" is cut off. Every label must sit right next to its own node, 12-13px cyan, never truncated by panel edges; keep the existing collision avoidance.
4) Too much dead space at 1024. Panels should scale with the viewport (e.g. clamp widths) and the left panel should collapse to a slim rail below ~1180px, with a toggle to reopen it.

5) Chat log order: every "Brain N ms to first token / N ms to voice" row shows up as its own message, sometimes before the reply it belongs to, and the timestamps are out of order (a 5:37 Brain row above a 5:36 Jarvis reply). Attach the timing as small grey meta text under the reply it belongs to (or move it to the Log tab), and keep the chat strictly in chronological order.
6) Replies end with inline "(Steal)" source tags and a "Notes used: Steal" line, which reads robotic. Strip the inline tags and show the sources as one small row of chips under the reply.
7) Latency: first token takes 2.0s for "hi", 5.9s for a one-line question and 2.8s for a short command. Only make cheap wins here (e.g. start streaming sooner, avoid blocking work before the first token). The real latency fix is a separate ticket, so don't expand scope. Report the before and after if you can measure them.

Tests: add Playwright viewports 1024x576 and 1366x768 to the existing set (1280, 1440, 1920). Add assertions that the chat box and Inspector rects never intersect, that no node or label is clipped by a panel or the viewport, and that each label is within ~24px of its node. Save screenshots per width (idle and with a hub clicked so Inspector + chat are open).
Run lint, npm test, `npx next build --webpack`, and Playwright; all must pass.

Do not stage .gitignore, .agents/, .superdesign/, skills-lock.json, vault/_sync-backups-2026-10-08/, or audit-v0.2.md. No secrets in code or commits. Commit on face-orb-redo-keep with message "fix: Face layout at 1024-1366 (JOS-50)".

Extra instructions for this run:
- Joseph's screenshot of the current Face at about 1024 wide is attached.
- Work on face-orb-redo-keep and push your commit there, at normal speed. Make sure the commit also lands on GitHub jojojosephxai/jarvis, which is kept in sync with Origin.
- Save Playwright screenshots of the idle state and of a hub clicked (with Inspector and chat open) at 1024x576, 1280x800, 1366x768, 1440x900 and 1920x1080 as artifacts. Put them under artifacts/face/1021/.
- Archive this exact prompt in the repo as cursor-prompts/2026-10-21_face-1024-centered-orb_<your bc short id>.md. Include the agent id, the action (launch) and the title. Add a one-line pointer in cursor-prompts/README.md if one is missing.
