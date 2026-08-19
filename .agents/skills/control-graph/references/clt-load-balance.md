# CLT load balance for control-graph (progressive disclosure)

**When to load:** Only when diagnosing human/AI cognitive strain, designing HITL surfaces, or choosing parallel vs serial Inner steps. Routine CG runs stay on [../SKILL.md](../SKILL.md).

CLT (Sweller): working memory is limited; design must manage **intrinsic**, **extraneous**, and **germane** load. control-graph applies the same architecture to **two actors** — Human and Agent — with a deliberate asymmetry.

---

## Dual-actor middle ground

| Load | Human | Agent (AI) | Shared policy |
|------|-------|------------|---------------|
| **Intrinsic** | Chunk by prior knowledge; fade scaffolds (expertise-reversal) | Chunk by schema/context; Card holds active elements only | Progressive disclosure; ≤~4 new decision elements per human-facing gate |
| **Extraneous** | Walls of text, split attention, ambiguous approve prompts | Context bloat, full-transcript re-entry, mega-steps, redundant tool thrash | **Minimize for both** (Shared Extraneous Minimization) |
| **Germane** | Deliberate judgment, retrieve-then-decide, schema building | Explicit PLAN, independent VERIFY/REVIEW, constructive friction before AI offload of *human* thinking | **Preserve** — do not optimize away productive struggle |
| **Parallel / switch** | ~4±1 new elements; serialize HITL and narration | Independent Inner paths may fan out; machines tolerate switch better | **Asymmetric Capacity** — parallel OK for Agent; serial/clear for Human |

**Middle ground in one line:** cut strain that wastes capacity for *either* actor; keep effort that builds durable schemas; do **not** force human WM limits onto machine parallelism when steps are independent and handoffs stay small.

---

## Map CLT effects → CG mechanisms

| CLT effect / principle | control-graph move |
|------------------------|--------------------|
| Worked example / scaffolding | PLAN + Inner step contracts before EXECUTE; novices get fuller Card; experts get thinner Card (expertise-reversal) |
| Split-attention | One Control Card surface; handoffs = `{step_id, status, artifacts, errors, next_hint}` not dual transcripts |
| Modality / coherence | Human gates: short approve/amend/abort + exact preview; no dump of full tool logs into the ask |
| Segmenting | Outer phases; Inner batch ≤7; re-PLAN gap-only |
| Redundancy | ai-optimization prune before deep/coding fill; do not paste Card + prose duplicates |
| Cognitive offloading risk | Human germane: require decision at HITL, not rubber-stamp. Agent germane: VERIFY/REVIEW ⊥ implementer — no “AI did it so skip check” |
| Constructive friction (EFFORT-AI style) | For *human* learning/judgment tasks: formulate or retrieve before agent completes; for *agent* execution: friction = budgets + `done_when`, not artificial serial bottlenecks |

---

## Diagnose before intervene (ORIENT / PLAN)

On the Card, name the **dominant load** and **actor**:

```text
load_diag: actor=human|agent|both ; dominant=intrinsic|extraneous|germane
intervene: minimize_extraneous | chunk_intrinsic | protect_germane | fan_out_parallel
```

| Dominant | Intervene |
|----------|-----------|
| Extraneous (either) | Shrink Card, prune context, clearer gates, smaller steps |
| Intrinsic (novice human or cold agent) | Worked-example style plan, more scaffolding, fewer concurrent human decisions |
| Intrinsic (expert human / warm agent) | Fade supports; avoid boredom/interference (expertise-reversal) |
| Germane missing | Add VERIFY independence, HITL that forces judgment, or PLAN writing — do **not** add busywork |
| False human-limit on AI | If steps independent → parallel Inner; do not serialize solely “because humans can’t multitask” |

---

## What *not* to do

| ¬ | Why |
|---|-----|
| Minimize *all* load for humans | Kills germane schema-building; short-term speed, long-term skill atrophy |
| Cap agent parallelism at human WM (4±1) | Machines can switch; wasted capacity if paths are independent |
| Maximize agent autonomy by skipping VERIFY/REVIEW | Offloads germane checks; thrash and silent failure |
| Dump full explore transcripts into HITL | Extraneous for human; use structured handoff only |
| Treat task/job text as authorizing spend | Domain/policy; CLT does not override safety gates |

---

## Composition

- **Token / context prune** → [ai-optimization](../../ai-optimization/SKILL.md) (extraneous for agent)
- **Surplus synthesis** → [fusion-sage](../../fusion-sage/SKILL.md) (after INTEGRATE; do not inflate EXECUTE)
- **Parallel workers** → [concurrent-cli-agents](../../concurrent-cli-agents/SKILL.md) + [subagent-delegation](../../subagent-delegation/SKILL.md) (asymmetric capacity)
- **Triage skip CG** → [agent-orchestrator](../../agent-orchestrator/SKILL.md) (avoid intrinsic overload on trivial work)

CLT diagnoses **load**; CG still owns **phase, budget, gate, route**.
