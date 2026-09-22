# TypeSafe System One / Jev — operator note

**Source:** Frontier Desk reading note, 2026-09-22. Vendor claims marked as such. **No Jev integration in-repo** — pattern reference only.

TypeSafe primitives (per [docs.typesafe.ai](https://docs.typesafe.ai)): **Choice** (discrete action), **Score** (0–100 calibrated probability), **Noul** (boolean / hard predicate). No free-form string generation.

---

## What it is

**TypeSafe Jev** is TypeSafe’s **System One** model: unstructured program state in → typed probabilistic decisions out (`Choice` / `Score` / `Noul`). Trained with RLCD; parallel sampling; calibrated confidence.

| Resource | URL |
|----------|-----|
| Launch post | https://typesafe.ai/blog/introducing-system-one-models-and-jev |
| Docs | https://docs.typesafe.ai |
| API | `POST https://api.typesafe.ai/v1/systemone` — Bearer `TYPESAFE_API_KEY`; model e.g. `jev-1.13.0` |
| Vercel AI Gateway | `typesafe-ai/jev` |

**Pricing (vendor claim):** ~$0.042 / MTok input; outputs free; latency ~70–500ms on System-One-shaped queries.

**Access (as of 2026-09-22):**

| Date | Status |
|------|--------|
| Sep 15 | Early-access waitlist at launch |
| Sep 20 | TypeSafe said no waitlist (`console.typesafe.ai`) |
| Sep 22 | **New signups paused** (demand/QoS); existing accounts continue |

Confirm live access at [console.typesafe.ai](https://console.typesafe.ai) before planning on a key. No public weights / self-host.

---

## Hunt stages → System One primitives

collab-finder already decomposes into atomic decisions; Jev would replace the **decision layer**, not the string-generation layer.

```mermaid
flowchart TB
  subgraph pull ["Pull / score — local, no LLM"]
    FL["finish_lead\n(hard filters)"] -->|Noul| SL["score_lead\nfirm ladder + lexicons"]
    SL -->|Score| FD["firm_durability::score_for_id\n+ profile_title_boost"]
    FD --> RS["rank_score + rank_reasons"]
  end

  subgraph analyze ["Analyze — structured decisions"]
    AQ["atomic questions\ndecompose rubric"] -->|Score| DF["dual-fit fields\ncandidate_to_role · role_to_candidate"]
    AQ -->|Noul| DB["deal_breakers_triggered\ngeo / theatre / mode"]
    DF --> CG{"confidence ≥ gate?"}
    DB --> CG
    CG -->|no| PA["Choice: pause → HITL"]
    CG -->|yes| PR["Choice: prep | ignore"]
  end

  subgraph prep ["Prep — typed gates + string gen"]
    PR -->|Choice/Noul| TG["template / spend gate"]
    TG --> XP["run_prep_opportunity_target\ncover letter · research pack · cv_suggestions"]
    XP --> SA["prep_artifacts_json"]
  end

  subgraph apply ["Apply — human gates"]
    SA --> CV["generate-apply-cv\nCV overlay from prep"]
    CV --> AP["operator apply / promote\nexplicit confirm"]
  end

  RS -->|"worth evaluate?"| AQ
  PA -.->|"low confidence"| AQ
```

**Confidence gates today:** `finder_reactor::analyze_lead` → `Decision { action, confidence, guards_triggered }`; FitThreshold when score &lt; 70; cost / X-rate guards before reactor spend. Analyze prompt: action `pause` when confidence &lt; 70 or guards non-empty ([xai-analyze-opportunity.md](../data/distillation/prompts/xai-analyze-opportunity.md)).

---

## Code seams (where decisions live)

| Seam | Path | System One shape | Persisted |
|------|------|------------------|-----------|
| Pull hard-filter | `mission_firms::finish_lead` | **Noul** — mixed SW/HW, query match, `texas_only` | dropped lead |
| Pull rank | `mission_firms::score_lead` | **Score** — firm ladder, lexicons, query tokens, profile boost/penalty | `MissionFirmLead.rank_score`, `rank_reasons` |
| Firm dual-fit (local) | `firm_durability::profile_match_firm`, `local_role_match`, `score_for_id` | **Score** + **Noul** hits/misses vs locked constraints | durability overlay on Pull; `commands/hunt.rs` blend |
| Xplore lexicon | `finder_reactor::fit_score` | **Score** — keyword heuristic (stub for xAI) | in-memory lead |
| Reactor decision | `finder_reactor::analyze_lead` → `Decision { action, confidence, guards_triggered }` | **Choice** + confidence gate | lead status |
| Analyze (Quick Target / Mission) | `opportunity_target::run_analyze_opportunity_target` | **Score** (`overall`, `candidate_to_role`, `role_to_candidate`) + **Choice** (`recommended_action`) | `opportunities.fit_score`, `analysis_json` |
| Analyze rubric / constraints | `data/distillation/prompts/xai-analyze-opportunity.md`, `curation/candidate-preferences.md`, `candidate-constraints-compact.txt` | atomic **Score** / **Noul** decomposition source | baked via `include_str` / operator packs |
| Prep (strings) | `opportunity_target::run_prep_opportunity_target`, `build_prep_user_prompt` | **not** System One — xAI structured JSON with generated prose | `prep_artifacts_json` |
| Apply | `generate-apply-cv`, `build_cv_sidecar_proposal` | human **Choice** only (cv-promote-guard) | `outcome_status`, `applied_at` |

**Score SoT problem (orient):** Pull `rank_score`, durability overlay, reactor `fit_score`, and analyze `overall` can disagree. Collapse to one ranked field + reason trace **before** swapping any layer to Jev — do not bolt Jev as a fourth ranker on top.

---

## Workflow (operator)

1. **Cheap System-One-shaped questions first** — at Pull: theatre vs mission (`score_lead` lexicons), geo hard-reject (`finish_lead` / constraints), durability admit (`firm_durability`). Decompose analyze into atomic **Score** / **Noul** items (one per dual-fit factor in [candidate-preferences](../data/distillation/curation/candidate-preferences.md)); confidence → HITL pause, even on current xAI JSON.
2. **Escalate to xAI string gen only on Prep** — cover letters, research packs, `cv_suggestions`, email drafts stay in `run_prep_opportunity_target`. Jev does not generate prose.
3. **Never a fourth ranker** — existing layers: firm ladder + lexicons (`score_lead`), durability/dual-fit (`firm_durability`), analyze `overall` → `fit_score`. Pick one SoT, wire reasons through; then optionally swap the decision call to Jev. See [mission-flow-relevance](./mission-flow-relevance.md), [mission-firms](../data/mission-firms/README.md).

---

## Decision vs string generation

System One / Jev answers **typed questions over program state** with calibrated probabilities. It does **not** generate free-form strings.

- **In-scope (System One):** closed answer spaces — **Choice** (pick from enum), **Score** (calibrated 0–100 / probs), **Noul** (true/false predicate). Software can branch, sort, threshold, and escalate on confidence without parsing prose.
- **Out-of-scope (chat LLMs / xAI):** open answer spaces — cover letters, research narrative, reply drafts, CV prose, any artifact whose value *is* the text.

Same hunt stage can host both: Prep may use System One for “which pack template?” / “worth spending tokens?” (**Choice** / **Noul**) while the letter body stays on xAI. Pull is mostly already System-One-shaped in Rust; that does not mean “Pull = Jev” — it means those *questions* are the right shape.

**Anti-pattern:** do not judge a slot by UI label — judge by whether the output must be a string humans read vs a typed value code consumes.

| Shape | Use System One (or local Rust equivalent) | Keep string models (xAI/Grok) |
|-------|--------------------------------------------|-------------------------------|
| Answer space | Closed: enums, scores, booleans | Open: prose, packs, drafts |
| Failure mode | Wrong branch / miscalibrated confidence | Hallucinated facts in text |
| Kanithanj examples | theatre vs mission **Noul**; geo hard-reject; dual-fit factor **Scores**; “prep vs pause vs ignore” **Choice**; confidence gate before reactor spend | cover letter; research pack; email/X reply; apply-CV narrative |
| Not a reason by itself | Stage name (“Pull”, “Analyze”) | Stage name (“Prep”) |

---

## Related

| Doc | Why |
|-----|-----|
| [data/distillation/README.md](../data/distillation/README.md) | Fit/scoring artifacts, analyze prompts, seam index |
| [docs/agentic-architecture.md](./agentic-architecture.md) | Structured decisions + guard model |
| [prompts/xai-analyze-opportunity.md](../data/distillation/prompts/xai-analyze-opportunity.md) | Current analyze rubric (xAI JSON) |
