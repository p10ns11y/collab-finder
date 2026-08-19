---
name: agent-orchestrator
description: >-
  Triage every non-trivial task first: single-shot when safe, full orchestration when
  multi-step, multi-agent, or high-risk. Covers briefs, verification before "done",
  iterative waves, and resume. Use when coordinating workers, delegating, or reviewing
  agent output — not for one-file typo fixes.
---

# agent-orchestrator

> **Load rule:** Formal SoT below. Expand [references/english-procedure.md](references/english-procedure.md) **only if** a phase or handoff is still ambiguous.  
> **CLT:** on-the-fly pre-filter [../rules/clt-dual-load.mdc](../rules/clt-dual-load.mdc) (A8 DualLoad) — expand [../control-graph/references/clt-load-balance.md](../control-graph/references/clt-load-balance.md) only if human/agent load tradeoff is ambiguous.

```text
// Signature
Orch ≔ coordinator   // you
W    ≔ workers        // one brief, one workspace, one DoD each
Triage ∈ { single_shot, light, full }
Wave  ∈ { spike, foundation, feature, hygiene }

// Axioms
A1  Workers never self-verify as final truth — Orch re-runs verify cmds
A2  Brief before delegate; commit in workspace before "done"
A3  Merge ≻ cp   // integration via git only ([git-worktrees](../git-worktrees/SKILL.md))
A4  Spike hard/unknown BEFORE mega-feature brief
A5  Resume = gap-only brief  — never re-delegate full original scope
A6  Compose control shape with [control-graph](../control-graph/SKILL.md); this skill = multi-worker logistics
```

Pair: [git-worktrees](../git-worktrees/SKILL.md) · [concurrent-cli-agents](../concurrent-cli-agents/SKILL.md) · [split-to-prs](../split-to-prs/SKILL.md) · domain skills per worker.

---

## Triage (~10s)

| Mode | When | Do |
|------|------|-----|
| **single_shot** | 1 clear change · ≤1–2 files · low risk · obvious verify · no concurrent W | edit + verify; skip brief/worktree |
| **light** | plan/review only · 3–5 files same concern · tiny resume gap · fast disprove | 3–5 bullets then implement in one checkout |
| **full** | multi W/worktrees · unknown hard part · large/vague · high stakes · prior agent "done" · resume after days | checklist + briefs + verify + integrate |

```text
request → triage → single_shot | light | full
escalate: single_shot grows past ~2 files / new unknowns → stop → light|full
```

---

## Full path (graph)

```text
ORIENT → DECOMPOSE → SPIKE? → BRIEF → DELEGATE → VERIFY ⇄ fix-brief → INTEGRATE → REPORT
```

| Phase | Exit when |
|-------|-----------|
| ORIENT | 1-sentence goal · base ref · constraints · unknowns · risk |
| DECOMPOSE | waves with **disjoint** ownership where possible |
| SPIKE | risky unknown proved or rejected (≤1–2 files / readonly + rec) |
| BRIEF | [templates/task-brief.md](templates/task-brief.md) complete |
| DELEGATE | one prompt/W; workspace recorded |
| VERIFY | Orch ran **every** verify cmd; scope matches brief |
| INTEGRATE | merge one branch at a time; re-verify; no `cp` |
| REPORT | summary to user |

### Roles

| Role | Owns |
|------|------|
| **Orch** | spec, sequence, verify, merge order, user updates |
| **Worker** | implement in one worktree; commit on `agent/<tool>/<slug>` |
| **User** | scope splits, merge/PR, destructive git |

Orch may implement only if trivial or verify failed twice and inline fix is faster — say so.

---

## Brief minimum

1. Problem · 2. Outcome (observable) · 3. Non-goals · 4. Standards (skills)  
5. Files may/must-not · 6. **Verify cmds** (exact) · 7. Workspace · 8. Done artifact (commit)

Worker handback: SHA · cmds+exit · 2-sentence approach · limits.

---

## Verify (Orch-owned)

| Check | Action |
|-------|--------|
| Scope | `git diff base...agent` ⊆ allowed |
| Claims | summary matches diff |
| Automated | re-run every brief command |
| Regression | imports/types/exports |
| Standards | spot-check cited skills |

**Fail** → fix brief (gap only), same workspace if possible. **Never merge on testimony alone.**

---

## Resume

```text
read last brief → git log/diff/worktree list → remaining gap (1¶) → "Resume: …" brief only
```

---

## Defaults (override from target `AGENTS.md`)

- Frozen lockfile when deps change  
- `type-check` + `lint`  
- React → [react-client-expert](../react-client-expert/SKILL.md)  
- Deps → [fix-dependency-security](../fix-dependency-security/SKILL.md)  
- Minimal diff  

---

## Anti-patterns

| ¬ | Do |
|---|-----|
| vague brief | observable outcome + verify cmds |
| skip spike on unknown integration | spike first |
| accept "done" without re-run | Orch verifies |
| `cp` from worktree | merge / cherry-pick |
| mega-prompt unrelated files | disjoint briefs |
| re-delegate full scope on resume | gap-only |
| Orch implements + "verifies" same large feature | separate review |
| natural feature name for final stack branch | artificial/`-stack`/plan-id (collision risk) |

---

## Stack handoff (execute-plan / Graphite)

```text
Agent session often ≠ user's authenticated gt shell
→ leave: pushed linear branch + per-PR branch SHAs + fetch/submit instructions
→ confirm final branch name with user; never steal plausible feature/* names
```

Detail: [references/english-procedure.md](references/english-procedure.md#stack-handoff).

---

## Report template

```markdown
## Orchestrator summary
**Goal:** …
**Workers:** tool/branch → pass/fail
### Verified — commands + exit
### Integrated — merges
### Leftovers / next wave
```

**Done when:** triage mode chosen; if full — verify cmds passed on integration; user has report + leftovers.
