---
name: looper
description: >-
  Structured agent loop manager: outer state machine (phases, transitions, checkpoints,
  HITL pause gates), bounded inner steps (DAG-style done/retry/cancel/max-iter), and
  multi-model routing (fast vs deep vs review vs explore). Use for multi-step agent
  cycles, loop control, model routing, structured ReAct, preventing infinite loops —
  not for domain product logic. Composes with agent-orchestrator, subagent-delegation,
  fusion-sage, concurrent-cli-agents. Portable for Grok Build, Cursor, and peers.
---

# Looper — Structured Loops Over Raw ReAct

**Mission:** Keep the agentic loop for creativity and adaptation, but give it a **deterministic skeleton** — an outer state machine (or statechart) with DAG-style inner steps, hard exit conditions, review gates, and multi-model routing. Agents that only “Thought → Action → Observation → repeat” stay brittle; this skill is the control layer that makes loops **auditable, bounded, and high-value**.

**Thesis (portable):** Raw ReAct is implicit (state in prompt history), weak on exit/retry/cancel, and hard to visualize or audit — see [@Peramanathan on structured loops over raw ReAct](https://x.com/Peramanathan/status/2067890630345494578). Production agents wrap the creative loop in:

1. **Outer control flow** — named phases, transitions, checkpoints, human-in-the-loop.
2. **Inner bounded steps** — finite sub-workflows / DAGs with clear done, retry, cancel.
3. **Plans + gates + sub-agents** — explicit plan, review gates, parallel workers when independent.
4. **Model routing** — right model class per phase/role, results re-enter the outer loop.

This skill is **procedure + decision tables**, not a runtime library. It composes with orchestration and domain skills; it does **not** replace them.

---

## When to activate

| Signal | Action |
|--------|--------|
| Multi-step work with risk of thrashing or infinite tool loops | Load this skill; start a **Loop Card** |
| “Keep going until done”, long autonomous run, goal/agent loop | Outer state machine + max-iteration budget |
| Choosing cheap vs deep vs review model (or single-model phased roles) | Apply [Model routing matrix](#model-routing-matrix) |
| Parallel subagents / waves with re-entry into a parent cycle | Outer loop owns re-entry; workers are inner steps |
| User says “loops”, “state machine”, “structured ReAct”, “model routing”, “loop manager” | Full skill |
| Domain autonomy (finder reactor, CV promote, X search) | Domain skill **owns domain**; this skill owns **loop shape** only |

**Skip** for single-shot (≤1–2 files, obvious fix) — use [agent-orchestrator](../agent-orchestrator/SKILL.md) triage only.

**Portable activation**

| Environment | How to load |
|-------------|-------------|
| **Grok Build** | Description match / read this path; slash or “use looper” |
| **Cursor** | Symlink skill + optional rule (see [Portable wiring](#portable-wiring)) |
| **Any AGENTS.md agent** | Route via project index → this `SKILL.md` |
| **Single-model session** | Still use phases + roles as **prompt roles**; routing is advisory |

---

## Outer loop state machine

Named phases are **explicit state**. The agent must know which phase it is in, what may transition, and what forces pause or exit. Do not keep phase only in conversational memory — write it on the **Loop Card** (chat checklist or [references/loop-card.md](references/loop-card.md)).

```text
                    ┌──────────────┐
                    │    IDLE      │
                    └──────┬───────┘
                           │ goal accepted
                           ▼
                    ┌──────────────┐
              ┌────►│   ORIENT     │◄── resume / re-orient after pause
              │     └──────┬───────┘
              │            │ context + constraints known
              │            ▼
              │     ┌──────────────┐
              │     │    PLAN      │──► (optional) HITL_PLAN_GATE
              │     └──────┬───────┘
              │            │ plan accepted / auto-cleared
              │            ▼
              │     ┌──────────────┐     bounded DAG / sub-steps
              │     │   EXECUTE    │◄────────────────────────┐
              │     └──────┬───────┘                         │
              │            │ step batch done                 │ retry (budget left)
              │            ▼                                 │
              │     ┌──────────────┐     fail / gap    ┌─────┴──────┐
              │     │   VERIFY     │──────────────────►│   REPAIR   │
              │     └──────┬───────┘                   └────────────┘
              │            │ pass
              │            ▼
              │     ┌──────────────┐
              │     │ REVIEW_GATE  │──► (optional) HITL_REVIEW
              │     └──────┬───────┘
              │            │ cleared / not required
              │            ▼
              │     ┌──────────────┐
              │     │  INTEGRATE   │  merge, report, surplus
              │     └──────┬───────┘
              │            │
              │     more scope? ──yes──► PLAN (narrow remaining gap)
              │            │ no
              │            ▼
              │     ┌──────────────┐
              └─────│    DONE      │  or CANCELLED / BLOCKED
                    └──────────────┘
```

### Phase contract

| Phase | Purpose | Exit when | Default model role |
|-------|---------|-----------|-------------------|
| **IDLE** | No active loop | Goal / request accepted | — |
| **ORIENT** | Goal, branch, constraints, risks, skills | 1-sentence goal + unknowns listed | **fast** or **explore** |
| **PLAN** | Phases, file ownership, verify commands, budgets | Written plan + success criteria | **deep** (or **fast** if light) |
| **HITL_PLAN_GATE** | User approves risky/vague plan | Explicit approve / amend / abort | — (human) |
| **EXECUTE** | Run bounded inner steps only | Step batch complete or guard fire | **coding** / **fast** per step |
| **VERIFY** | Independent checks vs plan | All verify commands run; pass/fail known | **fast** (run tools) + **review** on fail |
| **REPAIR** | Narrow fix for verify gap only | Gap closed or retry budget exhausted | **coding** |
| **REVIEW_GATE** | Quality / safety / scope review | Pass, HITL, or rework → REPAIR/PLAN | **review** |
| **HITL_REVIEW** | Human on high-stakes | Approve / reject / redirect | — (human) |
| **INTEGRATE** | Merge, index, report, surplus | Artifacts landed + summary written | **fast** |
| **DONE** | Terminal success | — | — |
| **CANCELLED** | User or policy abort | — | — |
| **BLOCKED** | External blocker after retries | Blocker stated; wait or cancel | — |

### Transition table (guards)

| From → To | Guard (must be true) |
|-----------|----------------------|
| IDLE → ORIENT | Non-trivial goal or explicit “run loop” |
| ORIENT → PLAN | Goal sentence + constraints captured |
| PLAN → EXECUTE | Plan has success criteria + verify commands; **or** light-orchestration exception |
| PLAN → HITL_PLAN_GATE | High stakes, vague scope, destructive ops, or user asked for plan approval |
| HITL_PLAN_GATE → PLAN | User amended |
| HITL_PLAN_GATE → EXECUTE | User approved |
| HITL_PLAN_GATE → CANCELLED | User aborted |
| EXECUTE → VERIFY | Inner step batch finished (success or exhausted step retries) |
| VERIFY → INTEGRATE | All acceptance checks pass |
| VERIFY → REPAIR | Failures exist and **repair_budget > 0** |
| VERIFY → BLOCKED | Failures and repair_budget = 0 or external blocker |
| REPAIR → VERIFY | Fix applied; re-run checks |
| REPAIR → PLAN | Gap reveals wrong plan (re-plan remaining only) |
| INTEGRATE → DONE | No remaining in-scope work |
| INTEGRATE → PLAN | Remaining gap only (resume-style narrow plan) |
| Any → HITL_* | Cost/rate/fit/safety/confidence guard, or phase requires human |
| Any → CANCELLED | User cancel, hard policy, or max_loop_iters hit with no progress |
| Any → BLOCKED | Credentials/network/permissions after ≥2 attempts |

### Hard exit conditions (non-negotiable)

Declare these on the Loop Card **before** EXECUTE:

| Budget | Default | Behavior when exhausted |
|--------|---------|-------------------------|
| `max_loop_iters` | 8 outer phase cycles (ORIENT→…→ back) | STOP → report progress + blocker; do not silent-continue |
| `max_repair_rounds` | 3 VERIFY→REPAIR cycles per wave | STOP or escalate HITL |
| `max_step_retries` | 2 per inner step | Mark step failed; continue independent siblings or abort batch |
| `max_tool_calls_per_step` | 25 (tunable) | Force step exit with partial observation |
| `wall_clock` / cost | Session or user limit | HITL or CANCELLED |
| `no_progress` | 2 consecutive iters with same failure signature | Re-PLAN or HITL — no thrash |

**Progress** = new evidence (diff, test result, decision) that changes the Loop Card. Re-reading the same files without a new hypothesis is **not** progress.

---

## Inner steps (bounded DAG, not infinite ReAct)

Each EXECUTE batch is a **finite** set of steps with dependencies — a small DAG or ordered list — never an open-ended “keep calling tools.”

### Step contract

Every step declares:

```text
id:            S1
name:          …
depends_on:    [] | [S0, …]
done_when:     observable condition (command exit 0, file exists, assertion)
retry:         0..max_step_retries
on_fail:       abort_batch | continue_siblings | escalate_HITL
cancel_when:   user cancel | parent CANCELLED | budget exhausted
model_role:    fast | explore | coding | deep | review
inputs:        what context this step gets (not the whole history dump)
outputs:       what re-enters the outer loop (summary, paths, pass/fail)
```

### Inner loop rules

1. **Bound first** — write the step list before tools; max steps per batch (default 7).
2. **One primary outcome per step** — no mega-steps that re-plan the whole project.
3. **Parallel only if independent** — disjoint paths/ownership; use [concurrent-cli-agents](../concurrent-cli-agents/SKILL.md) + [subagent-delegation](../subagent-delegation/SKILL.md).
4. **Re-enter outer loop with structured results** — not raw transcript dump: `{step_id, status, artifacts, errors, next_hint}`.
5. **No nested unbounded ReAct** — a step may use a short tool micro-loop, but it inherits `max_tool_calls_per_step` and `done_when`.
6. **Cancel is first-class** — on cancel, leave tree consistent (no half-merge); record CANCELLED reason.

```text
EXECUTE batch
  → topological order (or parallel independent set)
  → for each step: run until done_when | retry | fail
  → aggregate outputs → VERIFY
```

---

## Model routing matrix

Route by **task class / phase signal**, not by brand loyalty. Map roles onto whatever models the host exposes (Grok, Cursor Composer/model picker, Claude, local, etc.).

### Roles (≥3 distinct)

| Role | Use for | Inputs (minimal) | Output re-enters loop as |
|------|---------|------------------|---------------------------|
| **fast** | Orient, triage, run commands, small edits, classify errors, Loop Card updates | Goal snippet, error text, file paths | Facts, pass/fail, next phase suggestion |
| **explore** | Broad codebase map, readonly surveys, “where does X live?” | Scope dirs + numbered questions | Structured map ([subagent-delegation](../subagent-delegation/SKILL.md) Return format) |
| **coding** | Implement against a fixed step contract | Step brief, allowed files, verify commands | Diff + how verified |
| **deep** | Architecture, ambiguous plan, cross-cutting design, hard tradeoffs | Constraints, options, non-goals | Plan / decision with rationale |
| **review** | Independent verify, security/scope audit, “did worker meet brief?” | Plan + diff + test output (not the implementer’s self-praise) | Pass/fail + gap list only |

### Decision table (signals → role)

| Signal | Prefer | Avoid |
|--------|--------|-------|
| Typo, rename, ≤2-file obvious fix | **fast** (single-shot; skip full loop) | deep / multi-agent |
| “Explore thoroughly”, unknown layout | **explore** then ORIENT→PLAN | coding before map |
| Implement with clear acceptance | **coding** | deep re-architecture mid-step |
| Vague large ask, system design | **deep** in PLAN (+ optional HITL) | coding immediately |
| Worker claimed done / PR review | **review** (fresh context) | same long context that implemented |
| Token-heavy prune / prompt craft | **fast** + [ai-optimization](../ai-optimization/SKILL.md) | stuffing full repos into deep |
| Synthesis / surplus / long-term structure | **deep** + [fusion-sage](../fusion-sage/SKILL.md) | pure speed path |
| Parallel independent slices | **coding** × N workers; parent stays **fast**/orchestrator | one model serial thrash |
| High-stakes (secrets, prod, CV promote) | **review** + HITL gate | unattended coding |

### Single-model hosts

If only one model is available: **simulate roles with phase prompts** (“You are REVIEWER: only gaps vs plan…”) and **reset context** for review (do not carry implementer rationalizations). Routing still prevents “one blob does everything poorly.”

### Handoff protocol

```text
Role A finishes → write compact handoff block:
  phase, step_id, status, artifacts[], verify_commands[], open_risks[]
Role B starts → read handoff + plan only; do not require full prior transcript
```

Parent (outer loop) **owns** phase transitions. Workers never silently jump PLAN→DONE.

---

## Human-in-the-loop (HITL) & pause gates

Pause when **any** of these fire — do not “push through”:

| Gate | Trigger | Resume |
|------|---------|--------|
| **Plan gate** | Vague/large/high-stakes plan | User approve / amend |
| **Review gate** | Security, external mutate, irreversible git, CV/live portfolio | Explicit confirm |
| **Budget gate** | max_* exhausted or cost/rate limit | User raises budget or cancels |
| **Confidence gate** | Low confidence / contradictory evidence | User decision or re-ORIENT |
| **Policy gate** | Secrets, destructive ops, push to shared remote | User confirm per project rules |
| **Blocker gate** | Missing credentials / permissions | User fixes env or CANCELLED |

**While paused:** state = HITL_*; no further EXECUTE side effects; Loop Card shows why + options (approve / amend / cancel).

Domain product guards (finder fit, CV promote, X rate) remain in those skills — this skill only requires that **autonomous loops honor pause results** as outer transitions.

---

## Composition (do not duplicate)

| Concern | Owner skill | Looper does |
|---------|-------------|-------------------|
| Triage single-shot vs full multi-worker | [agent-orchestrator](../agent-orchestrator/SKILL.md) | Wraps full/light work in outer phases; orchestrator briefs = PLAN/EXECUTE inputs |
| Readonly exploration Return format | [subagent-delegation](../subagent-delegation/SKILL.md) | Maps explore workers to **explore** role + inner steps |
| Worktrees / merge hygiene | [git-worktrees](../git-worktrees/SKILL.md) | INTEGRATE uses merge, not `cp` |
| Parallel agents | [concurrent-cli-agents](../concurrent-cli-agents/SKILL.md) | Independent steps only; parent re-entry |
| Token prune / compression | [ai-optimization](../ai-optimization/SKILL.md) | Prefer before deep/coding context fill |
| Synthesis + surplus | [fusion-sage](../fusion-sage/SKILL.md) | PLAN/INTEGRATE surplus; not loop control |
| Product autonomy (finder) | [finder-reactor](../finder-reactor/SKILL.md) / [agentic-reactor](../agentic-reactor/SKILL.md) | Loop **shape** only; domain states stay domain |
| BDD for decision tables | [bdd-strategizer](../bdd-strategizer/SKILL.md) | Optional when encoding guards in code |

**Rule:** `looper` = **control plane** (phase, budget, route, gate). Domain skills = **data plane**. Orchestrator = **multi-worker logistics**.

---

## Anti-patterns

| Anti-pattern | Do instead |
|--------------|------------|
| Unbounded ReAct until “feels done” | Outer phases + `max_loop_iters` + `done_when` |
| State only in chat rambling | Loop Card with phase + budgets |
| One model for plan, code, and self-review | Separate **review** pass / role (fresh) |
| Mega-step “implement everything” | DAG of small steps with verify |
| Retry same failed action forever | `no_progress` → re-PLAN or HITL |
| Nested agents without parent phase ownership | Parent owns transitions; workers return handoffs |
| Replacing orchestrator with this skill | Compose: orchestrate workers **inside** EXECUTE |
| Domain logic reimplemented here | Link finder/CV/X skills |
| Silent continue after budget exhaust | STOP + report |
| “Review” by the same context that wrote the bug | Independent review inputs (plan + diff + logs) |

---

## Loop Card (minimum viable control surface)

Copy [references/loop-card.md](references/loop-card.md) or paste:

```markdown
## Loop Card
- **goal:** …
- **phase:** ORIENT | PLAN | EXECUTE | VERIFY | REPAIR | REVIEW_GATE | INTEGRATE | HITL_* | DONE | …
- **plan (success criteria):** …
- **verify commands:** …
- **budgets:** max_loop_iters=8 remaining=_; max_repair_rounds=3 remaining=_; max_step_retries=2
- **steps (DAG):** S1 … / depends / done_when / role
- **model_role now:** fast | explore | coding | deep | review
- **last progress:** …
- **pause reason:** (none | …)
- **handoff:** artifacts / open_risks
```

Update the card on **every phase transition**. If you cannot name the phase, you are in unbounded ReAct — stop and ORIENT.

---

## Quick procedure (agent checklist)

```text
- [ ] 1. Triage (agent-orchestrator): single-shot? → do it and skip full loop
- [ ] 2. Open Loop Card; phase=ORIENT; set budgets
- [ ] 3. PLAN with success criteria + verify commands; HITL if high stakes
- [ ] 4. Route models/roles per matrix; write inner step DAG
- [ ] 5. EXECUTE bounded steps; handoffs only; no infinite micro-loops
- [ ] 6. VERIFY with real commands; REPAIR only gaps (budgeted)
- [ ] 7. REVIEW_GATE / HITL when required
- [ ] 8. INTEGRATE + report; surplus if fusion applies
- [ ] 9. DONE or narrow re-PLAN for remaining gap only
```

---

## Portable wiring

**Library canonical:** `~/Work/personal/skills/looper` (personal skills repo). This path is the **project-local vendor** for collab-finder.

### Cursor (this repo)

```bash
mkdir -p .cursor/skills
ln -sfn ../../.agents/skills/looper .cursor/skills/looper
# .cursor/rules → ../.agents/rules  (loads looper.mdc)
```

Rule file: [../../rules/looper.mdc](../../rules/looper.mdc) (`alwaysApply: false`).

### Grok Build / generic agents

- Index entry in root `AGENTS.md` + `.agents/README.md`.
- Activation phrases: “looper”, “structured loop”, “model routing”, “state machine agent loop”.

### Validation

```bash
node .agents/skills/looper/scripts/validate-skill.mjs   # project layout
# library: node looper/scripts/validate-skill.mjs  (from skills repo root)
```

---

## Reference

- **Design thesis (X):** [@Peramanathan](https://x.com/Peramanathan/status/2067890630345494578) — ReAct-style loops are powerful but brittle (implicit state, weak exit/retry, hard to audit); production agents wrap the creative loop in an outer state machine / cyclic graph + bounded inner DAGs, plans, review gates, and sub-agents. Keep the loop for adaptation; give it a deterministic skeleton. Thread: https://x.com/Peramanathan/status/2067890630345494578
- Design thesis (portable summary): structured loops (outer state machine + inner DAGs + gates) over raw ReAct — portable agent practice, not a vendor lock-in.
- Templates: [references/loop-card.md](references/loop-card.md)

**Build agents that loop with a skeleton — creativity inside the edges, never instead of them.**
