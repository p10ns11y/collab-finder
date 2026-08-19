---
name: finder-reactor
description: Core autonomous, self-guarded decision loop for opportunity-finder apps. Handles discovery (e.g. X search), analysis (LLM + CV + platform context), prep generation, tracking, and guarded promote with cost/rate/fit/CV mutation guards, human pause points, structured decisions, and logging. Use when designing, implementing, or debugging the agentic heart of a finder platform. Fission for tight loops; fusion for reactor architecture and surplus.
---

# Finder Reactor — Self-Guarded Opportunity Engine

> **Load rule:** Formal SoT. Fission loops → [ai-optimization](../ai-optimization/SKILL.md); architecture/surplus → [fusion-sage](../fusion-sage/SKILL.md); CV writes → [cv-promote-guard](../cv-promote-guard/SKILL.md).  
> **CLT:** [../rules/clt-dual-load.mdc](../rules/clt-dual-load.mdc) — HITL pauses stay short+decisive; agent loop may continue in parallel until a human gate fires.

```text
// Mission
Finder ≔ search → analyze → decide → prep → track → (promote?) → surplus
// with guards + HITL pauses on high stakes

// Axioms
A1  Guard ≻ Speed          // named check + audit before threshold cross
A2  Pause on stakes/ambiguity  // CV promote, low conf, cost/rate, writes
A3  Human owns query       // never hide "best" search
A4  Sidecar-first external mutation  // promote proposal before master write
A5  Decide outputs structured  // conf + guards + rationale (zod/serde)
A6  Surplus after every cycle
A7  Reversible + auditable  // JSON state; .bak + git-friendly CV diffs
```

## Reactor Loop (Conceptual State Machine)

```
Search (tunable query + platform context)
  → Ingest + Classify
  → Analyze (pruned CV packet + platform skill/llms + post → fit, gaps, angle, confidence)
    Guard: cost, rate, basic validity
  → Decide (structured: pursue? score? prep now? pause for user? why?)
  → Prep (if cleared): letter, cv-delta, research, outreach (guarded)
  → Present + Track (UI/MCP)
  → Export / Apply (user or approved agent action)
  → Outcome → Learn
  → Promote (if pattern or explicit): guarded path to external CV repo
  → Surplus
```

Every arrow has a guard or pause hook.

**Pause / Intervention Points** (UI toasts/dialogs + MCP `ask_user` tool):
- Before expensive LLM batch.
- On fit 60–85 or "interesting but stretch".
- Before any promote.
- On rate limit approaching or cost budget hit.
- On low confidence decision.

## Implementation Patterns

**Fission**: Prune CV to "CorePacket"; prune platform posts; token budget on every prompt; structured output schemas.

**Fusion**: Treat as `FinderReactor` state machine; cross-cutting guards (`CVPromoteGuard`, `CostGuard`, `RateGuard`, `DecisionLogger`, `SurplusGenerator`); persist "what worked".

**MCP / Skill Exposure**: Key entry points as MCP tools (`search`, `analyze`, `prep`, `decide`, `promote`). Document in root `SKILL.md` (agentskills.io style).

## Guardrails (Non-Negotiable)

- Never send full raw CV JSON or unpruned threads to LLM unless user explicitly asks for "deep mode" with confirmation.
- Never write to external profile CV without sidecar + preview + two explicit confirms.
- Always surface rate limit headers and estimated spend.
- All autonomous "decide" outputs must include confidence (0–100) and intervention level.
- Reactor dev: follow [bdd-strategizer](../bdd-strategizer/SKILL.md) for guard + pause logic.

## Activation for Agents

- Architecture / new guard design: load finder-reactor + [fusion-sage](../fusion-sage/SKILL.md).
- Specific guard, prompt, or MCP tool: [ai-optimization](../ai-optimization/SKILL.md) + [cv-promote-guard](../cv-promote-guard/SKILL.md), [x-agent-resources](../x-agent-resources/SKILL.md), [tauri-agentic](../tauri-agentic/SKILL.md).
- Parallel Rust vs React vs prompts: [agent-orchestrator](../agent-orchestrator/SKILL.md) + [git-worktrees](../git-worktrees/SKILL.md).

## Surplus Generation (Mandatory After Reactor Changes)

```
⚡ Finder Surplus (Q ≈ X.X)
This change would have [saved Y tokens / avoided Z bad decisions] on recent opportunities.
Concrete future win: [specific example].
Suggested follow-up: [one compounding improvement].
```

Track in `.agents/skills/finder-reactor/surplus-log.md` or fusion-state.

## Related

[x-agent-resources](../x-agent-resources/SKILL.md), [cv-promote-guard](../cv-promote-guard/SKILL.md), [tauri-agentic](../tauri-agentic/SKILL.md), [ai-optimization](../ai-optimization/SKILL.md), [fusion-sage](../fusion-sage/SKILL.md), [agentic-reactor](../agentic-reactor/SKILL.md).

**Example provenance:** battle-tested on [collab-finder](https://github.com/p10ns11y/collab-finder).
