# control-graph

**Outer state machine / cyclic loop + inner DAG or nested bounded loops** — hard budgets, HITL pause gates, multi-model routing.

Agents load **[SKILL.md](SKILL.md)** (formal SoT). Expand [references/english-procedure.md](references/english-procedure.md) only when the formal spec is insufficient.

**Formerly named `looper`.** Same contract; clearer graph semantics.

## Why

Raw ReAct is creative but implicit, weak on exit/retry/cancel, and hard to audit. Keep the loop for adaptation; give it a deterministic skeleton.

Thesis: [X @Peramanathan](https://x.com/Peramanathan/status/2067890630345494578).

## Quick start

```bash
# From skills library root
mkdir -p ~/.cursor/skills ~/.cursor/rules
ln -sfn "$(pwd)/control-graph" ~/.cursor/skills/control-graph
ln -sfn "$(pwd)/rules/control-graph.mdc" ~/.cursor/rules/control-graph.mdc
# On-the-fly DualLoad pre-filter (alwaysApply: true)
ln -sfn "$(pwd)/rules/clt-dual-load.mdc" ~/.cursor/rules/clt-dual-load.mdc

node control-graph/scripts/validate-skill.mjs
```

1. On multi-step work, open a **Control Card** from [references/control-card.md](references/control-card.md).
2. Compose with [agent-orchestrator](../agent-orchestrator/SKILL.md) (triage/workers), not instead of it.
3. Optional Cursor discovery rule: [../rules/control-graph.mdc](../rules/control-graph.mdc).
4. Always-on CLT pre-filter when installed: [../rules/clt-dual-load.mdc](../rules/clt-dual-load.mdc).

## Layout

| Path | Purpose |
|------|---------|
| [SKILL.md](SKILL.md) | Formal SoT: phases, transitions, budgets, roles, HITL, A8 DualLoad |
| [references/english-procedure.md](references/english-procedure.md) | Full English — load only if formal is ambiguous |
| [references/clt-load-balance.md](references/clt-load-balance.md) | CLT dual-actor middle ground — load only for strain/load decisions |
| [references/control-card.md](references/control-card.md) | Session control surface (`load_diag` optional) |
| [scripts/validate-skill.mjs](scripts/validate-skill.mjs) | Structural contract check |
| [../rules/control-graph.mdc](../rules/control-graph.mdc) | Optional Cursor discovery rule |
| [../rules/clt-dual-load.mdc](../rules/clt-dual-load.mdc) | On-the-fly A8 DualLoad pre-filter (`alwaysApply: true`) |

## Is / is not

| Is | Is not |
|----|--------|
| **Control plane** — phase, budget, route, gate | Domain product logic (finder, CV, X API) |
| Procedure + decision tables | A runtime state-machine library |
| Outer SM/loop + Inner DAG/nested loop | Replacement for orchestrator / domain skills |

## Related

- [clt-dual-load.mdc](../rules/clt-dual-load.mdc) — library-wide DualLoad injection; domain skills inherit via this rule (no paste-duplication)  
- [agent-orchestrator](../agent-orchestrator/SKILL.md)  
- [subagent-delegation](../subagent-delegation/SKILL.md)  
- [fusion-sage](../fusion-sage/SKILL.md) / [ai-optimization](../ai-optimization/SKILL.md)  
- [concurrent-cli-agents](../concurrent-cli-agents/SKILL.md) + [git-worktrees](../git-worktrees/SKILL.md)  
- [formal/AppGenMathPhyLang.kernel.md](../formal/AppGenMathPhyLang.kernel.md)  
