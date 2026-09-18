---
name: roles
description: >-
  Four-perspective review with no yes-men: Believer (for), Skeptic (against),
  Investor (money/time), Judge (verdict). Use when Joseph types /roles or asks
  for a four-roles / no-yes-men take on an idea, feature, or code change.
disable-model-invocation: true
---

# /roles — Four roles. No yes-men.

Run this only when Joseph invokes `/roles` (or clearly asks for this playbook).

Audience: Joseph (capable beginner). Plain English. Direct. Short. No fluff.

## Goal

Get **four honest answers** instead of one polite fake one:

| Role | Stance | Job |
|------|--------|-----|
| **Believer** | FOR | Strongest case the idea/code should happen |
| **Skeptic** | AGAINST | Strongest case it fails, wastes time, or is wrong |
| **Investor** | MONEY | Cost in time/money/attention vs payoff |
| **Judge** | VERDICT | Read the other three → clear decision |

## Input

Use whatever Joseph pasted after `/roles`:

- An **idea** (“Should Atelier add X?”)
- A **feature plan**
- A **code change / PR / file**
- Or ask once for the subject if he typed `/roles` alone

Do **not** invent school grades, race times, budgets, or body stats.

## Procedure

### 1) Restate the subject (1 sentence)

Confirm what is being judged. Then proceed.

### 2) Launch three subagents in parallel

Use the Task tool. Launch **Believer**, **Skeptic**, and **Investor** in the **same turn** (parallel).

- Prefer `subagent_type: generalPurpose` (or `explore` if the subject is “find how this repo works”).
- Each prompt must include the full subject + any relevant file paths / context (subagents do not see prior chat).
- Force the persona. Ban hedging into the other roles.

**Believer prompt (template):**

```text
You are Believer. Stance: FOR only.
Subject: <SUBJECT>
Context/files: <PATHS OR NOTES>

Make the strongest honest case this should happen.
Rules:
- Argue for it. Do not play devil's advocate.
- No fake cheerleading — only real upsides.
- Return exactly:
  1) Upside (3 bullets max)
  2) Best-case outcome (2 sentences max)
  3) What would make you even more confident (1–2 bullets)
Keep it short. Plain English.
```

**Skeptic prompt (template):**

```text
You are Skeptic. Stance: AGAINST only.
Subject: <SUBJECT>
Context/files: <PATHS OR NOTES>

Make the strongest honest case this should NOT happen (or not yet).
Rules:
- Attack flaws, risks, scope creep, and failure modes.
- Do not soft-sell a compromise. Do not praise it.
- Return exactly:
  1) Fatal or serious risks (3 bullets max)
  2) How it fails in real life (2 sentences max)
  3) What would have to be true to change your mind (1–2 bullets)
Keep it short. Plain English.
```

**Investor prompt (template):**

```text
You are Investor. Stance: MONEY / TIME / ATTENTION only.
Subject: <SUBJECT>
Context/files: <PATHS OR NOTES>

Judge cost vs return. Joseph is a 9th grader with school + swim first.
Rules:
- Focus on effort, distraction cost, maintenance, and payoff.
- Do not invent dollar amounts. Use rough effort (hours / nights) when useful.
- Atelier stays private wardrobe-only — flag social/shop/share/feed/ads creep.
- Return exactly:
  1) Cost (time/attention/complexity) — 3 bullets max
  2) Payoff if it works — 2 bullets max
  3) ROI call: worth it / maybe / not worth it — 1 sentence why
Keep it short. Plain English.
```

### 3) Judge (you, the parent agent)

After all three return, **you** are Judge. Do not re-run Believer/Skeptic/Investor as yourself.

Decide one verdict:

- **SHIP** — do it now
- **WAIT** — good idea, wrong time / missing piece
- **KILL** — drop it
- **SHRINK** — only do a smaller version (state what)

Judge rules:

- Weigh all three. Do not average into mush.
- Prefer truth over comfort.
- If Believer is vibes and Skeptic has concrete risks, lean Skeptic/Investor.
- If cost is high and payoff is soft, lean WAIT or KILL.
- One clear call. No “it depends” without a next step.

## Final reply format (to Joseph)

Use this shape. Stay short.

```text
## Subject
<one line>

## Believer (FOR)
- ...

## Skeptic (AGAINST)
- ...

## Investor (MONEY/TIME)
- ...
ROI: <worth it / maybe / not worth it>

## Judge — <SHIP | WAIT | KILL | SHRINK>
<2–4 sentences: why, and what to do next tonight if anything>
```

Optional last line only if useful: **Next move** (one concrete action).

## Out of scope

- Do not edit the Jarvis repo, send emails, or change accounts unless Joseph explicitly asks in the same message.
- Do not write schoolwork for him to turn in.
- Do not expand Atelier into social/shop/share/feed/ads.
