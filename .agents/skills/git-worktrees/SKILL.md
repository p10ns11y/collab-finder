---
name: git-worktrees
description: >-
  Effective git worktree workflows for agents and humans: branches vs worktrees,
  safe commit-then-merge integration (never cp into main checkout), conflict
  handling, when to use or skip worktrees, macOS concurrency, and disk hygiene
  for global ~/.grok/worktrees/ clones. Use when creating worktrees, integrating
  agent task branches, or cleaning up after large orchestration runs.
---

# git-worktrees

> **Load rule:** Formal SoT. Disk/Grok CLI detail → [references/disk-hygiene.md](references/disk-hygiene.md) only if needed.  
> **CLT:** [../rules/clt-dual-load.mdc](../rules/clt-dual-load.mdc) — one agent per worktree enables safe fan-out (asymmetric parallel); never merge via `cp`.

```text
// Signature
branch  ≔ *what* (line of commits)
worktree ≔ *where* (extra checkout on same .git)

// Axioms
A1  Integrate = commit in WT → merge/cherry-pick on integration  — never cp/rsync
A2  One agent ⇔ one worktree directory
A3  Remove WT only after merge + verify (or explicit abandon)
A4  Concurrent add on macOS: stagger (sleep ~1s) to avoid index SIGBUS
A5  Two layers: repo-local .worktrees/  vs  global ~/.grok/worktrees/ full clones
A6  After large plans: hygiene mandatory (see disk-hygiene)
```

Pair: [concurrent-cli-agents](../concurrent-cli-agents/SKILL.md) · [agent-orchestrator](../agent-orchestrator/SKILL.md) · [split-to-prs](../split-to-prs/SKILL.md).

---

## Use / skip

| Use when | Prefer instead when |
|----------|---------------------|
| ≥2 tasks same repo concurrent | single task → one checkout |
| long feature + main for hotfixes | unrelated repos → separate clones |
| side-by-side run/compare | never touch disk → cloud sandbox |
| agent isolation | same few files always → serialize (WT ≠ less conflict) |
| | disk tight + heavy node_modules → serialize or `/tmp` clones |

**This library convention:** `.worktrees/<tool>-<slug>` · branch `agent/<tool>/<slug>` · create via concurrent-cli-agents script when present.

---

## Safe integration

```text
1. Agent only inside its WT path
2. Validate in that WT
3. git commit on agent/<tool>/<slug>
4. Orch on primary: integration branch checked out
5. Merge one branch at a time → resolve on primary → re-validate
6. Remove WT after success
```

```bash
# merge agent branch onto current (primary)
<path>/git-worktrees/scripts/agent-worktree-merge.sh --branch agent/cursor/<slug>
```

Merge order: docs/low-churn first, then code.

### Why never `cp`

| Risk | Failure |
|------|---------|
| last writer wins | silent drop of other task |
| stale copy | half-finished files |
| lost work | uncommitted + force-remove |
| no audit | no per-task commits/PRs |

If linear history without merge commits: still **commit in each WT**, then `cherry-pick`.

---

## Coordinator checklist

```text
[ ] create WT+branch per task (stagger on macOS)
[ ] disjoint files in prompts
[ ] agent commits before "done"
[ ] git worktree list ↔ branch
[ ] merge one-by-one on primary
[ ] conflicts only on primary
[ ] validate integration
[ ] remove WT; optional branch -d
[ ] large plans → disk hygiene
```

---

## Scripts

| Script | Purpose |
|--------|---------|
| concurrent-cli-agents `agent-worktree-create.sh` | new WT + branch |
| `scripts/agent-worktree-list.sh` | list |
| `scripts/agent-worktree-merge.sh` | merge one agent branch |
| `scripts/agent-worktree-remove.sh` | remove after merge |
| `scripts/agent-worktree-clean.sh` | Grok global cleanup + branch preserve |

---

## Conflicts

Primary checkout only · fix · `git add` · `merge --continue` · re-validate.  
Heavy conflict → abort, rebase smaller task onto merged result.

---

## Anti-patterns

| ¬ | Do |
|---|-----|
| `cp`/rsync integrate | merge/cherry-pick |
| commit integration while agents still edit same files | serialize or disjoint |
| `worktree remove --force` pre-merge | merge first |
| two agents one WT dir | one WT each |
| WT without commits | branch+commit |
| delete agent/* before on target | merge first |
| leave `~/.grok/worktrees/` orphans | gc / clean.sh |

**Stack/handoff naming:** see [agent-orchestrator](../agent-orchestrator/SKILL.md) + [gt-flow](../gt-flow/SKILL.md); artificial final branch names.

**Done when:** agent commits on their branch; integration via merge; hygiene run after multi-WT plans.

Disk/Grok CLI: [references/disk-hygiene.md](references/disk-hygiene.md).
