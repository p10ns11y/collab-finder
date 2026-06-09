# collab-finder — UX / product review (target + prep + narrow polish)

**Audience:** Implementer, designer, PM  
**Date:** 2026-06 (post narrow polish on feat/target-analysis)  
**Scope:** Quick Target / "Evaluate fit" + "Generate prep pack" (Slice C foundation), after CV extraction, distillation packet wiring, prep reliability fixes, and the narrow UI/report polishes  
**Evidence:** Code inspection of current state (`discover-screen.tsx`, `target-fit-panel.tsx`, `cv-summary-input.tsx`, `data-screen.tsx`, `lib.rs` prep path, MVU effects/update), previous dogfood descriptions in `ux-review-v0.1-dogfood.md` and `quick-target-feedback.md`, recent session fixes  
**Lenses:**
1. **Lens 1** — UI/UX expert + designer + developer (visual system, IA, layout decisions, component boundaries)
2. **Lens 2** — Power user / dogfooder (friction in the evaluate → prep → revisit loop, trust, mental model)

**Related:** [quick-target-feedback.md](./quick-target-feedback.md) (original implementer checklist) and [ux-review-v0.1-dogfood.md](./ux-review-v0.1-dogfood.md) (baseline)

---

## Executive summary

| Dimension | Grade | One-line verdict |
|-----------|-------|------------------|
| Visual design | **B+** | Still cohesive; the new "Fit analysis + Prep" header and success "prepped" badge are nice touches |
| Core job-fit + prep flow | **A** | Greenhouse URL → structured fit (with real distillation CV) → one-click prep pack is now genuinely useful and reliable |
| Information architecture | **C** | Target path and X path still fight for the same left column real estate; no unified "my opportunities" view |
| Trust & consistency | **B-** | Major wins (no more state loss after prep, stable opportunity IDs, CV is a first-class shared component). Remaining copy/ordering nits |
| Daily-driver readiness (job track) | **B** | Excellent first-run experience. Revisit / pipeline / closure still weak |

**Bottom line:** The "Evaluate fit → Generate prep pack" loop is the product's current high point. The CV extraction + rich packet usage + state + persistence fixes removed the worst "analysis failed" and "0/100 surprise" moments. However, the target user still scrolls past (or pastes into) a layout that feels X-hunt-first, and there is still no satisfying "what happened to the opportunities I evaluated?" story. The narrow polish helped surface the combined state; the next real gains are in **placement, mode clarity, and pipeline continuity**.

---

## What improved since v0.1 (the narrow + foundational work)

- CV summary is no longer inside the SearchWorkspace card. It is a distinct, always-editable `CvSummaryInput` component (resilience win for error recovery).
- The rich content from `cv-packet-pruned.md` is now the actual default flowing into both analyze and prep (no more anemic Rust fallback for normal usage).
- Prep now receives prior fit context (rationale, gaps, recommended action) so artifacts feel connected to the evaluation.
- Critical reliability: clicking "Generate prep pack" from the right panel no longer nukes the fit view or jumps to a brand-new opportunity ID (MVU preservation + in-place `set_prep_artifacts`).
- UI polish (this session):
  - `TargetFitPanel` title becomes "Fit analysis + Prep" and subtitle notes "(prep generated)" when artifacts exist.
  - Prep button tooltip is now informative about what it does and why the gate exists.
  - Data → Opportunities tab shows a success "prepped" badge instead of raw status.
- Feedback report updated to clearly separate "basic prep shipped" from the remaining cv-promote-guard and guard work.

The hero flow now feels like it could ship as "v0.2 target foundation."

---

## Current hero flow (Evaluate fit + prep) — observations

**Layout order in Discover left column (current):**
1. QuickTarget (URL + pasted JD + "Evaluate fit" + disabled "Full Prep (coming soon)")
2. CvSummaryInput ("CV summary packet (from distillation)" + "shared" tag + helper)
3. SearchWorkspace (X query + presets + Search / Run cycle)

**Strengths:**
- Right panel priority (`showJobFit`) works — after Evaluate fit the user sees the result immediately.
- The panel now acknowledges the combined state ("Fit analysis + Prep").
- Prep artifacts are actually reviewable in the same view (cover letter, CV suggestions, research, exceptional work example).

**Friction still visible:**
- For a pure job user, the first thing they see is the job form, then they have to scroll to the CV. The helper in the old QuickTarget used to lie ("from the box below"); we cleaned the copy in the new component, but the visual order is still "job first, context second."
- The disabled "Full Prep (coming soon)" button is still sitting right next to the active "Evaluate fit" button. This is the exact dual-affordance problem called out in v0.1.
- No obvious way to say "I already did this job last week" — you re-paste the URL or hunt in the Data table (which is still mostly read-only).

---

## Lens 1 — UI/UX expert + designer + developer

### Strengths (what's better than v0.1)

- **Component boundaries are clearer.** `CvSummaryInput` is now a first-class shared piece with its own documentation comment explaining why it must survive search errors. This is real architectural hygiene.
- **State model for the combined view** is finally honest. The merge in `update.ts` + carrying previous data through the prep loading state + the in-place DB update means the panel can show both the original fit *and* the new prep without lying about scores or IDs.
- **Data tab now signals progress.** The success-toned "prepped" badge is a cheap but effective signal that the opportunity has moved forward.
- The "shared" tag and helper text in `CvSummaryInput` make the cross-use (X + target) explicit.

### Issues (code-backed, prioritized)

#### P0 — Remaining trust / expectation breakers (carry-over + new)

| ID | Issue | Evidence | Fix |
|----|-------|----------|-----|
| T1 | CV editor still appears *after* the job form | `discover-screen.tsx:44-56` (QuickTarget then CvSummaryInput) | For job mode, put CV context first or as a sticky summary chip above the job inputs. Job users shouldn't have to hunt for their grounding data. |
| T2 | Dead "Full Prep (coming soon)" affordance still next to the real button | `discover-screen.tsx:145-152` (the disabled button in QuickTarget) | Remove it. One prep entry point (the one in the result panel) is enough until the left one is real. |
| T3 | No way to reopen a previous opportunity from Data | `data-screen.tsx:175-188` — rows are display-only | Add `OpportunitySelected` message + effect that loads the opportunity into the Discover opportunityTarget state (or at least pre-fills the form + shows the old result). |

#### P1 — IA and mode confusion

- Still no explicit "I'm in job mode" vs "I'm in X xplore mode." The left column is a long vertical stack of both.
- History and Statistics are still almost entirely X-centric. Opportunities exist in the DB and Data tab but feel like an afterthought in the rest of the app.
- Opportunity titles/companies are often "—" for Greenhouse jobs (the extraction path was never finished).

#### P2 — Polish

- The prep artifacts are still dumped in `<pre>` / details blocks inside the fit panel. Usable for now, but not "review UI."
- No toast/confirmation on the various "Copy ..." actions.
- The left column still feels like "everything for X plus this job thing we bolted on."

---

## Lens 2 — Daily power user / dogfooder

### Emotional arc (updated from v0.1)

| Day | Feeling | Why (current state) |
|-----|---------|---------------------|
| Day 1 | **Delight** | Paste real Greenhouse URL → honest fit using the good distillation CV packet → one click to real prep pack (letter + suggestions that reference the prior analysis) |
| Day 2 | **Slight friction** | "I want to tweak my CV for the next job" — have to scroll past the job form I just used |
| Day 3 | **Mild anxiety** | "Where did job #17 go?" Data table shows it as "prepped" (nice), but clicking it does nothing |
| Day 4 | **Distrust risk** | If you restart the app, your last CV edits are gone (still only in-memory model) |
| Day 5+ | **"This is good but incomplete"** | The analytical part (fit + prep) feels real. The organizational part (my jobs over time, my evolving CV, closure) still feels missing |

### Friction that remains high-value to fix

- **Revisit / continuity** is the biggest remaining gap for anyone who evaluates more than one job.
- **Mode pollution** — X search controls are always visible even when you're deep in a job evaluation session.
- **Ephemeral CV** — the most important grounding data for the entire product is lost on restart.

### Usefulness verdict (job track)

| Workflow | Verdict | Notes |
|----------|---------|-------|
| First-time Evaluate fit + prep | **Ship-quality** | The core loop is now genuinely better than the v0.1 state |
| Revisit / continue a job | **Weak** | No row click, no session restore, no pipeline |
| Evolve CV across multiple jobs | **Partial** | You can edit the packet, but nothing persists it or treats deltas as first-class sidecars |
| See "my stuff" in one place | **Not yet** | History is X-only; Data is admin tables; no "My opportunities" surface |

---

## Narrow polish impact (this iteration)

The changes we just landed are exactly the right kind of "narrow but high-signal":

- The adaptive title + "(prep generated)" note stops the jarring "suddenly it's 0/100 low fit" experience.
- The "prepped" badge in Data gives at least *some* closure signal.
- The better tooltip reduces the "what does this button even do?" moment.

These are good hygiene wins on top of the bigger reliability work (state merge + in-place updates).

---

## Prioritized next steps (keeping it narrow)

### Wave 1 (still small, high trust/continuity impact)

- Reorder or restyle so the CV context feels *owned by the job flow* when a URL/JD is present (sticky chip or move CvSummaryInput before QuickTarget for job users).
- Remove the dead "Full Prep (coming soon)" button from the left column entirely.
- Make Data opportunities rows clickable (dispatch something that loads the opportunity back into the Discover right panel).

### Wave 2 (slightly larger)

- Persist `cvSummary` (localStorage or proper sidecar on `CvSummaryChanged`).
- Add a minimal "Targets" section to History (or a combined Pipeline view).
- Finish basic title/company extraction for Greenhouse jobs so the Data table isn't full of "—".

### Wave 3 (the real remaining Slice C)

- cv-promote-guard integration (real devprofile load + sidecar proposals for CV suggestions).
- Proper prep review UI (not `<pre>`).
- Stronger guards + visible cost before the prep xAI call.

---

## Code touch list (narrow scope)

| File | Change |
|------|--------|
| `src/view/screens/discover-screen.tsx` | Reorder CV for job priority or add sticky summary; remove dead prep button |
| `src/view/screens/data-screen.tsx` | Row click / `OpportunitySelected` handler |
| `src/core/finder/msg.ts` + `effects.ts` | Add `OpportunitySelected` + load effect |
| `src/components/finder/target-fit-panel.tsx` | (already improved) — consider splitting prep section into its own small component later |
| `reports/quick-target-feedback.md` | (already updated in this round) |

---

## Acceptance criteria for "narrow polish complete"

After the changes above + this review:

- A user who only cares about jobs can edit their CV context without scrolling past X controls or feeling like they're in the wrong mode.
- There is exactly one obvious prep action after a fit result.
- Clicking an opportunity in the Data tab does *something* useful (reopens the fit/prep in context).
- The feedback report accurately reflects "basic usable prep shipped; the big guard and pipeline work is explicitly future."

This keeps the spirit of the v0.1 review (ruthless but constructive, code-backed, user-empathy + implementation lens) while acknowledging the real progress that has been made on the target story. 

The product is in a much better place for the "evaluate one job and get real prep" use case than it was in v0.1. The remaining work is mostly about making that experience feel like part of a coherent personal pipeline rather than a bolted-on feature.