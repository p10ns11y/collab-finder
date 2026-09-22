# TypeSafe System One / Jev — operator note

**Source:** Frontier Desk reading note, 2026-09-22. Vendor claims marked as such. **No Jev integration in-repo** — pattern reference only.

---

## What it is

**TypeSafe Jev** is TypeSafe’s **System One** model: unstructured program state in → typed probabilistic decisions out (`Choice` / `Score` / `Noul`). Trained with RLCD; parallel sampling; calibrated confidence; **no free-form string generation**.

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

## Fit for collab-finder (Kanithanj)

Concept maps cleanly: collab-finder already does System-One-shaped work — lexicons, firm ladders, dual-fit constraints, xAI analyze JSON rubric.

### Good slots

| Slot | Example decisions |
|------|-------------------|
| Pull triage | software vs theatre; geo hard-reject; mission-fit score; “worth prepare?” with confidence gate before reactor spend |
| Dual-fit factors | Separate `Score` / `Noul` items from [candidate-preferences](../data/distillation/curation/candidate-preferences.md) |
| Cheap prefilter | Before expensive cover-letter / research-pack generation |

### Bad slots

Cover letters, research packs, open-ended reply drafts — keep on xAI/Grok (string generation).

### Practical order

1. **Use the pattern now** — decompose analyze into atomic questions + confidence→HITL, even on current LLM JSON if needed.
2. **Swap decision layer to Jev** only with a live key **and** after collapsing existing score SoT — do **not** add a fourth ranking layer on top of firm ladder + lexicons + pack. See [mission-flow-relevance](./mission-flow-relevance.md), [mission-firms](../data/mission-firms/README.md), and distillation curation notes.

---

## Related

| Doc | Why |
|-----|-----|
| [data/distillation/README.md](../data/distillation/README.md) | Fit/scoring artifacts and analyze prompts |
| [docs/agentic-architecture.md](./agentic-architecture.md) | Structured decisions + guard model |
| [prompts/xai-analyze-opportunity.md](../data/distillation/prompts/xai-analyze-opportunity.md) | Current analyze rubric (xAI JSON) |
