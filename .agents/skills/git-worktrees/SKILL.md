---
name: git-worktrees
description: >-
  Effective git worktree workflows for agents and humans: branches vs worktrees,
  safe commit-then-merge integration (never cp into main checkout), conflict
  handling, when to use or skip worktrees, macOS concurrency, and **disk hygiene
  for the global `~/.grok/worktrees/` clones** that execute-plan and subagents
  leave behind. Use when creating worktrees, integrating agent task branches,
  or cleaning up after large orchestration runs.
---

# Git worktrees (effective use)

Git **branches** name a line of commits. **Worktrees** are extra working directories on the **same** repository, each with its own checkout, index, and usually its own branch.

Pair with [concurrent-cli-agents](../concurrent-cli-agents/SKILL.md) for Hermes/OpenClaw/Grok/Cursor orchestration and cloud sandboxes.

---

## Branches vs worktrees

| | Branch | Worktree |
|---|--------|----------|
| **Answers** | Which commits am I extending? | Where on disk am I editing? |
| **Concurrent checkouts** | Only one per repo folder without worktrees | One per worktree path |
| **Cost** | Metadata only | Extra disk (`node_modules`, build artifacts per tree) |
| **Shared** | All branches share one `.git` object store | Same — one repo, many folders |

```text
repo/.git  (single object database)
├── /workspaces/myproject              → branch: main (or feature/x)
└── /workspaces/myproject/.worktrees/agent-a  → branch: agent/cursor/task-a
```

**Mental model:** branch = *what*; worktree = *where*. Concurrent agents need **both** — not multiple branch names in one folder.

---

## When to use worktrees

- **Two or more tasks** on the same repo at once (agents, terminals, IDE windows).
- **Long-running feature** while keeping the main checkout on `main` / release branch for hotfixes.
- **Compare or run** two branches side by side (different ports, different `pnpm dev`).
- **Agent isolation** — each agent gets its own directory; no `git switch` / stash churn.

**This repo:** paths under `.worktrees/<tool>-<slug>`, branches `agent/<tool>/<slug>`, create via [concurrent-cli-agents/scripts/agent-worktree-create.sh](../concurrent-cli-agents/scripts/agent-worktree-create.sh).

---

## When not to use worktrees

| Situation | Prefer |
|-----------|--------|
| Single task, one agent | One checkout + normal branching |
| Unrelated repositories | Separate clones |
| Code must never touch local disk | Cloud sandbox ([concurrent-cli-agents](../concurrent-cli-agents/SKILL.md) Step 3) |
| Every tree needs full `node_modules` and disk is tight | Serialize work on one tree, or one clone per task in `/tmp` |
| Large plans (execute-plan with 5–20+ PRs, best-of-n, heavy concurrent agents) | Each subagent often gets a **full clone** (not a lightweight worktree) under `~/.grok/worktrees/`. One 8-PR plan can easily leave 3–8 GB of orphaned clones with `node_modules`. **Always run hygiene after the plan.** |
| Tasks always touch the same few files | One agent or ordered waves — worktrees do not remove merge conflicts |

---

## Safe integration (required)

### Do: commit in worktree → merge on integration branch

1. Agent works **only** inside its worktree path.
2. Agent runs validation (`pnpm type-check`, `pnpm lint`, …) **in that worktree**.
3. Agent **`git commit`** on `agent/<tool>/<slug>` (never leave work only uncommitted).
4. Coordinator checks out **integration branch** (e.g. `feat/foo` or `main`) in the **primary** worktree only.
5. Coordinator merges **one branch at a time**, resolves conflicts in Git, runs validation again.
6. Remove worktree **after** merge succeeds.

```bash
# From repo root — merge agent branches onto current branch (already checked out)
.agents/skills/git-worktrees/scripts/agent-worktree-merge.sh \
  --branch agent/cursor/react-roadmap-doc
.agents/skills/git-worktrees/scripts/agent-worktree-merge.sh \
  --branch agent/cursor/document-viewer-dynamic
```

Merge **docs / low-churn first**, then code, when you control order.

### Do not: `cp` or manual write into the main checkout

**Never** integrate agent output by copying files from `.worktrees/…` into the primary checkout.

| Risk | What goes wrong |
|------|------------------|
| Last writer wins | Two tasks touch `AGENTS.md` — later `cp` silently drops the other task |
| Stale copy | Copy while agent still editing — main gets half-finished files |
| Lost work | Agent never committed; worktree removed with `--force` — only copied bytes survive |
| No audit trail | Cannot see per-task commits or use PRs from agent branches |
| False “merge” | Commits on integration branch do not match what was validated in worktrees |

A smoke test that used copy-then-commit “worked” only because tasks touched **disjoint paths** and integration was **sequential**. That pattern is **not** safe for concurrent finish times or overlapping files.

**If both tasks must land on one branch without merge commits:** still **commit in each worktree**, then `git cherry-pick` each commit onto the integration branch — not `cp`.

---

## Coordinator checklist

```
- [ ] 1. Create worktree + branch (one per task); stagger adds on macOS (sleep 1s)
- [ ] 2. Assign disjoint files where possible (document ownership in task prompt)
- [ ] 3. Agent commits on agent/<tool>/<slug> before calling task done
- [ ] 4. git worktree list — verify branch ↔ path
- [ ] 5. Merge branches one-by-one on integration checkout (script or git merge)
- [ ] 6. Resolve conflicts in primary worktree only — not inside agent worktrees
- [ ] 7. Validate integration branch (type-check, lint)
- [ ] 8. git worktree remove + optional git branch -d after merge
- [ ] 9. **After large plans or many subagents**: run `grok worktree gc` (and `agent-worktree-clean.sh --prune` when branch preservation is needed) — see "Grok CLI worktree management" section
```

---

## Git concurrency (macOS)

Rapid `git worktree add` on the same repo can corrupt the index (`SIGBUS` on some setups).

- **Stagger** creation: `sleep 1` between adds.
- **Serialize** integration merges on one machine.
- Fallback: full clone in `/tmp/agent-<id>` (more disk, no shared index).

---

## Optimizations

| Practice | Why |
|----------|-----|
| **Disjoint file ownership** per task | Fewer merge conflicts, faster integration |
| **Merge order** — docs/config before code | Smaller conflict surface in TS/TSX |
| **`.worktreeinclude`** (Hermes-style) | Copy `.env`, `.env.local` into worktree once at create — not for integrating code |
| **One `pnpm install` per worktree** | Each tree needs its own `node_modules`; do not share via symlink unless you know the toolchain |
| **PR per agent branch** | Skip local merge; review on GitHub — same commit safety, better audit |
| **`git worktree list` / `agent-worktree-list.sh`** | See active paths before remove |
| **Do not remove worktree until merge landed** | Uncommitted or unmerged work is lost on `--force` remove |

---

## Scripts (this repo)

| Script | Purpose |
|--------|---------|
| [concurrent-cli-agents/.../agent-worktree-create.sh](../concurrent-cli-agents/scripts/agent-worktree-create.sh) | New `.worktrees/<tool>-<slug>` + `agent/<tool>/<slug>` |
| [scripts/agent-worktree-list.sh](scripts/agent-worktree-list.sh) | List worktrees and branches |
| [scripts/agent-worktree-merge.sh](scripts/agent-worktree-merge.sh) | Merge one agent branch into current branch |
| [scripts/agent-worktree-remove.sh](scripts/agent-worktree-remove.sh) | Remove worktree after merge (optional branch delete) |
| **[scripts/agent-worktree-clean.sh](scripts/agent-worktree-clean.sh)** | Preferred wrapper for large cleanups. Uses `grok worktree list --json` + `grok worktree gc`/`rm` as the primary path, plus automatic branch preservation before deletion and ghost directory cleanup. |

---

## Disk hygiene for Grok global worktrees (`~/.grok/worktrees/`)

**There are two different worktree mechanisms in this ecosystem:**

1. **Repo-local lightweight worktrees** (`.worktrees/<tool>-<slug>` inside your project) — created with `git worktree add`, tracked by Git, cheap to prune with the scripts above + `git worktree prune`.
2. **Global Grok-managed clones** under `~/.grok/worktrees/<repo-slug>/` (and subdirs like `subagent-...` or `qa-phase-one`). These are frequently **full independent clones** (each with its own `.git/` objects, Graphite state, `node_modules`, etc.). They are used by `execute-plan`, `best-of-n`, concurrent Grok subagents, and other orchestration for strong isolation + Graphite compatibility.

The second category is the **dominant source of disk bloat**. A single 8–10 PR execute-plan commonly leaves behind 2–6+ GB of abandoned clones.

### Why they accumulate

- `grok worktree rm` (used by execute-plan Step 9) only removes entries the current Grok session still tracks.
- Crashed/interrupted plans, manual side sessions, and certain Graphite flows leave untracked full clones.
- Each subagent clone often runs `pnpm install`, ballooning to 800 MB–1.5 GB.

### Recommended hygiene workflow

After any significant agent orchestration (especially `execute-plan` with 4+ PRs, or `best-of-n`):

```bash
# From repo root — dry run first (always safe)
.agents/skills/git-worktrees/scripts/agent-worktree-clean.sh

# Real cleanup (preserves any branches that only lived in the orphans)
.agents/skills/git-worktrees/scripts/agent-worktree-clean.sh --prune
```

The script now uses `grok worktree list --json` + `grok worktree gc` / `rm` as the primary mechanism (much more reliable than raw filesystem walking). It still adds the critical branch-preservation step that the raw CLI does not provide.

See the new **"Grok CLI worktree management (`grok worktree *`)"** section below for the full command reference and recommended flows.

Run it periodically even without a plan — the directory is global and shared across all your work.

After a very large cleanup you can optionally compact objects in the primary repo:

```bash
git gc --prune=now --aggressive
```

See also `docs/agent-workflow-lessons.md` (lesson 1) which documents the fundamental split between agent `.grok` sessions and the user's primary authenticated terminal.

---

## Grok CLI worktree management (`grok worktree *`)

The Grok CLI maintains its **own registry and database** for the agent worktrees it creates (separate from native Git worktrees). This is the source of truth for everything under `~/.grok/worktrees/`.

**Database location**: `~/.grok/worktrees.db`

### Core commands

| Command                              | What it does                                                                 | Most useful options |
|--------------------------------------|------------------------------------------------------------------------------|---------------------|
| `grok worktree list`                 | List everything Grok is currently tracking                                   | `--json`, `--all`, `--type subagent\|fork`, `--repo` |
| `grok worktree gc`                   | Garbage-collect **dead** records (the #1 command after crashes or manual `rm -rf`) | `--dry-run`, `--force` |
| `grok worktree rm <id>`              | Remove a specific tracked worktree (also deletes the on-disk directory)      | `--force`, `--dry-run` |
| `grok worktree show <id>`            | Details for one worktree                                                     | — |
| `grok worktree db stats`             | Show Alive / Dead / Total counts                                             | — |
| `grok worktree db path`              | Print the location of the DB                                                 | — |
| `grok worktree db rebuild`           | Rescan the filesystem and rebuild the registry                               | — |

**Important distinction**:
- `grok worktree list` shows the **global** Grok-managed worktrees (full clones for agents).
- Native `git worktree list` only shows lightweight worktrees registered inside the current repository's `.git`.

### Typical post-plan hygiene flow

After a large `execute-plan`, `best-of-n`, or heavy concurrent agent run:

```bash
# 1. See exactly what Grok thinks it still owns (authoritative)
grok worktree list --json

# 2. Preview what the garbage collector would remove
grok worktree gc --dry-run

# 3. Do the safe, official cleanup (removes dead DB records instantly)
grok worktree gc

# 4. For worktrees you want to delete *right now* (with branch preservation)
.agents/skills/git-worktrees/scripts/agent-worktree-clean.sh --prune
```

The shell script (`agent-worktree-clean.sh`) exists to add two things the raw CLI does not provide:
- Automatic branch preservation (it fetches every branch from the worktree into `refs/orphans/grok-clean/...` in your primary repo before removal).
- Cleanup of "ghost" directories that exist on disk but are no longer present in Grok's database.

### When to use what

- Just want the disk back after a normal plan → `grok worktree gc` (often enough).
- Need the commits that only lived in the agent worktrees → use `agent-worktree-clean.sh --prune` (it does preservation + gc + ghost cleanup).
- Something is badly desynced (directories gone but DB still has entries) → `grok worktree gc --force` or `grok worktree db rebuild`.
- You only care about native Git worktrees inside this checkout → `git worktree prune` + the `agent-worktree-remove.sh` script.

---

## Conflict handling

When `git merge agent/...` stops:

1. Work in the **primary** checkout (integration branch checked out).
2. Fix conflicted files; `git add` each resolved path.
3. `git merge --continue` (or complete merge commit).
4. Re-run project validation.
5. Do **not** copy conflict markers from one worktree to another.

If two agent branches conflict heavily, **abort** one merge, rebase or redo the smaller task on top of the merged result, then merge again.

---

## Anti-patterns

- `cp`, `rsync`, or editor “save to parent repo” from `.worktrees/` for integration
- Committing on integration branch while agents still run in worktrees on the same files
- `git worktree remove --force` before merge + validation
- Two agents in **one** worktree directory
- Using worktrees without committing (worktrees are not a substitute for branches/commits)
- Deleting `agent/*` branches before their commits are on `main` / target branch
- Leaving full-clone orphans in `~/.grok/worktrees/` after execute-plan / concurrent agents finish (multi-GB bloat is the normal outcome for plans with 5+ PRs)

## Long-running execute-plan / multi-session considerations (hard-won)

When a plan spans many sessions and ends with a user-managed Graphite stack:

- The agent session lives in a `.grok` worktree; the user’s primary terminal (where they run authenticated `gt submit --stack`) is usually elsewhere. This creates persistent state and auth mismatches.
- Never reuse a plausible user feature branch name (e.g. `feature/xai-agentic-profile-qa-reactor`) for the final integration or stack branch. Collisions with the user’s pre-existing local branch of the same name are painful and common. Prefer `-stack`, plan-ID prefixes, or clearly artificial names.
- Plan for an explicit “handoff” phase at the end. The agent can produce the commits and a linear integration branch, but the final `gt submit --stack` (and any splitting into proper stack levels) is frequently done by the user in their main authenticated shell.
- After pushing the final stack branch from the worktree, explicitly tell the user to fetch in their normal clone and work from there for the gt steps.
- The individual `execute-plan/<plan-id>-pr-N-*` branches are valuable artifacts. Preserve clear references to them so the user can later choose between `gt split --by-commit` on the linear result vs. manually assembling true multi-level stacks from the per-PR branches.
- **Disk cleanup is mandatory after the plan.** The subagent worktrees live under the Grok-managed layer (`~/.grok/worktrees/`). Start with the official commands:
  ```bash
  grok worktree list
  grok worktree gc --dry-run && grok worktree gc
  ```
  Then (if you need branch preservation or have ghost directories):
  ```bash
  .agents/skills/git-worktrees/scripts/agent-worktree-clean.sh --prune
  ```
  See the "Grok CLI worktree management" section for the full picture.

See `docs/agent-workflow-lessons.md` for the full set of patterns observed during an 8-PR execute-plan + gt stack effort.

---

## Related

- [concurrent-cli-agents](../concurrent-cli-agents/SKILL.md) — multi-agent tools, cloud sandboxes
- [split-to-prs](../split-to-prs/SKILL.md) — slice merges into reviewable PRs
- Hermes: `hermes -w` — https://hermes-agent.nousresearch.com/docs/user-guide/git-worktrees
