---
name: concurrent-cli-agents
description: >-
  Runs Hermes, OpenClaw, and Grok Build concurrently on isolated git worktrees or
  cloud sandboxes (Modal, Daytona, E2B, Fly Sprites). Use when orchestrating
  multiple CLI coding agents, git worktree isolation, subagents in separate
  branches, or offloading agent runs to remote sandboxes.
---

# Concurrent CLI agents (worktrees + cloud sandboxes)

Orchestrate **multiple coding agents on one repo** without shared working trees or index corruption. Default to **local git worktrees**; escalate to **cloud sandboxes** when isolation, scale, untrusted code, or missing host deps require it.

Pair with [agent-orchestrator](../agent-orchestrator/SKILL.md) (briefs, verification, waves), [git-worktrees](../git-worktrees/SKILL.md) (safe commit-then-merge — **never `cp` from worktrees**), [split-to-prs](../split-to-prs/SKILL.md) (merge plans), [devcontainer-hardened](../devcontainer-hardened/SKILL.md) (long-lived dev env), [cli-for-agents](https://cursor.com/docs/agent/skills) patterns (non-interactive CLIs).

## Principles

1. **One agent → one workspace** — separate worktree or sandbox per concurrent task; never two agents in the same checkout.
2. **Branch naming is predictable** — `agent/<tool>/<slug>` (e.g. `agent/hermes/fix-auth`, `agent/grok-build/refactor-footer`).
3. **Local first** — worktrees on the host cost nothing and preserve `AGENTS.md` / skills / MCP; use cloud when the matrix below says so.
4. **Orchestrator stays thin** — a coordinator (human, script, or parent agent) assigns tasks, tracks IDs, merges; workers do not share state.
5. **Secrets stay out of git** — copy via `.worktreeinclude` (Hermes) or sandbox env; never commit `.env`.
6. **Stagger worktree creation** — concurrent `git worktree add` can race on macOS; sleep 0.5–1s between adds or serialize creation ([reference](reference.md#git-concurrency)).

---

## Workflow checklist

```
- [ ] 1. Classify tasks: independent (concurrent OK) vs coupled (single agent or ordered waves)
- [ ] 2. Pick runtime: local worktree | cloud sandbox (see decision matrix in reference.md)
- [ ] 3. Create one workspace per agent (scripts or native -w / subagent flags)
- [ ] 4. Record session in workspaces manifest (templates/workspaces.manifest.example.json)
- [ ] 5. Run agents with repo skills loaded (AGENTS.md); non-interactive flags for automation
- [ ] 6. Validate each workspace (lint/type-check scoped to touched areas)
- [ ] 7. Merge or open PRs per branch; prune worktrees / destroy sandboxes
- [ ] 8. After execute-plan or 4+ concurrent agents: run `git-worktrees/scripts/agent-worktree-clean.sh --prune` to reclaim `~/.grok/worktrees/` (often several GB)
```

---

## Step 1: Choose runtime

| Need | Prefer |
|------|--------|
| Same machine, full repo + local Brave E2E | **Git worktree** on host |
| Hermes / Grok Build / OpenClaw concurrent CLI | **Worktree** (native `-w` or script below) |
| Untrusted or destructive agent code | **Cloud sandbox** (Modal, E2B, Daytona) |
| 10+ concurrent runs, no local RAM | **Cloud** (Modal scale, E2B fleet) |
| GPU / heavy ML in agent loop | **Modal** sandbox with GPU option |
| Long-lived dev server + preview URL | **Daytona** (preview links) or devcontainer |
| Persistent agent “computer” on Fly | **Fly.io Sprites** |
| Regulated: code must not leave laptop | **Local worktree** only |

Full provider comparison: [reference.md](reference.md#cloud-sandbox-matrix).

---

## Step 2: Local concurrency — git worktrees

### Hermes (NousResearch)

- **Auto worktree:** `hermes -w` or `hermes --worktree` — creates `.worktrees/…`, branch `hermes/<id>`, optional `.worktreeinclude` for `.env` / `.venv`.
- **Concurrent:** one terminal (or process) per `hermes -w`; each session is isolated.
- Docs: [Git Worktrees \| Hermes Agent](https://hermes-agent.nousresearch.com/docs/user-guide/git-worktrees).

### Grok Build (xAI)

- **Subagents in worktrees** — delegate concurrent subagents; launch subagents in their own worktrees from the parent session.
- **Headless:** `grok -p "task"` for scripts; respects `AGENTS.md`, skills, MCP.
- Install: `curl -fsSL https://x.ai/cli/install.sh | bash` — [Grok Build overview](https://docs.x.ai/build/overview).

### OpenClaw

- **Multi-agent routing** — separate workspaces + per-agent sessions via gateway config (not one shared cwd).
- **CLI:** `openclaw agent --message "…"` per routed agent; isolate by agent id / workspace in config.
- **Do not** run two OpenClaw sessions on the same workspace directory concurrently.
- Docs: [openclaw/openclaw](https://github.com/openclaw/openclaw).

### Repo helper scripts (any CLI)

From repo root:

```bash
# Create isolated worktree + branch
.agents/skills/concurrent-cli-agents/scripts/agent-worktree-create.sh \
  --tool hermes --slug fix-auth

# List agent worktrees
.agents/skills/git-worktrees/scripts/agent-worktree-list.sh

# Merge agent branch into current branch (after agent committed in worktree)
.agents/skills/git-worktrees/scripts/agent-worktree-merge.sh --branch agent/hermes/fix-auth

# Remove after merge (keeps branch unless --delete-branch)
.agents/skills/git-worktrees/scripts/agent-worktree-remove.sh --path .worktrees/hermes-fix-auth
```

Add `.worktrees/` to `.gitignore` if missing. Copy [templates/.worktreeinclude.example](templates/.worktreeinclude.example) to repo root as `.worktreeinclude` when agents need gitignored files.

---

## Step 3: Cloud sandbox (when local is not enough)

Use **one sandbox per agent task**. Clone the repo inside the sandbox (or mount via provider API), run the same CLI headlessly, return diff or push branch.

| Provider | Typical integration | Notes |
|----------|---------------------|--------|
| **Modal** | `modal.Sandbox` / Agents SDK `SandboxAgent` | gVisor, fast start, huge concurrency; Python-first |
| **Daytona** | Daytona SDK + agent in sandbox | Dev env + preview URLs; Codex/agent guides |
| **E2B** | `e2b` / `@e2b/code-interpreter` SDK | Firecracker microVM; templates for Claude Code/Codex |
| **Fly.io Sprites** | Fly API | Persistent checkpoint VMs for agents |
| **GitHub Codespaces** | Per-branch codespace | Pairs with worktree branches |
| **Dev container** | [devcontainer-hardened](../devcontainer-hardened/SKILL.md) | Team-stable image, not ephemeral burst |

**Singularity:** name is overloaded — confirm with the user:

- **wisent-ai/singularity** — Python agent *framework* (shell/filesystem skills), not a hosted git sandbox.
- **SingularityNET UI Sandbox** — marketplace UI components only, not full-repo coding agents.

Example Modal pattern (conceptual): create sandbox → `git clone` → `pnpm install --frozen-lockfile` → run `grok -p` or `hermes` with `XAI_API_KEY` / provider keys in sandbox secrets.

---

## Step 4: Orchestration patterns

### Independent tasks (no shared files)

```text
Coordinator
├── worktree A → hermes -w  → branch agent/hermes/task-a
├── worktree B → grok -p "…" (in worktree B cwd)
└── worktree C → openclaw agent (workspace C)
```

### Dependent tasks (waves)

Use waves like [split-to-prs](../split-to-prs/SKILL.md): wave 1 merges API types, wave 2 starts only after wave 1 is on `main` or a shared integration branch.

### Manifest

Track active sessions in `.agents/workspaces.json` (gitignored) from [templates/workspaces.manifest.example.json](templates/workspaces.manifest.example.json): `id`, `tool`, `branch`, `path`, `runtime` (`local` | `modal` | `daytona` | …), `status`.

---

## Step 5: Merge and cleanup

Follow [git-worktrees](../git-worktrees/SKILL.md): **commit in each worktree**, then merge — never `cp` files into the primary checkout.

1. Per workspace: `pnpm type-check` / `pnpm lint` (or project equivalents).
2. **`git commit`** on `agent/<tool>/<slug>` inside the worktree before integration.
3. On integration branch (primary checkout): `agent-worktree-merge.sh --branch agent/<tool>/<slug>` one at a time; resolve conflicts there only.
4. Push integration branch or open PR per agent branch ([split-to-prs](../split-to-prs/SKILL.md)).
5. `agent-worktree-remove.sh` after merge; destroy cloud sandbox by ID.
6. Prune stale repo-local worktrees: `git worktree prune`.
7. **Global hygiene (critical after big runs)**: run
   `.agents/skills/git-worktrees/scripts/agent-worktree-clean.sh --prune`
   to remove orphaned full clones under `~/.grok/worktrees/` (the main disk consumer after execute-plan, best-of-n, or heavy concurrent Grok sessions). The script safely preserves per-task branches first.

---

## Anti-patterns

- **Copying (`cp` / write) from `.worktrees/` into the primary checkout** for integration — use merge/cherry-pick ([git-worktrees](../git-worktrees/SKILL.md))
- Finishing a task without **`git commit` in the worktree** then removing the worktree
- Two agents editing the same worktree or branch simultaneously
- `git add -A` on a shared checkout while agents run
- Cloud sandbox with production credentials or unscoped `docker.sock`
- Assuming `@types/node` or docs versions define the sandbox Node major (use [devcontainer-hardened Step 1](../devcontainer-hardened/SKILL.md#step-1-resolve-node-major) or provider image pin)
- Concurrent worktrees that all touch the same few files (serialize or split the task)

---

## Validation

```bash
git worktree list
# each agent path shows correct branch

# per worktree
pnpm install --frozen-lockfile
pnpm type-check
pnpm lint
```

Cloud: confirm sandbox destroyed after task; no orphaned volumes with secrets.
