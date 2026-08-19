# git-worktrees — disk hygiene & Grok CLI

Load **only if** cleaning `~/.grok/worktrees/` or using `grok worktree *`.

## Two layers

1. **Repo-local** `.worktrees/<tool>-<slug>` — `git worktree add`, cheap prune  
2. **Global Grok clones** `~/.grok/worktrees/` — often **full clones** (execute-plan, best-of-n); dominant bloat  

DB: `~/.grok/worktrees.db`

## Why bloat

- `grok worktree rm` only removes session-tracked entries  
- Crashes leave untracked full clones  
- Each subagent often runs `pnpm install` (0.8–1.5 GB)  

## Hygiene flow

```bash
# dry run
<path>/git-worktrees/scripts/agent-worktree-clean.sh

# real cleanup + branch preservation
<path>/git-worktrees/scripts/agent-worktree-clean.sh --prune

# official Grok GC
grok worktree list --json
grok worktree gc --dry-run && grok worktree gc
```

Optional after huge cleanup: `git gc --prune=now` in primary repo.

## Grok CLI

| Command | Use |
|---------|-----|
| `grok worktree list` | tracked global WTs (`--json`, `--all`) |
| `grok worktree gc` | dead records (#1 after crashes) |
| `grok worktree rm <id>` | remove one |
| `grok worktree db stats\|path\|rebuild` | registry health |

`git worktree list` ≠ Grok global list.

## When which tool

| Need | Tool |
|------|------|
| disk after normal plan | `grok worktree gc` |
| preserve branches only in orphans | `agent-worktree-clean.sh --prune` |
| DB desync | `gc --force` or `db rebuild` |
| only local git WTs | `git worktree prune` + remove.sh |

## Optimizations

Disjoint ownership · merge docs before code · `.worktreeinclude` for env only · one `pnpm install` per WT · PR per agent branch · don't remove until merged.
