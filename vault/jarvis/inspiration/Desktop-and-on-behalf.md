---
title: Desktop and on-behalf
tags:
  - jarvis
  - hands
  - inspiration
updated: 2026-10-06
---

# Desktop control and on-behalf — future vs today

Joseph’s desire: Jarvis can **control the computer** (open apps/tabs, do desktop work) and **act on his behalf** (plan, change calendar, similar), with **approve-the-plan** before consequential outbound. Pace: EOY. Stack: no local AI; xAI brain/voice; always-on OK; Grok Bot primary do-er for now.

Hub: [[00-README]] · [[Steal]] · [[Skip]]

Sources: live app README/Hands code + vault (2026-10-06) + Linear project Jarvis (facts from Jarvis lead 2026-10-06).

## What you want (target)

1. Open apps, tabs, and files on **your** PC when you ask (or after you approve a plan).
2. Plan the day / week and **change real calendar** events (not a toy list).
3. Do multi-step “on behalf” work (research → draft → schedule → open the right thing) with receipts.
4. Outbound (message, spend, delete) only after you approve the plan.
5. Feels like the reels: HUD + voice + hands that actually move the world — without cloning their stacks.

## What exists today (honest)

### App / code
- **Hands** = tool framework with **plan + receipt**.
- **Demo calendar** only (`data/calendar.json`). **Not** Apple or Google Calendar.
- **calendar.write / list** — auto-approved on demo calendar.
- **calendar.delete**, **message.send**, **money.spend** — wait for a yes.
- **browser.open / browser.task** — in policy as auto; JOS-8 READY described **open-link stub**, not full desktop control.
- No phone/SMS. North star: **Real Hands over stubs**.

### Linear (project Jarvis)
- **[JOS-8](https://linear.app/joseph-apo/issue/JOS-8)** Hands browser + calendar — *In Progress / Needs Joseph*. Done means: open URL / simple web; create Apple/Google calendar events (auto-approve writes); plan + receipt; send/spend need yes. READY 2026-09-23 on branch `cursor/jos-8-hands-browser-calendar-4cea`: calendar auto-approve demo; open-link stub; send/spend/delete gated; mail/payments stay honest stubs even after yes. **Waiting ok/change/stop** — not clearly merged as “real OAuth Hands.”
- **[JOS-31](https://linear.app/joseph-apo/issue/JOS-31)** Epic video-parity — *In Progress*. Waves: (1) Graph · (2) Tool Armory + real OAuth Hands · (3) Screen share + point · (4) Screen take-over click/type/scroll + narration; stop/handback; never Publish/spend/send without yes · (5) workflows + morning brief from **real** Calendar/Gmail.
- **[JOS-33](https://linear.app/joseph-apo/issue/JOS-33)** Wave 2 real OAuth Hands — *Backlog* (Gmail/Calendar/Drive/Docs/Sheets/GitHub + MCP).
- **[JOS-36](https://linear.app/joseph-apo/issue/JOS-36)** Wave 3 screen share + point — *Backlog*.
- **[JOS-34](https://linear.app/joseph-apo/issue/JOS-34)** Wave 4 screen take-over — *Backlog* (this is closest to “full computer control”).
- **[JOS-35](https://linear.app/joseph-apo/issue/JOS-35)** Wave 5 real Calendar/Gmail brief + email draft until yes — *Backlog*.
- Face try-gates still **Needs Joseph** — Waves 2–5 stay backlog until Face ok.

**Gap in one line:** Desire maps to **JOS-31 Waves 2–4** (+ open-apps, which has no dedicated ticket yet). Today you mostly have **demo Hands + stubs**, with JOS-8 waiting your ok/change/stop.

## Already aligned (don’t reinvent)
- Approve-before-outbound (vault + JOS-8/31/33/34/35)
- Always-on OK, no local AI (Goals / Tech-setup)
- xAI brain/voice + HUD (vault + north-star)
- EOY + Grok Bot primary do-er now (Goals / Tech-setup / Jarvis-wants)
- Calendar **create** auto-approve is an explicit JOS-8 product rule (still not “full plan/change my real calendar” shipped)

## What must change or be added

1. **Unblock Face / land JOS-8 decision** — ok/change/stop on the Hands branch so real Hands work isn’t stuck behind Needs Joseph.
2. **JOS-33 — real OAuth Hands** — Google Calendar (and Gmail/Drive as needed); replace demo `calendar.json` as the source of truth for “on behalf.”
3. **Always-on bridge** — companion or machine link so Hands can reach *your* PC without local AI.
4. **Open apps** — new work item (not just open-URL stub); allowlist Chrome, Cursor, Obsidian, etc.
5. **JOS-36 then JOS-34** — share/point → click/type/scroll take-over with stop/handback and hard never send/spend/Publish without yes.
6. **JOS-35 + planner skill** — real morning brief + multi-step plans that Hands executes after you approve.
7. **HUD receipts** — plan → running → receipt visible on Face (LARP).
8. **Role split** — Grok Bot can proxy some of this near-term with approvals; EOY those powers live under Jarvis Hands.

## Build order (locked 2026-10-06 — Linear JOS-44)
1. **Real Apple Calendar** (spike iCloud/CalDAV **A** first; Outlook mirror **C** only if sync works and Joseph never touches other calendars)
2. **Always-on** + open URL / **app allowlist** (Chrome, Cursor, Obsidian, File Explorer, Notepad)
3. **Confirm-gated click/type** for school portal + editing calendar (more workflows later)
4. **Planner + HUD** receipts
5. **Standing OKs** only where Joseph locks them

Gate before new Cursor launches: Face try-gates (esp. JOS-41) + JOS-8 ok/change/stop.  

## Similarity to the reels (after Waves 2–4 land)
- **Feel:** close — voice + HUD + hands that move calendar/desktop.  
- **Body:** your stack (xAI, Origin, approvals, Linear waves) — not Hermes/comment-bait clones.

## Decisions locked (2026-10-06)

- **Calendar:** Apple Calendar (not Google-first).
- **Phone/SMS:** still out for now; may add **later** if Hands / desktop parts work well enough (softens vault “never,” doesn’t ship it now).

## Open / need more info

- How Apple Calendar connects from the Windows Jarvis app — **spike A (iCloud/CalDAV)** filed on Linear JOS-44 / JOS-33 retarget; run when Face hold clears.
- Near-term: Grok Bot machine tools vs earlier Jarvis companion? (still open)

## Build order unpacked

See chat 2026-10-06 with Joseph for plain-English step meanings.

## Calendar bridge (2026-10-06)

- Prefer **Apple Calendar** end state.
- Spike **A: iCloud / CalDAV from Windows** first.
- **C: Outlook/Windows mirror** only if it syncs reliably *and* Joseph never has to live in/touch those other calendars day to day.
- App allowlist: Chrome, Cursor, Obsidian, File Explorer, Notepad.
- First click/type workflows: school portal + editing calendar (more later).
- Phone/SMS: later if Hands work well.
