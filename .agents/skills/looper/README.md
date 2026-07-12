# Looper

**Structured agent loops over raw ReAct** — outer state machine, bounded inner steps, multi-model routing, HITL pause gates.

Agents load **[SKILL.md](SKILL.md)**. This README is the human-facing index.

**Library canonical:** `~/Work/personal/skills/looper` (personal skills repo). This directory is the **project-local vendor** for collab-finder.

## Why

Plain ReAct is creative but often implicit, brittle, and hard to audit. Keep the loop; give it a skeleton.

Thesis: [X post by @Peramanathan](https://x.com/Peramanathan/status/2067890630345494578).

## Quick start

1. Agents: match description / “use looper” / `AGENTS.md` routing → [SKILL.md](SKILL.md).
2. Open a **Loop Card**: [references/loop-card.md](references/loop-card.md).
3. Compose with [agent-orchestrator](../agent-orchestrator/SKILL.md); do not put finder/CV/X domain logic here.

```bash
# From collab-finder repo root
node .agents/skills/looper/scripts/validate-skill.mjs

# Cursor local (gitignored)
mkdir -p .cursor/skills
ln -sfn ../../.agents/skills/looper .cursor/skills/looper
# .cursor/rules → ../.agents/rules  (loads looper.mdc)
```

## Layout

| Path | Purpose |
|------|---------|
| [SKILL.md](SKILL.md) | Full contract: phases, budgets, routing, HITL |
| [README.md](README.md) | This file |
| [references/loop-card.md](references/loop-card.md) | Session control surface |
| [scripts/validate-skill.mjs](scripts/validate-skill.mjs) | Structural contract (project layout) |
| [../../rules/looper.mdc](../../rules/looper.mdc) | Cursor rule (`alwaysApply: false`) |

## Collab-finder note

- **Looper** = control plane (how the agent cycles).
- **finder-reactor / cv-promote-guard / x-agent-resources** = data plane (what the product does).
- Do not re-own domain autonomy inside this skill.

## Reference

- https://x.com/Peramanathan/status/2067890630345494578
- Library twin: `~/Work/personal/skills/looper/README.md`
