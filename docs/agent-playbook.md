# Agent playbook — collab-finder

> **Load rule:** On-demand only. **Session context stack:** [agent-session-context.md](./agent-session-context.md). Router: [AGENTS.md](../AGENTS.md).

```text
Playbook ≔ skills index · wiring · sync · conventions
SessionSoT ≔ ~/life-os/Projects/collab-finder/README.md
Lock ≔ skills-lock.json  // p10ns11y/skills pinned hashes
```

## Skills sync

| Path | When |
|------|------|
| `npx skills experimental_install` | cold clone / teammate / CI — restore lock |
| `./scripts/sync-agent-skills.sh --lock` | refresh lock after library bump |
| `./scripts/sync-agent-skills.sh --pull` | local dev symlinks from `~/Work/personal/skills` |
| `./scripts/sync-agent-skills.sh --verify` | lock + pack wiring check |

Catalog: [skills.sh/p10ns11y/skills](https://www.skills.sh/p10ns11y/skills). Overlays: `.agents/overlays/` (not in lock).

## Locked portable pack (see skills-lock.json)

`agent-orchestrator` · `control-graph` · `looper` (redirect) · `ai-optimization` · `architecture-synthesis` · `fusion-sage` (alias) · `finder-reactor` · `tauri-agentic` · `git-worktrees` · `concurrent-cli-agents` · `split-to-prs` · `fix-dependency-security` · `subagent-delegation` · `react-client-expert`

## Project-born (git only, not in lock)

`cv-promote-guard` · `tauri-ipc-debug` · `x-agent-resources` · `agentic-reactor` · CV pack / explore skills · `.agents/workflows/`

## Skills (when to load)

| Skill | When |
|-------|------|
| `ai-optimization` | large context · prune |
| `architecture-synthesis` | **ignite** / architecture · surplus |
| `finder-reactor` | autonomous cycle · guards |
| `x-agent-resources` | X search · MCP |
| `cv-promote-guard` | sidecar · preview |
| `tauri-agentic` · `tauri-ipc-debug` | shell · IPC |
| `agent-orchestrator` | multi-worker |
| `control-graph` | outer SM · HITL · routing |
| `context-ignite` | **workflow** (library): fission → synthesis on cold repo |

Verify overlay for locked skills: [.agents/overlays/collab-finder-verify.md](../.agents/overlays/collab-finder-verify.md).

## Cursor wiring

```bash
ln -sfn ../.agents/rules .cursor/rules
ln -sfn ../.agents/skills .cursor/skills
ln -sfn ../../.agents/commands/*.md .cursor/commands/
```

Always-on: `dev-loop`, `agent-workflow`, `secrets-agent-safety`.

## Conventions

- Verify: [AGENTS.md](../AGENTS.md) VerifySoT — **no** `pnpm lint` / `pnpm precommit`
- Slash: `/session-start` · `/gate` · `/eva`
- Integrate via merge — never `cp`

## Testing

```text
pnpm type-check · pnpm verify · cargo test · pnpm gate
```
