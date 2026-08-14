# Quest flows — which chip, which prompt

Quest (header **Quest**, **⌘J**) is a local Grok thread. Chips change the **harness**, not a runner. The Flow rail is a reminder; the highlight is idle / asking / done, not a stepper.

**New thread** when the job changes (hunt → email draft). Follow-ups keep the session and **do not** re-send the harness, but they **do** re-send the Attach packs you have on.

Turns persist in SQLite (`quest_threads` / `quest_turns`). Restart restores the latest thread. **Look up** in the drawer searches saved text and lists recent threads.

**Attach** (under the flow chips) turns on distilled repo data. **Me** is on by default.

| Attach | Source |
|--------|--------|
| **Me** | Employment slice of the distilled CV packet (stops before Education) |
| **Constraints** | `data/distillation/curation/candidate-constraints-compact.txt` |
| **This ad** | Selected / last opportunity URL + title |
| **Projects** | Public OSS list — not employment years |

If a pack is off, Quest must write `UNKNOWN` instead of inventing years or employers. Apply / EVA / Hunt / Control cannot fetch the web. Free can.

No yolo. No file writes. Prompt cap 4500 characters.

## Quest vs Discover

| Need | Where |
|------|--------|
| Slot table, next 3+2, honesty check | Quest **Apply** |
| Better Platsbanken `q` | Quest **Hunt** |
| Unknowns / DOE before searching | Quest **EVA** |
| Phase plan for a timed session | Quest **Control graph** |
| Open a link, draft an **email**, facts that change | Quest **Free** |
| Fit vs CV, cover letter, export pack, mark Applied | **Discover → New target** → Evaluate → Prep |

Email-only AF ads (no CV asked) → **Free**, not Apply and not Evaluate/Prep.

## EVA

**Use:** name emptiness before you spend search or apply energy.  
**Skip:** live ads, outreach, query rewrite.

```
I am not sure I should keep searching Sweden this week. List what we know,
what we do not, and one small question that would change the plan.
Do not search or apply.
```

Expect: `emptiness_score`, lists, one question. It will not search AF.

## Control graph

**Use:** budget a session (phases, 3 inner steps, pause).  
**Skip:** opening URLs, writing letters.

```
I have 90 minutes. Plan the session in short steps
and tell me where I should pause and decide.
```

Expect: phase + steps. It will not execute hunt or apply.

## Hunt

**Use:** rewrite JobTech `q` from the Sweden snapshot. AND tokens only (no `OR` / `-`).  
**Skip:** pasting a Platsbanken link (web off).

```
My Sweden search is too broad. Give me two searches: one from paid
TypeScript and React work, one from self-taught AI. Plain words only, no OR.
List titles I should skip.
```

Then paste the honest `q` into Sweden search. Rail A = paid work (TS/React/integrations). Rail B = apply-worthy agentic OSS, not invented ML years.

## Apply

**Use:** 3 employment-grounded + 2 stretch slots (2 AF + 3 portals). Honesty table from ads **already on screen**.  
**Skip:** job URLs, draft email, auto-submit.

```
I already applied to two jobs. From the ads on Sweden, pick the next three.
Table: where I found it, title, honest or stretch, why it is honest, what is missing.
```

If the drawer still has a Free session, click **New thread** before Apply, or the first-turn contract never lands.

## Free

**Use:** answer the question, fetch if needed. Email-only posts, company news, “what does this ad actually ask”.  
**Skip:** expecting a slot table or a CV pack.

```
This job only wants an email, not a CV. Using the attached Me context,
write a short application email (subject + body). If a fact is not in
context, write UNKNOWN. Do not invent years or employers.
```

If the page is login/JS-gated, paste the ad text under the URL and send again.

Follow-up on the same thread:

```
Shorter. Swedish subject line. No attachment mention.
```

## Discover (not a Quest chip)

Paste URL or full JD on **Discover → New target** when you want xAI **fit vs CV** and a **prep pack** (cover letter, CV notes, research). That path always assumes CV + letter. Do not use it for “email only, no CV”.
