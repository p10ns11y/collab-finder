---
name: git-worktrees
description: >-
  Effective git worktree workflows for agents and humans: branches vs worktrees,
  safe commit-then-merge integration (never cp into main checkout), conflict
  handling, when to use or skip worktrees, macOS concurrency, and disk hygiene
  (local `.worktrees/` preferred; global `~/.grok/worktrees/` clones as fallback
  for extreme cases). In this repo, **local project `.worktrees/<tool>-<slug>/`
  (via native `git worktree add`) are the strong default preference** for easy
  IDE navigation, simple project-specific cleanup, and reduced global disk bloat.
  Use when creating worktrees, integrating agent task branches, or cleaning up
  after large orchestration runs.
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

**This repo:** paths under `.worktrees/<tool>-<slug>`, branches `agent/<tool>/<slug>`, create via native `git worktree add` or the helper [concurrent-cli-agents/scripts/agent-worktree-create.sh](../concurrent-cli-agents/scripts/agent-worktree-create.sh).

### Preference in this project (local `.worktrees/` default)

**Local project `.worktrees/` (e.g. `<project-root>/.worktrees/<tool>-<slug>/`) + native `git worktree add` are the strong default** for agent work in this codebase (including concurrent agents and execute-plan orchestration).

Reasons (user preference):
- Easy navigation and file lookup inside IDEs (Cursor, VSCode etc. see `.worktrees/` right in the project tree).
- Simpler cleanup (just `git worktree prune` + `rm -rf .worktrees/xxx` or the project scripts; no global state to manage).
- Less global disk bloat management.

Global full clones under `~/.grok/worktrees/` (Grok-managed, often independent clones with their own objects/Graphite/node_modules) are now **fallback only** for extreme cases: e.g. when local worktrees would cause unacceptable primary-clone bloat (massive `node_modules` duplication inside the shared tree), or when many concurrent adds risk index corruption on macOS despite staggering. Even then, prefer local where possible and always run hygiene.

Safety rules are unchanged: always commit in the worktree, integrate via merge/cherry-pick on the primary integration branch (never `cp` files), no direct source edits by agents in primary. The git-worktrees scripts (list/merge/remove) and concurrent create script target the local `.worktrees/` paths. The clean script handles both local and global orphans.

---

## When not to use worktrees

| Situation | Prefer |
|-----------|--------|
| Single task, one agent | One checkout + normal branching |
| Unrelated repositories | Separate clones |
| Code must never touch local disk | Cloud sandbox ([concurrent-cli-agents](../concurrent-cli-agents/SKILL.md) Step 3) |
| Every tree needs full `node_modules` and disk is tight | Serialize work on one tree, or one clone per task in `/tmp` |
| Large plans (execute-plan with 5–20+ PRs, best-of-n, heavy concurrent agents) | **Try local `.worktrees/` first** (via the concurrent-cli-agents create script or native `git worktree add`): cheaper, better IDE experience (`.worktrees/` visible in project tree), simpler project-scoped cleanup. Global full clones under `~/.grok/worktrees/` (Grok-managed independent clones) only as fallback when local would cause unacceptable bloat in the primary clone's disk (e.g. many duplicated heavy `node_modules`) or repeated index corruption on macOS despite `sleep` staggering between adds. **Always run hygiene** (`git worktree prune` + `agent-worktree-clean.sh`) after the plan regardless of local vs global. |
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
- [ ] 9. **After large plans or many subagents**: run `git worktree prune` + local scripts first (see "Grok CLI worktree management"); use `grok worktree gc` / `agent-worktree-clean.sh --prune` for any global orphans or preservation — see that section
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
| **[scripts/agent-worktree-clean.sh](scripts/agent-worktree-clean.sh)** | Preferred wrapper for large cleanups (handles both local native worktrees + any global `~/.grok/worktrees/` orphans). Uses `grok worktree list --json` + `grok worktree gc`/`rm` where relevant, plus automatic branch preservation before deletion, ghost directory cleanup, and a final `git worktree prune`. |

---

## Disk hygiene for Grok global worktrees (`~/.grok/worktrees/`)

> **Local `.worktrees/` inside the project are now the preferred default** for most agent work (including execute-plan, concurrent agents, etc.) in this codebase. They live at e.g. `.worktrees/<tool>-<slug>/`, are cheap, visible to your IDE, and cleaned with native `git worktree prune` + the local scripts (`agent-worktree-list.sh`, `agent-worktree-remove.sh`, etc.). Use the global Grok layer (`~/.grok/worktrees/`) only as fallback for the extreme cases noted in "When not to use worktrees" and "Preference in this project". The guidance below applies when global clones *are* in use.

**There are two different worktree mechanisms in this ecosystem:**

1. **Repo-local lightweight worktrees** (`.worktrees/<tool>-<slug>` inside your project) — created with `git worktree add`, tracked by Git, cheap to prune with the scripts above + `git worktree prune`.
2. **Global Grok-managed clones** under `~/.grok/worktrees/<repo-slug>/` (and subdirs like `subagent-...` or `qa-phase-one`). These are frequently **full independent clones** (each with its own `.git/` objects, Graphite state, `node_modules`, etc.). They are used by `execute-plan`, `best-of-n`, concurrent Grok subagents, and other orchestration (only when local is unsuitable).

The second category remains the **dominant source of disk bloat** when used. A single 8–10 PR execute-plan using full clones can still leave behind 2–6+ GB of abandoned clones.

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

**Important distinction (native local vs Grok global):**
- **Native Git worktrees (preferred default here):** lightweight checkouts inside the project at `.worktrees/<tool>-<slug>/` (or similar). Created with `git worktree add` (or the `agent-worktree-create.sh` helper in concurrent-cli-agents). Tracked only in the repo's `.git`. Inspect with `git worktree list`; clean with `git worktree prune` + `agent-worktree-remove.sh` / `agent-worktree-list.sh`. These are the strong recommendation for this project.
- **Grok global worktrees:** The Grok CLI maintains its **own registry and database** (separate from native Git) for the (usually full-clone) agent worktrees it creates. This is the source of truth for everything under `~/.grok/worktrees/`. **Database location**: `~/.grok/worktrees.db`. Use `grok worktree *` only for these.

`grok worktree list` shows the **global** Grok-managed worktrees (full clones for agents, when used).  
Native `git worktree list` only shows lightweight worktrees registered inside the current repository's `.git`.

### Core commands (for the global Grok layer)

| Command                              | What it does                                                                 | Most useful options |
|--------------------------------------|------------------------------------------------------------------------------|---------------------|
| `grok worktree list`                 | List everything Grok is currently tracking                                   | `--json`, `--all`, `--type subagent\|fork`, `--repo` |
| `grok worktree gc`                   | Garbage-collect **dead** records (the #1 command after crashes or manual `rm -rf`) | `--dry-run`, `--force` |
| `grok worktree rm <id>`              | Remove a specific tracked worktree (also deletes the on-disk directory)      | `--force`, `--dry-run` |
| `grok worktree show <id>`            | Details for one worktree                                                     | — |
| `grok worktree db stats`             | Show Alive / Dead / Total counts                                             | — |
| `grok worktree db path`              | Print the location of the DB                                                 | — |
| `grok worktree db rebuild`           | Rescan the filesystem and rebuild the registry                               | — |

### Typical post-plan hygiene flow (prioritize local)

After a large `execute-plan`, `best-of-n`, or heavy concurrent agent run — **start with local** (the common case now):

```bash
# 1. For native local worktrees (preferred/default path)
git worktree list
git worktree prune

# 2. (Optional but recommended) Use project scripts for list/remove of locals
.agents/skills/git-worktrees/scripts/agent-worktree-list.sh
.agents/skills/git-worktrees/scripts/agent-worktree-remove.sh --path .worktrees/<tool>-<slug> [--delete-branch]

# 3. For any global Grok-managed orphans that may still exist (fallback path)
grok worktree list --json
grok worktree gc --dry-run
grok worktree gc

# 4. For worktrees you want to delete *right now* (with branch preservation) — the clean script handles locals + globals + ghosts
.agents/skills/git-worktrees/scripts/agent-worktree-clean.sh --prune
```

The shell script (`agent-worktree-clean.sh`) exists to add two things the raw CLI does not provide:
- Automatic branch preservation (it fetches every branch from the worktree into `refs/orphans/grok-clean/...` in your primary repo before removal).
- Cleanup of "ghost" directories that exist on disk but are no longer present in Grok's database.
It also runs a final `git worktree prune` for the local layer.

### When to use what

- Just want the disk back after a normal plan using **local** worktrees → `git worktree prune` (often enough); the `agent-worktree-*` scripts in this dir for scripted control.
- Any global Grok clones were used → `grok worktree gc` (often enough for dead records).
- Need the commits that only lived in the agent worktrees (local or global) → use `agent-worktree-clean.sh --prune` (it does preservation + gc + ghost cleanup + final native prune).
- Something is badly desynced (directories gone but DB still has entries) → `grok worktree gc --force` or `grok worktree db rebuild`.
- You only care about native Git worktrees inside this checkout → `git worktree prune` + the `agent-worktree-list.sh` / `agent-worktree-remove.sh` scripts.

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
- Leaving full-clone orphans in `~/.grok/worktrees/` (or un-pruned local `.worktrees/`) after execute-plan / concurrent agents finish (multi-GB bloat possible when global clones are used for plans with 5+ PRs)

## Long-running execute-plan / multi-session considerations (hard-won)

When a plan spans many sessions and ends with a user-managed Graphite stack:

- The agent session lives in a `.grok` worktree; the user’s primary terminal (where they run authenticated `gt submit --stack`) is usually elsewhere. This creates persistent state and auth mismatches.
- Never reuse a plausible user feature branch name (e.g. `feature/xai-agentic-profile-qa-reactor`) for the final integration or stack branch. Collisions with the user’s pre-existing local branch of the same name are painful and common. Prefer `-stack`, plan-ID prefixes, or clearly artificial names.
- Plan for an explicit “handoff” phase at the end. The agent can produce the commits and a linear integration branch, but the final `gt submit --stack` (and any splitting into proper stack levels) is frequently done by the user in their main authenticated shell.
- After pushing the final stack branch from the worktree, explicitly tell the user to fetch in their normal clone and work from there for the gt steps.
- The individual `execute-plan/<plan-id>-pr-N-*` branches are valuable artifacts. Preserve clear references to them so the user can later choose between `gt split --by-commit` on the linear result vs. manually assembling true multi-level stacks from the per-PR branches.
- **Disk cleanup is mandatory after the plan.** With the local `.worktrees/` preference, many (or all) subagent worktrees now live inside the project at `.worktrees/<tool>-<slug>/` — easier to inspect directly in your IDE, `git worktree list` (or the local `agent-worktree-list.sh`) often suffices, and there is less reliance on `grok worktree *` commands. Global `~/.grok/worktrees/` full clones are fallback-only. Start with local-native commands:
  ```bash
  git worktree list
  git worktree prune
  .agents/skills/git-worktrees/scripts/agent-worktree-list.sh
  ```
  Then (to cover any global orphans, ghosts, or branch preservation):
  ```bash
  .agents/skills/git-worktrees/scripts/agent-worktree-clean.sh --prune
  ```
  (The clean script runs a final `git worktree prune` and handles both layers.) See the "Grok CLI worktree management" section for the full picture.

See `docs/agent-workflow-lessons.md` for the full set of patterns observed during an 8-PR execute-plan + gt stack effort.

---

## Related

- [concurrent-cli-agents](../concurrent-cli-agents/SKILL.md) — multi-agent tools, cloud sandboxes
- [split-to-prs](../split-to-prs/SKILL.md) — slice merges into reviewable PRs
- Hermes: `hermes -w` — https://hermes-agent.nousresearch.com/docs/user-guide/git-worktrees
