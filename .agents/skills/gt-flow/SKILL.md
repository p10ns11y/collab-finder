---
name: gt-flow
description: >
  Most sensible Graphite (gt) stacking decision and execution flow. Diagnoses coupling (overlapping file touches across planned slices), honestly recommends "gt is overkill here — use plain branches / split-to-prs / sequential waves / one PR" when gt would add complexity or risk (especially with coupled core files or agent worktree generation). When gt is chosen or the safe path is taken, enforces commit-in-generation-env + explicit two-phase handoff + backup refs + per-slice escape branches + state so generated code is never lost and recovery is trivial. Use on any gt/graphite/stack/submit --stack decision, execute-plan assembly, concurrent agent work, or manual PR planning.
---

# gt-flow — Sensible Graphite stacking with honest "overkill" guard and zero-lost-code contract

**Graphite (`gt`) and Git worktrees are not mutually exclusive.** They are compatible (Graphite has provided explicit support since v1.8.4+), but they are **not seamless** in all cases. This skill gives you the precise mental model, official guardrails, decision criteria (including coupling), and safe execution patterns so you get the benefits of both without losing code or creating unrecoverable state.

This skill is the single source of truth for "should we use `gt` here, and exactly how (single worktree, multiple worktrees, or hybrid), so nothing gets lost".

It combines official Graphite guidance (learn-to-stack, how-to-structure-your-stacks, ai-ingestion/llms, comparing-git-and-gt, multiple-worktrees, create-stack, squash-fold-split, and the worktree support notes) with the hard-won realities of agentic execution in this repo (execute-plan dual-mode, git-worktrees, split-to-prs, worktree handoff between agent sessions and primary authenticated shell, and frequent concurrent agent lanes).

## Quick Mental Model (gt vs worktrees vs plain git)

| Tool            | What it solves                              | Working directory model     | Branch relationship tracking      |
|-----------------|---------------------------------------------|-----------------------------|-----------------------------------|
| **Plain Git**   | Basic branching + history                   | Usually 1 working tree      | None (you track it mentally)      |
| **Graphite (`gt`)** | Stacked/dependent PRs + automated restacking + nice stack UX | Designed for 1 tree (strong support for many since 1.8.4+) | Explicit "stack" graph (parent/child) |
| **Git worktrees** | Multiple physical checkouts from one `.git` (isolation, parallel processes, no heavy switch cost) | Many working trees          | None (Git doesn't track stacks)   |

**Graphite** adds the stack graph + cross-stack commands (`gt sync` + restack, `gt modify`, `gt submit --stack`, etc.).  
**Worktrees** give physical isolation (separate dirs, separate `node_modules`/build state/IDE/dev servers) while sharing the object store.  
They compose well when you follow the guardrails below. Graphite will actively protect you from mutating a branch checked out in another worktree.

## Core decision procedure (always run this first)

1. **Get the change intent / plan**
   - If from a design doc or `/execute-plan` or `/implement` or chat: extract the intended PR slices (titles + "Files/components affected").
   - If raw diff or uncommitted work: run `git status --porcelain` + `git diff --name-only` (and staged) to list touched paths.

2. **Diagnose coupling / overlap**
   - Build the set of files per intended slice.
   - Compute overlap: files that appear in 2+ slices.
   - Flag "core files": anything under `src-tauri/src/` (especially lib.rs, commands, secrets.rs, app_dirs.rs), central React components/state, shared types, AGENTS.md, .agents/ rules or skills, prompt files that multiple slices would edit, build configs.
   - Score:
     - High coupling: heavy overlap on core files, or >40% of slices touch the same 1-3 files.
     - Medium: some shared surface but clear boundaries (e.g. one slice only adds a new module).
     - Low: clean functional splits (DB/backend vs frontend, refactor vs behavior change, pure addition with no shared edits).

3. **Context check (critical for agents)**
   - Is the current shell / worktree the user's primary authenticated clone (where `gt` has real GitHub auth and the human does `gt submit --stack`)?
   - Are we inside an agent worktree (local `.worktrees/` preferred or `~/.grok/worktrees/` global fallback clone) / subagent isolation?
   - Is `command -v gt` + `gt --help | grep -qi graphite` true here?
   - Will the human need to do the final land/submit from a different terminal/shell?

4. **Decide and declare (be honest and explicit)**
   Output one of:

   - **"gt recommended (clean splits)"** — low coupling + clear functional/iterative/refactor/risk boundaries per how-to-structure-your-stacks. Human or agent is in primary checkout. Proceed with gt recipe.
   - **"gt overkill or makes harder — use safe alternative"** — high coupling on core files, or agent generation context (gt state/auth lives elsewhere), or small scope, or high recoverability priority. Explicitly recommend and follow: plain independent PRs (split-to-prs), sequential waves on one branch then `gt split --by-file/--by-commit` at end, or single PR.
   - **"hybrid: produce per-slice branches + handoff recipe"** — common for execute-plan style. Agents produce committed + pushed per-PR branches (with good names). Human runs `git fetch` in primary shell then uses `gt` (create/track/submit) or plain gh. This is the "flawless + recoverable" default for most agentic work.

   State the decision + 1-sentence rationale citing coupling or context. Get confirmation before mutating branches if the user is in the loop.

## When gt is genuinely overkill or makes things harder (honest list)

Use this language in reports:

- High file coupling: "Multiple slices touch the same core files (e.g. lib.rs + central reactor + shared types + AGENTS.md). Graphite's parent/child tracking and restack add little value while increasing surface for desync on resume, worktree handoff, or concurrent agents. `gt split` at the end on a linear branch is simpler and still gives stacked PRs."
- Agent worktree / shell mismatch: "Implementation happens in isolated worktrees (local `.worktrees/<...>/` by default per git-worktrees preference, or fallback global Grok-managed clones under `~/.grok/worktrees/`) where the gt CLI is either absent or lacks the user's authenticated GitHub session. Per the multiple-worktrees doc and past execute-plan runs, gt commands must be run from the exact worktree that has the branch checked out; crossing shells creates exactly the auth + state problems we have seen. Safer to have agents produce plain pushed branches + per-PR refs; human does gt (or gh) in primary shell after `fetch`."
- Small / one-concept change or pure generated-code/version-bump style: one PR or one branch + `gt split --by-file` if review size is the only concern.
- High recoverability requirement: state file + named `refs/backup/...` + explicit per-slice branches + `gt undo` history being per-worktree make plain-git + documented handoff the lower-risk path when the run can be interrupted.
- You want the simplest mental model: "just commit and push a branch per reviewable unit."

Graphite shines for interactive human development on clean boundaries in the primary checkout (asynchronous building while waiting for review, nice `gt log` / `gt up` / `gt restack`, `gt modify` for fixups without rebase hell). It is not magic for coupled changes or cross-shell agent orchestration.

## gt + Git worktrees: Official stance, compatibility guardrails, and decision guide

### Official Graphite Stance on Worktrees (v1.8.4+)

- Graphite **fully supports** multiple Git worktrees.
- It **respects Git's rule**: a branch can only be checked out in **one** worktree at a time.
- Graphite **will not mutate** a branch that is checked out in another worktree. It errors out with a clear message instead. Treat this as a safety feature.
- `gt log` shows which worktree each branch is currently checked out in (extremely valuable before any stack operation).
- `gt undo` is **per-worktree**.
- **Strong recommendation**: Avoid having more than one worktree on the *same stack* when possible.
- If a stack *is* split across worktrees, you must run `gt sync` / `gt restack` (and similar stack-wide commands) from *each* relevant worktree.
- Special case: `gt sync` / `gt get` may still update the local `trunk` (main) even if it is checked out elsewhere.
- Use `gt create --onto <branch>` when you want to start a new branch on top of a branch that is already checked out in another worktree.

This is a significant improvement over earlier reports of potential data loss — Graphite now actively protects you.

### When to Use What (Decision Guide)

**1. Plain Git branching is enough when:**
- Most PRs are relatively independent or small/atomic.
- You don't frequently have long chains of dependent changes waiting in review.
- Low PR volume, small team, or you prefer minimal tooling and are comfortable with manual rebases or `gt split` at the end.
- You value maximum flexibility and "nothing extra."

Trade-off: You do the restacking yourself. This gets painful with deep stacks.

**2. `gt` in a single worktree (the sweet spot for most human interactive work)**

**Use this when:**
- You regularly break work into stacked PRs (dependent changes reviewed separately but landing in order).
- You want to stay unblocked: submit PR #1 while still working on PR #3 (iterative improvement stacks).
- You value automation for the painful parts (`gt sync --restack` is excellent).
- You mostly work on one feature/stack at a time (or can context-switch with `gt checkout` / stack navigation).
- You are in your primary authenticated checkout (or a dedicated worktree where gt has full state and auth).

**Why single worktree?** Lowest cognitive overhead. All the stack magic just works. `gt` was primarily designed around this model. Most developers should start here for their daily driver.

**3. `gt` + multiple worktrees**

**Use this when:**
- You frequently work on 2+ independent features/stacks in parallel.
- You hate branch switching in one directory (slow rebuilds, Docker context, IDE state, long-running dev servers, etc.).
- You want true physical isolation (one terminal building/testing while editing in another; parallel AI coding agents in separate "lanes").
- You run long-lived processes or have different environment needs per branch.

**How to do it well (critical in this repo):**
- Create worktrees with `git worktree add ...` (or the project's `concurrent-cli-agents` / git-worktrees scripts).
- **Always run `gt log`** before `gt sync`, `gt restack`, `gt modify`, `gt submit`, or creating on top of something. It tells you exactly where branches live.
- If a stack ends up split across worktrees, run the relevant stack commands from *each* worktree that owns part of it.
- Use `gt create --onto <branch>` when the desired parent is checked out in another worktree.
- Graphite will refuse (with a clear error) if you try to mutate a branch checked out elsewhere — this protects you.

**Caveats for agentic use:**
- gt state and authenticated GitHub session usually live in the *user's primary shell / primary worktree*. Agent worktrees (local `.worktrees/` by default, or full clones under `~/.grok/worktrees/` in fallback/extreme cases) often have gt absent or unauthenticated.
- This is why the hybrid pattern (agents produce committed/pushed per-PR branches → human performs gt assembly or submit in the primary authenticated tree after `fetch`) is so common and safe here.
- `gt undo` history is per-worktree, so recovery context can be split.

**4. Hybrid / advanced patterns (very common in this project)**
- Primary worktree on `main` (or a stable trunk) + dedicated worktrees (or full clones) for active generation / agent lanes.
- One "lane" per concurrent task (review, active dev, experiment, agent sub-plan).
- Agents implement in isolation (worktree or full clone) and push their branches. The human (or orchestrator in the primary tree) then uses `gt create --onto`, `gt track`, or assembles the stack with `gt submit --stack`.
- Some teams use worktrees *instead of* deep Graphite stacks purely for isolation; many who like stacking use both.

### Summary Recommendation (this repo context)

| Your situation                                      | Best choice                              | Notes for collab-finder / agentic work |
|-----------------------------------------------------|------------------------------------------|----------------------------------------|
| Mostly independent PRs or high coupling on core files | Plain Git or "do work then `gt split`" at end | Coupling diagnosis in this skill often wins here. |
| Regular stacked PRs, mostly one thing at a time, human in primary checkout | `gt` in **single worktree** (primary)   | Sweet spot for clean functional/iterative stacks. |
| Parallel independent work + hate switching + agents | `gt` + **multiple worktrees** (with discipline) | Powerful. Use `gt log` religiously + `gt create --onto`. |
| Agent generation (execute-plan, subagents, concurrent) + final human gt steps | **Hybrid**: agents in isolated trees/clones produce per-PR branches + commits; human does gt in primary after `fetch` | Default for most ambitious plans here. Per-PR escape hatches + explicit handoff required. |
| Very complex / many concurrent stacks               | `gt` + worktrees (with strict discipline) | `gt log` before every stack-wide command. Run sync/restack from owning trees. |

### Practical Starting Advice (adapted for this environment)

1. Install `gt` and try the core flow first in your normal primary clone (single worktree): `gt create`, `gt submit --stack`, `gt sync`, `gt modify`, `gt log` / `gt ls`.
2. Only add worktrees (or let agents use them) when you feel the pain of switching or need true parallel isolation.
3. **Before any potentially stack-affecting `gt` command, run `gt log`** to see current checkout state and worktree ownership.
4. For agent runs: follow the zero-lost-code contract below. Agents should commit + push inside their environment. The primary authenticated shell is usually where the final `gt` assembly / submit happens.
5. You can always fall back to plain `git` — Graphite is additive. The per-slice branches we preserve give you escape hatches.

## The "flawless + easily recoverable + code never lost" contract (always)

Regardless of gt vs plain decision, these rules are non-negotiable in this project:

1. **Commit inside the generation environment.** Subagents (or you) `git add -A && git commit` in the worktree / shell where the code was written. Never rely on "I'll copy later".
2. **Push the concrete branches** (with `--force-with-lease` for safety on resume). The objects must be on the remote (or at least fetchable) before declaring a slice "done".
3. **Record authoritative SHAs** (not just branch names). `pr.commit_sha = $(git -C <wt> rev-parse HEAD)`; verify with `git cat-file -t`.
4. **Tear down worktrees before mutating their branch refs** (the Subagent Worktree Protocol from execute-plan). Use `grok worktree rm --force` (or the scripts) before `git checkout -B` or gt operations on that branch name.
5. **Worktree ownership discipline for gt (official guardrail).** Before any gt command that can affect a stack (`gt sync`, `gt restack`, `gt submit`, `gt modify`, `gt create` on top of something, etc.), run `gt log` (or `gt ls`) to see exactly which worktree owns each branch. Graphite will refuse to mutate a branch checked out in another worktree — this is protection, not a bug. Use `gt create --onto <branch>` when the parent lives in a different worktree. Never assume "my current shell owns the whole stack."
6. **Two-phase handoff is explicit and copy/pasteable.**
   - Phase 1 (agent / generation shell or worktree): commit + push the per-slice or gt branches. Print exact commands for the user.
   - Phase 2 (user's primary authenticated clone / primary worktree): `git fetch origin`, then the gt (or gh) commands. Never assume the agent shell or secondary worktree can do the final `gt submit --stack`.
7. **Backup refs before any risky mutation.**
   - Before gt operations that could surprise: `git stash create` + `git update-ref refs/backup/pre-gt-$(date +%s) $sha`.
   - Or `git branch backup/pre-gt-... <branch>`.
8. **Per-slice escape hatches always exist.** Even in "gt mode", keep the `execute-plan/<plan>-pr-N-<slug>` style branches (or equivalent) as plain refs the user can fall back to with `gt track`, `gt split`, or plain PRs.
9. **State / transcript survives.** For long runs use a `/tmp/...-plan.json` or equivalent + the memory flush patterns. On crash, `--resume` or manual reconstruction from pushed branches + chat must be possible.
10. **Hygiene after.** After any agent orchestration: prefer `git worktree prune` + local scripts for `.worktrees/` (the default); `grok worktree gc` + `.agents/skills/git-worktrees/scripts/agent-worktree-clean.sh --prune` if global clones or ghosts are present. Run from the primary shell. See git-worktrees skill.
11. **Never `cp` or editor-save from a worktree into the primary checkout for integration.** Commit + cherry-pick / merge / gt create + cherry-pick range in the integration shell only.

If any of the above cannot be satisfied, choose the simpler path (plain branches or single branch + split later) and document why.

## Recommended flows (chosen after the decision)

### When gt recommended — single worktree (primary authenticated checkout)

From how-to-structure-your-stacks + create-stack + comparing-git-and-gt + official worktree support:

This is the classic sweet spot: clean functional component stacks, iterative improvement stacks, refactor-then-change, riskiness stacks, or version-bump/generated-code stacks.

In your **primary human checkout** (the one with real gt auth and where you normally run `gt submit --stack`):

```bash
# trunk-based, small atomic commits-as-branches
gt trunk
# ... make the first reviewable slice (e.g. DB/model or pure refactor)
gt add -A
gt create -m "part 1: ..."
# continue on next slice while previous is in review (asynchronous development)
gt create -am "part 2: ..."
gt create -am "part 3: ..."

# when ready for review
gt submit --stack
```

Key patterns:
- Use `gt create --onto <branch>` when the desired parent/base is checked out in another worktree.
- For feedback on a downstack PR: `gt checkout <that-branch>`, make changes, `gt modify -a` (or `-cam "msg"`), then `gt submit --stack` (important for propagating to upstack PRs).
- Exploration checkpoints: `gt create` liberally, later clean up with `gt fold` (or `gt split` to undo a fold).
- When `main` moves: `gt sync` then `gt restack` (run from the worktree that owns the relevant part of the stack).
- Always inspect first: `gt log` (or `gt ls`) — it shows the full stack visualization plus which worktree owns each branch.
- After submit: use `/pr-babysit` or monitor in the Graphite UI / GitHub.

`gt log` before big commands is non-negotiable once you have multiple worktrees in play.

### gt + multiple worktrees (when you need physical isolation)

Use when you have 2+ independent stacks in flight, hate the cost of switching branches (rebuilds, dev servers, IDE, Docker), or are running parallel agents/lanes.

Rules that keep it safe and effective:
- Create worktrees via `git worktree add` (or the project's scripts under git-worktrees / concurrent-cli-agents).
- **Run `gt log` first** before `gt sync`, `gt restack`, `gt submit --stack`, `gt modify`, or any create that depends on another branch. This is the single most important habit.
- If any part of a stack is checked out in another worktree, run the stack-wide commands from each owning worktree.
- Use `gt create --onto <branch>` to extend a branch that lives in a different worktree.
- Graphite will error (helpfully) rather than corrupt state when you try to touch a branch owned by another worktree.
- `gt undo` only affects the current worktree.

In agentic scenarios this often looks like: several agent worktrees (or full clones) each working on their own independent branch or small sub-stack, while the human's primary worktree stays on a stable base or a review lane.

### Hybrid / most common agentic case (per-PR or per-lane branches → human gt in primary)

This is the dominant pattern for execute-plan, concurrent-cli-agents, and heavy subagent work in this repo.

- Agents / implementers run inside isolated worktrees (local project `.worktrees/` strong default per git-worktrees skill; `~/.grok/worktrees/` full clones only as fallback for extreme isolation/bloat cases).
- They follow the Subagent Worktree Protocol: implement, commit (including all review-fix rounds), push objects, record the authoritative `commit_sha`.
- At assembly time the orchestrator (or you) in a workspace that has gt may do `gt create` + cherry-pick + `gt submit --stack`, **but only if this workspace is the right authenticated primary one**.
- In the far more common case (gt/auth lives in the user's everyday shell), agents simply ensure every slice branch is committed and pushed. The user then does in their primary authenticated clone:
  ```bash
  git fetch origin

  # Option A (common when coupling was discovered late or you want clean review slices)
  git checkout -b review/plan-xxx origin/execute-plan/xxx-...-linear   # or the integration branch
  gt track ...   # if needed
  gt split --by-commit   # or --by-file / --by-hunk for functional or risk-based splits

  # Option B (when you already have good per-PR branches)
  gt create execute-plan/xxx-pr-1-... --onto main   # or the correct parent
  # ... repeat in stack order
  gt submit --stack
  ```

- **Always** leave the individual `execute-plan/...-pr-N-...` (or equivalent lane) branches pushed. They are the ultimate recoverable artifacts and work with or without gt.
- Print a crystal-clear handoff in every agent run.

This pattern gives you the safety of commit-in-generation-env + per-slice escape hatches while still letting you (the human) enjoy the full power of gt in the shell where it actually works.

### When we declared "gt overkill"

Follow split-to-prs or git-worktrees patterns (or "work on one linear/sequential branch then split at the end"):

- Save recoverable snapshot (stash create + update-ref backup).
- For each approved slice: branch from correct base, stage only the planned files/hunks for that slice, commit, push, open PR (or print gh command).
- Or: do the whole thing on one branch (or sequential waves), push it, then in primary: `gt split --by-commit` or `--by-file` or `--by-hunk` to produce the stacked PRs after the fact.
- This still gives the reviewer benefits of small PRs without forcing gt tracking during the risky generation phase or when coupling is high.

### Late discovery of coupling

If you started with gt creates and now see the slices are too entangled: use `gt fold` to collapse, or finish on the linear branch and use `gt split` (by commit / file / hunk) at the end. `gt split` is your friend for "I did the work, now make it reviewable". In worktree setups, make sure you are in the worktree that owns the branch you are splitting.

## Quick command reference (tailored)

From Graphite llms/cheatsheet + the pages you asked to read (plus worktree guardrails):

- **See everything including worktree ownership**: `gt log` (or `gt ls`). **Run this before any stack-wide command.**
- Create next in stack (single commit style): `gt create [-a] [-m "msg"] [name]`
- Create on a base checked out in another worktree: `gt create --onto <branch>`
- Submit the current stack (push + create/update PRs): `gt submit --stack` (or `gt ss`)
- Sync trunk + clean merged + prepare for restack: `gt sync`
- Restack the current stack onto updated parents: `gt restack` (run from each worktree that owns part of the stack)
- Amend staged changes into current branch (great for fixups): `gt modify -a` (or `gt modify -cam "msg"`, or `gt modify --into <downstack-branch>`)
- Fold current branch into its parent: `gt fold` (or `gt f`)
- Split the current branch into multiple (by commit boundaries, hunks, or files): `gt split [--by-commit|-c] [--by-file|-f ...] [--by-hunk|-h]`
- Undo the most recent Graphite mutation in *this* worktree: `gt undo`
- Navigate the stack: `gt up` / `gt down` / `gt top` / `gt bottom` / `gt checkout <name>`
- Start tracking an existing (pushed) branch with Graphite: `gt track <branch>`
- Stop tracking: `gt untrack`

**Critical worktree rules (memorize):**
- `gt log` is your friend — it tells you which worktree owns each branch.
- Graphite refuses to mutate a branch checked out in another worktree.
- `gt undo` is per-worktree.
- For split stacks: run `gt sync` / `gt restack` from every relevant worktree.
- Use `--onto` when extending across worktrees.

## Integration with other skills in this repo

- `execute-plan`: already implements dual-mode (gt vs plain-git) + the Subagent Worktree Protocol + state + resume + hygiene. Consult gt-flow at Step 0.5 / assembly time (and in the coupling diagnosis step) for honest "gt overkill?" calls and precise handoff recipes. The mental model and worktree guardrails here directly inform when execute-plan should force plain-git mode or produce strong per-PR escape hatches.
- `git-worktrees`: the low-level "where the code actually lives", scripts for create/merge/clean (local `.worktrees/` default + global hygiene), and disk hygiene (local preferred; global `~/.grok/worktrees/` as documented fallback). gt-flow provides the higher-level decision of *whether and how* to use gt on top of those isolated environments.
- `split-to-prs`: the primary "gt overkill or high coupling" escape hatch. Use it (or late `gt split`) when the coupling diagnosis fires.
- `agent-orchestrator` / briefs + `concurrent-cli-agents`: surface coupling + worktree isolation needs early. Prefer disjoint file ownership per lane; document the exact gt handoff the human will run in primary.
- After any agent orchestration involving branches or worktrees: run the git-worktrees cleanup scripts + `grok worktree gc` from the primary shell.

## Recovery playbook (when something goes wrong)

- Code only exists in a worktree that is about to be removed: stop. Commit it first. Push the branch. Only then remove.
- gt state / stack is confused across worktrees: **run `gt log` from each relevant worktree first**. Then `gt sync` / `gt restack` from the worktree(s) that own the downstack branches. Graphite will tell you when a branch is checked out elsewhere.
- Partial stack after crash or interrupted handoff: use the per-PR / per-lane pushed branches + `git fetch origin`. Reconstruct with `gt create --onto ...`, `gt track`, or plain git + `gt submit --stack` in the primary authenticated shell.
- Want to abandon the gt tracking but keep the commits: the underlying git branches still exist. `gt untrack` (or just stop using gt on them) and open PRs directly, or use `gt split` on a linear result.
- Lost worktree dir but commits were pushed: `git fetch origin <branch>` will bring the objects and branch back. The explicit per-slice branches (`execute-plan/...` style or your lane names) + backup refs are your ultimate anchors.
- `gt undo` didn't do what you expected: remember it is per-worktree. Switch to the worktree where the command was originally run.

## After creating / updating this skill

- The TUI should pick it up automatically under `.agents/skills/gt-flow` (skills reload on file change).
- Consider adding a row to the project AGENTS.md "Project-Specific Skills" table (under X / finder-reactor / tauri-agentic / git-worktrees etc.).
- When in doubt on any stacking, PR planning, execute-plan, or concurrent agent decision involving branches or gt, prefix with "use gt-flow" or just let the description match.

This skill exists so that ambitious agentic plans (and human ones) produce reviewable, stacked, high-quality PRs **without ever losing the generated code**, while honestly using `gt` + worktrees only when the coupling, context, and guardrails say it will actually help — and falling back gracefully otherwise.
