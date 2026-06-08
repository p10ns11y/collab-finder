# Deep Tech Debt Report — collab-finder

**Date:** 2026-06  
**Audience:** Core implementers + future maintainers  
**Purpose:** Identify architectural, data, and systems decisions that feel acceptable today but will cause significant pain, rework, or bugs in 6–24+ months.  
**Context:** Post job-target analysis + basic prep (Slice C foundation), CV extraction, and narrow polishes on `feat/job-target-analysis`.

This report focuses on **deep** debt — not surface polish or missing features, but structural choices that will become exponentially harder to fix later.

---

## Executive Summary

| Debt Area                        | Time to Serious Pain | Severity | Current Masking Factor                  | Primary Risk |
|----------------------------------|----------------------|----------|-----------------------------------------|--------------|
| In-memory user context (CV + job sessions) | 3–6 months          | High     | Single-user desktop; restarts feel rare | Data loss + broken trust |
| Loose `jobTarget: AsyncState<any>` + merge hacks | 6–12 months       | High     | Only two result shapes so far           | Type explosions, impossible refactors |
| Opportunity dedup & schema (opaque JSON blobs) | 6–12 months      | High     | Small data volume; no multi-prep yet    | Data corruption, lost history, migration hell |
| Secrets / dual keyring+file storage | Ongoing (already bitten) | Critical | "STABILITY CONTRACT" comments + duplicated code | Silent auth breakage on OS/keyring changes |
| No unified opportunity/lead pipeline model | 12–18 months     | Medium-High | History & Stats still X-centric         | Agentic reactor becomes unmaintainable |
| Lack of persistence & session model | 6–9 months         | Medium   | Fresh dogfood usage                     | Users lose work; no "reopen job #17" |
| cv-promote-guard integration debt | 9–18 months        | High     | Still using static distilled packet     | When real devprofile arrives, current prep artifacts become legacy garbage |
| SQLite schema evolution & migrations | 12+ months       | Medium   | Only one additive table so far          | Breaking changes when adding columns to analysis/prep |
| Weak observability & testing of agentic paths | 6–12 months   | Medium   | Manual dogfooding works for happy path  | Regressions in guards, cost, rate limits, structured output |
| Monolithic Discover + mixed modes | 9–15 months        | Medium   | Only two primary flows (X + job target) | UI and state become unmaintainable as more opportunity types added |

**Overall assessment:** The project has good bones (MVU, ports/adapters, Tauri command discipline, self-guard philosophy). However, several "we'll fix it when we need real CV / multi-job usage / restart resilience" decisions are now accumulating. The job target work exposed several of them.

---

## 1. In-Memory User Context (Highest Near-Term Risk)

**Location:**
- `src/core/finder/model.ts`: `cvSummary`, `jobTarget`, `jobTargetUrl`
- `src/core/finder/update.ts`: `CvSummaryChanged` just mutates in-memory
- `initialFinderModel()` always resets to `DEFAULT_CV_SUMMARY`
- No effect that persists `CvSummaryChanged`

**Current situation:**
- CV packet and recent job target state are lost on every app restart.
- `QuickJobTarget` still carries some local `useState` for url/pasted.
- The recent `CvSummaryInput` extraction made the *component* resilient, but the *data* is still ephemeral.

**Why it will bite:**
- Users who treat this as a serious daily tool will edit their CV summary, evaluate 5–10 jobs, generate prep packs, then restart the app and lose everything.
- When real `cv-promote-guard` arrives and starts proposing deltas, losing the base CV on restart will be unacceptable.
- No way to have "sessions" or "workspaces" for different job hunts.

**Mitigation difficulty:** Medium now (add localStorage + load effect). Very high later once people depend on the data and we have sidecar CV proposals.

---

## 2. `jobTarget: AsyncState<any>` + Ad-Hoc Merging

**Location:**
- `model.ts:68`
- `update.ts` (multiple `as any` casts, especially the prep loading data hack and merge)
- `effects.ts: jobTarget*Cmd`
- `job-fit-panel.tsx` (heavy `(result as any)?.fit` / `?.prep`)

**Current situation:**
- We have two different result shapes (`JobAnalysisResult` vs `JobPrepResult`).
- Prep success does a shallow merge to "preserve" fit.
- We had to carry previous data on the `loading` state using `as any` because the `AsyncState` discriminated union doesn't allow it.
- Every new artifact type (CV deltas, multiple prep versions, research packs) will make this worse.

**Why it will bite (6–12 months):**
- Type safety is completely lost at the boundary between Rust structured output and the UI.
- Adding a third result shape (e.g. "full CV tailoring result") will require more heroic merging.
- The "carry data through loading" pattern is a footgun for future guards/pauses.
- Debugging "why is my fit suddenly gone?" will become a recurring class of bug.

**Related:** The same pattern exists in `cycle` and `search` but they are simpler today.

---

## 3. Opportunity Model & Deduplication (Data Integrity Debt)

**Location:**
- `src-tauri/src/db.rs:963` (`upsert_opportunity`)
- The post-insert `SELECT ... WHERE (source_url = ? OR jd_text = ?) ORDER BY id DESC`
- `lib.rs` analyze and (formerly) prep paths
- `set_prep_artifacts` was added as a workaround because the upsert path creates new rows

**Current situation:**
- There is no `UNIQUE` constraint or proper conflict target on `(source_url, jd_text)` or a content hash.
- Every call to `upsert_opportunity` can (and does) create new rows for the same logical job.
- `analysis_json` and `prep_artifacts_json` are free-text blobs with no version field.
- We had to special-case prep to avoid creating duplicate opportunities.

**Why it will bite:**
- Once users have 50–100 opportunities, duplicate rows + "which one is the real one?" becomes a nightmare.
- Multiple prep generations on the same job will create a mess of rows instead of versions on one row.
- Adding schema to `analysis_json` (e.g. adding `cv_version`, `model_used`, `cost_breakdown`) requires either:
  - Parsing every blob on migration, or
  - Living with unqueryable data forever.
- History and pipeline views will be incorrect.

**Mitigation:** Proper content-addressed or `(source_url, content_hash)` unique constraint + a real `OpportunityVersion` or `analysis_version` column. Much harder once real user data exists.

---

## 4. Secrets & Dual Storage (Known Recurring Pain Point)

See the giant "STABILITY CONTRACT" headers in:
- `src-tauri/src/secrets.rs`
- `src-tauri/src/app_dirs.rs`

**Current situation:**
- X bearer and xAI key use **identical but deliberately duplicated** dual keyring + 0600 file logic.
- Comments explicitly say "do not refactor these together".
- History shows this area has been broken multiple times by unrelated changes (tweet storage, DB schema, "clean up lib.rs", etc.).

**Why it will bite (already has, will continue):**
- macOS/Windows/Linux keyring behavior differences.
- File permission / app sandbox changes on updates.
- Any future "unified secrets manager" attempt will be extremely risky.
- Adding a third secret (e.g. for a future LLM provider or devprofile token) will duplicate the pattern again.

This is one of the few areas the project itself has called out as high-risk.

---

## 5. No Real Persistence / Session Model

Related to #1 but broader:

- `FinderModel` (including `activeScreen`, recent `jobTarget`, `cvSummary`, etc.) is reconstructed on every launch.
- `HistorySlice` is refreshed from DB, but live job target work is not.
- No concept of "current work session" or "pinned opportunities".

**Future pain:**
- Users cannot leave the app, come back, and continue where they left off with the same job + CV state.
- Multi-job workflows become painful.
- When we add agentic background work or "daily reactor", there will be no durable "what the agent was doing" state.

---

## 6. cv-promote-guard Integration Debt (Future Explosion)

Current prep artifacts live as a JSON blob in `opportunities.prep_artifacts_json`.

When we actually implement `cv-promote-guard` (as called for in the original feedback and skills):

- It expects **sidecar files**, unified diffs, explicit user confirmation, backups (`cvdata.json.bak-*`), and never mutating the external devprofile without multiple gates.
- The current in-DB `cv_suggestions` will be legacy data that doesn't match the guard's contract.
- The guard also wants to read the **real** pruned CV from the user's devprofile checkout, not the static distilled packet.

This is classic "we'll connect the real thing later" debt that usually requires a migration or parallel implementation.

---

## 7. SQLite Schema & Evolution Strategy

- Only additive migration (`migrate_v3` for opportunities).
- No migration runner with versions.
- JSON columns (`analysis_json`, `prep_artifacts_json`, `decision_json`) have no internal versioning.
- No foreign keys, limited indexes.

**Bite timeline:** 12–24 months, when we want to add:
- Structured fields from the JSON blobs
- Version history per opportunity
- Relations between opportunities and X leads
- Full-text search on JD text + prep artifacts

---

## 8. Other Notable Medium-Term Debts

- **Monolithic Discover + mixed concerns**: Job Target and X search are siblings in the same left column and share the same MVU model. Adding more opportunity types (collab, side hustle, community) will make this screen unmaintainable.
- **Testing surface**: Almost no tests for the actual agentic paths, structured output contracts, or guard logic. The only robust tests are around secrets/keyring.
- **Observability**: Cost, rate limit, and guard events exist but are not aggregated or surfaced well outside the current session.
- **Tauri command surface growth**: Every new capability adds another `#[tauri::command]`. No contract tests or generated client types between Rust and TypeScript.

---

## Recommended Pay-Down Actions (Prioritized by Impact / Effort)

**High impact, relatively cheap (do in next 1–2 months):**
1. Add persistence for `cvSummary` (localStorage or app-data sidecar + load on `AppStarted`).
2. Give `jobTarget` a proper discriminated type instead of `any` (at minimum `AnalysisResult | PrepResult | null`).
3. Add a real content hash or proper unique constraint + `content_hash` column on opportunities.
4. Remove the dead "Full Prep (coming soon)" button (already flagged multiple times).

**Medium effort, high future value:**
5. Introduce a minimal `Session` or `WorkContext` concept that survives restarts.
6. Add a simple migration system + version field inside the JSON blobs.
7. Create a `Pipeline` or unified `Opportunity` + `Lead` view abstraction (even if UI is later).

**High effort (plan for dedicated slice):**
8. Actual `cv-promote-guard` integration with sidecars (do this *before* too many people have prep artifacts in the old format).
9. Proper secrets abstraction that can be tested and evolved without duplicating 200+ lines.
10. Mode separation in Discover (Job Mode vs X Hunt Mode) with collapsed irrelevant UI.

---

## Closing Note

Many of these debts are "acceptable for v0.1–v0.2 dogfood" because the user base is tiny and usage is mostly happy-path first-time evaluation. The moment this becomes a serious daily tool for even 5–10 people doing repeated job + prep work, several of these will move from "annoying" to "we have to stop and rewrite this".

The project has unusually good self-awareness in places (the secrets stability contract, the cv-promote-guard skill doc, the original feedback report). The risk is that the momentum of "make the next feature work" will keep deferring the structural fixes until they are painful.

Prioritize the persistence + typing + opportunity model items soon. They are the ones most likely to bite first as the job target flow matures.