# Quick Job Target — Combined feedback report for implementer

**Audience:** Engineer implementing fixes  
**Feature:** Discover → Quick Job Target (URL / paste JD) + grok-4.3 analysis  
**Reporter lens:** Product manager + senior dev + primary user (dogfooding xAI Greenhouse URL)  
**Date context:** Post full-viewport shell; v1 “dogfood slice” shipped

---

## Executive summary

The feature **works end-to-end** (xAI key → fetch/paste JD → grok-4.3 structured fit → SQLite `opportunities` row), but **product promise ≠ implementation**:

| User expectation | Reality today |
|------------------|---------------|
| “Analyze + Full Prep” does more than fit | **Same code path** as “Analyze for fit” |
| Results in main workspace (right panel) | Raw JSON `<pre>` **under the left form** |
| Uses my CV from Discover | **Hardcoded fallback CV** in Rust |
| Full prep (letter, CV tweaks) | **Not implemented**; footer admits “next slice” |
| Saved jobs visible in History/Data | **DB write only** — no Tauri read command, no UI table |

**Priority:** Fix trust issues (mislabeled button, wrong panel, weak CV context) before adding Full Prep.

---

## User journey (what I experienced)

1. Open **Discover** — Quick Job Target at top of left column.
2. Paste Greenhouse URL: `job-boards.greenhouse.io/xai/jobs/4956028007`
3. Click **Analyze + Full Prep** (orange).
4. Wait ~few seconds.
5. See small box **below buttons** with:
   - `opportunity #N`
   - Est cost
   - **Raw JSON** (overall 55, gaps_must, rationale, etc.)
   - Truncated “packet preview”
6. **Right panel** still says: “No live results yet… search or run a guarded autonomous cycle.”

**Feeling:** Analysis ran, but output is developer-facing; primary viewport wasted; orange button oversells.

---

## Technical trace (what actually runs)

### UI — `src/view/screens/discover-screen.tsx`

`QuickJobTarget` is **isolated** from MVU:

- Local `useState` only (`url`, `pasted`, `busy`, `result`, `error`)
- Direct `safeInvoke('analyze_job_target', …)` — not `FinderPort.analyzeJobTarget`
- Checks `has_xai_key` first; error directs to Settings
- **`runAnalyze(_fullPrep: boolean)` ignores `_fullPrep`** — both buttons call identical payload

**Payload sent:**

```ts
{ url?: string, pasted_jd?: string }
// cv_summary NOT sent
// title, company NOT sent
```

### Rust — `src-tauri/src/lib.rs` `analyze_job_target`

**JD preparation:**

| Source | Processing |
|--------|------------|
| `pasted_jd` | Used verbatim |
| `url` | `fetch_job_page` → GET with 20s timeout → `strip_html_basic` → **truncate 8000 chars** |
| Neither | Error: “Provide either url or pasted_jd” |

Gaps: no title/company extraction; no readability pass; Greenhouse may work but quality unverified.

**CV preparation (critical gap):**

```rust
let cv = cv_summary.unwrap_or_else(|| 
  "Senior engineer with Rust, TypeScript, React, Tauri, agentic tooling experience..."
);
```

- UI **does not** pass `model.cvSummary` from SearchWorkspace below.
- **Does not** load devprofile / `data/distillation/prompts/cv-packet-pruned.md`.
- Comment in code: “real devprofile load + prune comes next slice”.

**Prompt to grok-4.3:**

```
System: expert career fit analyst, JSON only, cite JD phrases
User:
  CV PACKET (pruned):
  {cv}

  JOB DESCRIPTION:
  {jd}

  Return fit analysis.
```

**No:** X skill.md, distillation analyze template, guards, cost pre-check UI.

### xAI — `src-tauri/src/xai.rs`

- Model: `grok-4.3`
- Strict JSON schema `job_fit_v1`: `overall`, `rationale`, `gaps_must`, `gaps_nice`, `recommended_action`
- Returns usage → `est_cost_usd` in result

### Persistence — `src-tauri/src/db.rs`

- `upsert_opportunity(...)` → `opportunities` table (`analysis_json`, `fit_score`, `jd_text`, etc.)
- **`get_opportunities` exists in Rust but is NOT exposed** as a Tauri command (grep `lib.rs`: no match)
- Data screen shows searches/leads/events only — **not** web opportunities

---

## Issue register (prioritized)

### P0 — Trust / correctness

| ID | Issue | Evidence | Fix direction |
|----|--------|----------|---------------|
| P0-1 | **“Analyze + Full Prep” is a no-op difference** | `_fullPrep` unused; same `analyze_job_target` | Until prep ships: rename to “Analyze fit only” OR implement `prep_job_target` with second xAI call + artifacts |
| P0-2 | **Wrong CV context** | Generic Rust one-liner; user’s CV packet ignored | Pass `model.cvSummary` from Discover; then wire devprofile prune per cv-promote-guard |
| P0-3 | **Results in wrong place / raw JSON** | `<pre>` under left form; right panel empty | Render structured **JobFitReport** in right column; left = input only |

### P1 — Product completeness

| ID | Issue | Fix direction |
|----|--------|---------------|
| P1-1 | Quick Job Target bypasses MVU | Add `JobTargetAnalyzeRequested` / `JobTargetAnalyzeSucceeded`; effects → port; enables history refresh, guards, logging |
| P1-2 | Saved opportunities invisible | Expose `get_opportunities`; add tab on Data or History; link from fit panel |
| P1-3 | Misleading footer copy | Update after P0-1: either deliver prep or say “Fit analysis only” |
| P1-4 | No cost guard before xAI | Pre-flight token estimate + pause if over budget (finder-reactor pattern) |

### P2 — Quality / polish

| ID | Issue | Fix direction |
|----|--------|---------------|
| P2-1 | URL fetch naive | Log `truncated` flag in UI; consider readability or user warning if JD &lt; N chars |
| P2-2 | xAI key panel not in MVU | Mirror credentials slice for consistent busy/error states |
| P2-3 | No loading state on right panel | Skeleton / “Analyzing with grok-4.3…” in results area |
| P2-4 | `docs/tauri-commands.md` stale | Document `analyze_job_target`, `fetch_job_page`, xAI key commands |

---

## Recommended UX (right panel) — implementer spec

Replace raw JSON with a **Job Fit Review** card (reuse Card/Badge tokens):

```
┌─────────────────────────────────────────────────────────┐
│ Job fit analysis · grok-4.3          [55/100] badge     │
│ xAI · opportunity #12 · ~$0.003                       │
├─────────────────────────────────────────────────────────┤
│ Rationale (prose paragraph)                             │
├─────────────────────────────────────────────────────────┤
│ Must address (gaps_must)          │ Nice to have        │
│ • truth-seeking AI mission        │ • location prefs    │
│ • meritocratic / flat structure   │                     │
├─────────────────────────────────────────────────────────┤
│ Recommended action (highlighted)                        │
│ [Open job URL]  [Copy action]  [Run prep — disabled?]   │
└─────────────────────────────────────────────────────────┘
```

**Discover layout behavior:**

- Left: Quick Job Target form only (no result dump).
- Right: **Contextual panel** — priority:
  1. Job fit result (if present)
  2. Else X tweet feed (if search/cycle ran)
  3. Else empty state: “Paste a JD or run X search”

---

## “Full Prep” — definition for next slice

When orange button is enabled, implementer should deliver **at minimum**:

1. **Second structured xAI call** (or multi-step) after fit, gated if `overall < threshold` (e.g. 60) with user confirm.
2. **Artifacts** (sidecar in app data, per cv-promote-guard):
   - `letter.md` (tailored)
   - `cv-delta.json` or bullet suggestions
   - `research.md` (company/role)
   - Optional: 100-word “exceptional work” example (xAI JD often asks this)
3. Persist in `opportunities.prep_artifacts_json`; status → `prepped`.
4. **Review UI** in right panel: editable tabs or accordion (footer promise).

Until then: **disable or relabel** orange button.

---

## Acceptance criteria (implementer checklist)

### Slice A — Honest fit analysis (ship first)

- [x] Both buttons differentiated OR single button until prep exists (disabled orange + "Analyze fit" label)
- [x] `cv_summary` from Discover CV textarea passed to `analyze_job_target`
- [x] Right panel shows structured fit (not JSON `<pre>`) — JobFitPanel
- [x] Loading/error states on right panel
- [x] Empty right state mentions job target OR X search
- [x] `pnpm build` + manual Greenhouse URL test (prior commit)

### Slice B — Visibility & architecture

- [x] MVU messages + effects for job target analyze
- [x] `get_opportunities` Tauri command + Data/History tab (opportunities tab in Data screen)
- [x] Event log: `JobTargetAnalyzed` with opportunity_id, score, cost (plus History auto-refresh)

**JobFitPanel polish shipped alongside Slice B:** "Open job URL", "Copy recommended action", "Clear / analyze another", score subtitle in header (55 → "Moderate fit — review gaps"). Source URL passed from discover (for open); clear resets model.jobTarget so X feed regains priority.

### Slice C — Full prep (follow-on)

- [ ] `prep_job_target` command with guards
- [ ] Artifacts persisted + review UI
- [ ] devprofile CV load + prune (cv-promote-guard)

---

## Code touch list (minimal)

| File | Change |
|------|--------|
| `src/view/screens/discover-screen.tsx` | Lift job result to screen level; right panel component; pass `cvSummary`; fix buttons |
| New `job-fit-panel.tsx` | Structured fit UI |
| `src-tauri/src/lib.rs` | Accept/use `cv_summary`; optional `prep_job_target` |
| `src/core/finder/msg.ts` / `effects.ts` / `model.ts` | MVU integration |
| `src/adapters/tauri/finder-adapter.ts` | Already has `analyzeJobTarget` — use it |
| `src-tauri/src/db.rs` + `src-tauri/src/lib.rs` | `get_opportunities` command |
| `src/view/screens/data-screen.tsx` | Opportunities table tab |
| `docs/tauri-commands.md` | Document new commands |

---

## Sample output (user’s JSON) — how it should read

**Current:** opaque developer dump.

**Target UI copy:**

- **Score:** 55/100 — “Moderate fit — mission gap”
- **Rationale:** One readable paragraph (from `rationale`)
- **Must fix before applying:** bullet list from `gaps_must`
- **Optional improvements:** `gaps_nice`
- **Next step:** `recommended_action` as primary CTA text

Example raw response (today):

```json
{
  "gaps_must": [
    "No indication that candidate believes 'truth-seeking AI is the most important and challenging problem'",
    "Missing explicit statement of thriving in 'meritocratic environments' or 'flat organizational structure'"
  ],
  "gaps_nice": [
    "No mention of Austin/TX, New York/NY, Palo Alto/CA or Seattle/WA location preference"
  ],
  "overall": 55,
  "rationale": "CV shows strong engineering skills in Rust, TypeScript, React, Tauri and 'agentic tooling' aligning with 'exceptional software engineer' and 'hands-on' requirements, but omits any reference to xAI's core mission of 'truth-seeking AI' or 'accurately understand the universe'.",
  "recommended_action": "Tailor application to address mission alignment and provide 100-word exceptional work example focused on agentic AI tooling"
}
```

---

## Risks if unfixed

- Users distrust orange button (“prep” never appears).
- Fit scores misleading (generic CV vs real profile).
- Opportunities table fills silently; user thinks data is lost.
- Two parallel patterns (MVU vs direct invoke) compound maintenance debt.

---

## Suggested implementation order

1. **P0-3 + P0-2** — Right panel + CV wire (1–2 days, high user value)
2. **P0-1** — Button honesty (hours)
3. **P1-1 + P1-2** — MVU + opportunities visibility (1–2 days)
4. **Slice C** — Full prep + devprofile (multi-day; brief per cv-promote-guard)

---

**Bottom line for implementer:** The grok-4.3 pipeline and schema are sound; the gap is **product wiring** (CV context, layout, button honesty, read path for saved rows). Fix Slice A before marketing “Analyze + Full Prep” as a differentiated action.
