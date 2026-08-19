# control-graph — English procedure (progressive disclosure)

**When to load this file:** Only if [../SKILL.md](../SKILL.md) formal symbols leave a phase, budget, or handoff unclear. Prefer the formal SoT for routine runs.

---

## What this skill is

You keep the agent’s creative tool loop, but wrap it in a **deterministic skeleton**:

1. **Outer control flow** — named phases as a **state machine** (or cyclic loop back to PLAN when scope remains).
2. **Inner bounded work** — a finite **DAG** of steps, or a **nested loop** that still has `done_when` and budgets.
3. **Plans, gates, sub-agents** — explicit plan, review gates, parallel workers only when independent.
4. **Model routing** — right role per phase; results re-enter the outer graph.

This is **procedure + decision tables**, not a runtime library (not LangGraph). It composes with orchestration and domain skills; it does not replace them.

**Rename:** This skill was previously named **looper**. Behavior is the same; the name now stresses outer SM/loop + inner DAG/nested-loop **graph**.

---

## Why not raw ReAct

Plain Thought → Action → Observation → repeat is creative but often:

- Implicit (state only in prompt history)
- Brittle (weak exit / retry / cancel)
- Hard to audit or hand off

Production agents wrap the creative loop in outer structure. Thesis: https://x.com/Peramanathan/status/2067890630345494578

---

## How to run (narrative)

1. **Triage** with agent-orchestrator: if single-shot, do not open a full control graph.
2. Open a **Control Card** and set phase to ORIENT. Write goal, constraints, unknowns. Optionally set `load_diag` (intrinsic / extraneous / germane × human / agent) — see [clt-load-balance.md](clt-load-balance.md) only if load tradeoffs are unclear.
3. **PLAN** with success criteria and exact verify commands. If high stakes or vague, pause at HITL_PLAN_GATE — keep the ask short (low extraneous) but require a real decision (germane).
4. Build the **inner** step list (DAG preferred). Assign model roles. Cap steps and tool calls. Fan out independent steps for the agent; keep human gates serial.
5. **EXECUTE** only those steps. Each step returns a short handoff, not a novel.
6. **VERIFY** by running the commands yourself. On failure, **REPAIR** only the gap while repair budget remains.
7. **REVIEW_GATE** for safety/scope when needed (fresh context — do not self-review as implementer).
8. **INTEGRATE** (merge, report, optional fusion surplus). If work remains, re-PLAN the **gap only**.
9. Terminal: DONE, CANCELLED, or BLOCKED with reason on the Card.

**Progress** means new evidence on the Card (diff, test result, decision). Re-reading the same files without a new hypothesis is not progress.

---

## Nested loops vs DAG

| Shape | Use when |
|-------|----------|
| **DAG** | Clear dependencies; some steps independent (parallel OK) |
| **Nested loop** | Same step type repeats with a stop condition (e.g. fix until lint clean, max N) |
| **Forbidden** | Nested “keep going” without `done_when` or without inheriting parent budgets |

---

## Composition in plain language

- **agent-orchestrator** — whether to multi-worker and how to brief  
- **control-graph** — phase, budget, route, gate while work runs  
- **Domain skills** — what “correct” means for finder, CV, React, deps, etc.

Do not copy domain guardrails into this skill.

---

## Anti-patterns (plain)

- Running tools until it “feels done”  
- Keeping phase only in conversational memory  
- Same long context that wrote the code also “reviews” it  
- One mega-step for the whole project  
- Retrying the identical failure without changing the plan  
- Continuing after budgets are exhausted without telling the user  
- Cutting *all* human effort so nothing durable is learned (lost germane load)  
- Forcing the agent to work strictly serially because “humans can only hold 4±1” when steps are independent  

---

## Install reminder

```bash
mkdir -p ~/.cursor/skills ~/.cursor/rules
ln -sfn "$(pwd)/control-graph" ~/.cursor/skills/control-graph
ln -sfn "$(pwd)/rules/control-graph.mdc" ~/.cursor/rules/control-graph.mdc
node control-graph/scripts/validate-skill.mjs
```

Old symlink named `looper` should be repointed to `control-graph` or removed.
