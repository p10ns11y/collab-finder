# Agent playbook — collab-finder

> **Load rule:** On-demand only — not sticky. Formal router: [AGENTS.md](../AGENTS.md). Kernel dialect: [~/Work/personal/skills/formal/AppGenMathPhyLang.kernel.md](~/Work/personal/skills/formal/AppGenMathPhyLang.kernel.md).

```text
Playbook ≔ skills index · wiring · conventions · testing
SessionSoT ≔ ~/life-os/Projects/collab-finder/README.md
Library ≔ ~/Work/personal/skills  // canonical control-plane skills (symlink, don't copy)
```

## Life OS

Thin card + dated sessions under `Projects/collab-finder/sessions/`. Agents start at `SessionSoT`; record outcome on session end.

## Skills (fission + fusion)

| Skill | When |
|-------|------|
| `ai-optimization` | large context · prompts · prune |
| `fusion-sage` | **ignite** / **use fusion** only — synthesis · surplus |
| `finder-reactor` | autonomous cycle · guards |
| `x-agent-resources` | X search · MCP · xurl |
| `cv-promote-guard` | sidecar · preview · confirm |
| `tauri-agentic` · `tauri-ipc-debug` | shell · IPC |
| `agent-orchestrator` | multi-worker · briefs |
| `control-graph` | outer SM · inner DAG · HITL · routing (legacy name: looper) |
| `git-worktrees` · `concurrent-cli-agents` | parallel slices |
| `fix-dependency-security` · `split-to-prs` | deps · PR chunks |

Refresh X snapshots: `./.agents/x-resources/refresh.sh`. Upstream wins when stale.

## Cursor wiring

```bash
ln -sfn ../.agents/rules .cursor/rules
ln -sfn ../.agents/skills .cursor/skills   # or per-skill symlinks
ln -sfn ../../.agents/commands/*.md .cursor/commands/
```

Always-on rules: `dev-loop`, `agent-workflow`, `secrets-agent-safety`. Domain: globs (`finder-reactor`, `tauri-agentic`). `fusion-sage.mdc`: requestable.

**Library symlinks (preferred for control-plane):**

```bash
SKILLS=~/Work/personal/skills
ln -sfn "$SKILLS/control-graph" .agents/skills/control-graph
ln -sfn "$SKILLS/agent-orchestrator" .agents/skills/agent-orchestrator  # if no project overlay
```

Pack pull: `~/Work/personal/skills/master-planner/scripts/pull-skills.sh --project . --pack agentic-desktop`

## Conventions

- Verify: [AGENTS.md](../AGENTS.md) `VerifySoT` — **no** `pnpm lint` / `pnpm precommit`
- React: `react-client-expert` · minimal state · desktop webview
- Agentic code: guard + pause + structured decide output (serde/zod)
- CV promote: never mutate external repo without user
- Integrate worktrees via merge — never `cp`
- Slash: `/session-start` · `/gate` · `/eva` when map is thin

## Testing

```text
pnpm type-check · pnpm verify · cargo test · pnpm gate
```

Dogfood; intervene only on real guard pauses.
