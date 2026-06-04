# Agent skills (tool-agnostic) — collab-finder

Portable instructions for coding agents (Grok Build, Cursor, Claude Code, etc.) and for the app itself (MCP/skill exposure).

## Layout

```
.agents/skills/<skill-name>/SKILL.md
.agents/rules/          ← canonical; .cursor/rules → .agents/rules
```

Each skill is a directory with `SKILL.md` (YAML frontmatter + rich markdown body, following agentskills.io + X patterns).

## How agents discover skills

- **Grok Build / this environment**: Read root `AGENTS.md`; load `SKILL.md` on match to `description`. Use `spawn_subagent`, subagent-delegation, fusion-sage for orchestration.
- **Cursor**: Recreate local symlinks under `.cursor/` (see below). **Do not commit `.cursor/`** — Git rejects many symlink layouts (`pathspec … beyond a symbolic link`); canonical sources live here in `.agents/`.
- **Other agents**: Explicit paths or project rules.
- **The collab-finder app itself**: Exposes finder capabilities as MCP tools + publishes its own root `SKILL.md` (so external agents can call "search X opportunities with my profile + CV", "generate prep pack with guards", etc.).

## Core + Project Skills

See root `AGENTS.md` for the full index (finder-reactor, x-agent-resources, cv-promote-guard, tauri-agentic, plus portable ai-optimization, fusion-sage, bdd-strategizer, agent-orchestrator, git-worktrees, etc.).

When adding a skill, update the index in root `AGENTS.md` and this file.

## Agent rules (`.agents/rules/`)

Cursor loads **`.cursor/rules` → `../.agents/rules`** (the `rules` entry must be the symlink itself, not a folder containing a nested `rules` link).

**Wrong (double `rules`):**

```text
.cursor/rules/          ← directory
  rules → ../../.agents/rules   ← Cursor may not load *.mdc here
```

**Correct (from repo root):**

```bash
rm -rf .cursor/rules
ln -sfn ../.agents/rules .cursor/rules
ls .cursor/rules/*.mdc   # should list fusion-sage.mdc, agent-workflow.mdc, …
```

Relevant rules in `.agents/rules/` today:
- `fusion-sage.mdc` (alwaysApply: true) — synthesis + surplus for the agentic reactor.
- `finder-reactor.mdc` — reactor, self-guards, pauses.
- `tauri-agentic.mdc` — MCP exposure, Tauri command design for agents.
- `agent-workflow.mdc`, `grep-before-edit.mdc`, `read-edit-lint.mdc` — dev process.

## Agent skills (`.cursor/skills/`)

Per-skill symlinks (not the whole `skills` folder):

```bash
ln -sfn ../../.agents/skills/<skill-name> .cursor/skills/<skill-name>
```

Example: `tauri-ipc-debug`, `finder-reactor`, `fusion-sage`.

## X Agent Resources Integration

This project bakes in https://docs.x.com/tools/ai from the start:
- Ingest `skill.md` + `llms-*.txt` for xAI prompts (accurate X behavior).
- Use XMCP / xurl patterns for the X layer.
- Publish matching `SKILL.md` + MCP server so the finder is agent-composable.

See `docs/x-tools.md` and the `x-agent-resources` skill.

## Conventions (Agentic + Tauri + pnpm + Rust)

- Triage with `agent-orchestrator` before any non-trivial work.
- Every autonomous decision in code (or prompts) must have self-guard + pause path.
- After agentic changes: `pnpm build`, `cd src-tauri && cargo check` (see docs/SETUP.md; lint/type-check scripts TBD).
- Surplus after major tasks (cheaper future iterations of the finder).
- Use worktrees + concurrent agents for parallel development of reactor parts.
- Verify-before-done, especially for CV promote paths and X write side-effects.
- No LLM attribution boilerplate in commits.

## Exponential Development Setup

This scaffolding (fusion + fission + X primitives + self-guards + MCP/skill) is designed so that development compounds rapidly:
- Subagents for implementing guard logic, MCP tools, prompt reactors.
- Briefs + verify for safety on high-value features (the autonomous loop).
- The app under development is also the tool that accelerates future dev (agents use the finder to find collabs for the project itself, or prep materials).

Run agents with "use fusion" for the big reactor design; fission for tight Rust/TS loops.

See root `AGENTS.md` for full workflow, surplus format, and activation.