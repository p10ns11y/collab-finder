# agent-orchestrator — English expansion

Load **only if** [../SKILL.md](../SKILL.md) formal tables leave a step ambiguous.

## Human first-principles map

| Phase | Humans | Orchestrator |
|-------|--------|--------------|
| Orient | ticket, status, recent commits | branch, diff, intent, unknowns |
| Decompose | hard vs mechanical | spike vs implement waves |
| Spike | prove risky API/repro | time-boxed brief + learnings |
| Implement | fill known patterns | full brief after risk low |
| Verify | run checks, read diff | re-run cmds; compare to spec |
| Integrate | merge, PR | [git-worktrees](../../git-worktrees/SKILL.md) |
| Resume | where was I? | gap-only brief |

## Slice types

| Type | When | Scope |
|------|------|-------|
| Spike | unknown root cause / library / arch | ≤1–2 files or readonly + recommendation |
| Foundation | shared types/utils others need | merge before dependents |
| Feature | clear acceptance | full brief + verify |
| Hygiene | docs, lint, rename | separate; never mix with risky spike |

Concurrent workers only if **independent** paths ([concurrent-cli-agents](../../concurrent-cli-agents/SKILL.md)).

## Checklist narrative

1. Orient — branch, diff, goal, blockers, skills  
2. Decompose — waves; disjoint ownership  
3. Task brief from template  
4. Workspace (worktree/sandbox) recorded in brief  
5. After multi-worker plans: `git-worktrees/scripts/agent-worktree-clean.sh`  
6. Delegate — full brief; AGENTS.md + domain skills  
7. On claim done — Orch verifies  
8. Pass → merge order; fail → narrow fix brief  
9. Report  

## Delegate rules

- One prompt per worker with full brief  
- Non-interactive commands preferred  
- Worker does not merge to integration unless brief says so  
- Commit before claiming done  

## Stack handoff

Multi-session plans → many reviewed PRs → user-managed Graphite stack:

1. **Naming:** avoid plausible user feature branch names for final integration. Prefer `-stack`, `ep/<id>-…`, or artificial names. Confirm with user.  
2. **Env:** agent often in `.grok` worktree; user's `gt` auth lives in primary terminal.  
3. **Leave the user:** clean pushed linear branch; list of `execute-plan/...-pr-N-*` SHAs; instructions to fetch then `gt submit --stack` or `gt split --by-commit`.  
4. Pair with [gt-flow](../../gt-flow/SKILL.md).  

## Verify fail path

Write a **fix brief** with only the gap (e.g. "lint line 42", "missing Suspense"). Same workspace when possible. Do not re-run the whole feature from scratch.
