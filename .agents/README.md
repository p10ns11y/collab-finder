# Agent skills (tool-agnostic) — collab-finder

Portable instructions for coding agents (Grok Build, Cursor, Claude Code, etc.) and for the app itself (MCP/skill exposure).

## Layout

```
.agents/skills/<skill-name>/SKILL.md
.agents/rules/          ← canonical; .cursor/rules → .agents/rules (local only, gitignored)
.agents/x-resources/   ← vendored X skill.md + llms.txt (refresh from upstream)
```

Each skill is a directory with `SKILL.md` (YAML frontmatter + rich markdown body, following agentskills.io + X patterns).

## How agents discover skills

- **Grok Build / this environment**: Read root `AGENTS.md`; load `SKILL.md` on match to `description`. Use `spawn_subagent`, subagent-delegation, fusion-sage for orchestration.
- **Cursor**: Recreate local symlinks under `.cursor/` (see below). **Do not commit `.cursor/`** — Git rejects many symlink layouts (`pathspec … beyond a symbolic link`); canonical sources live here in `.agents/`.
- **Other agents**: Explicit paths or project rules.
- **The collab-finder app itself**: Exposes finder capabilities as MCP tools + publishes its own root `SKILL.md` (so external agents can call "search X opportunities with my profile + CV", "generate prep pack with guards", etc.).

## Core + Project Skills

See root `AGENTS.md` for the full index (finder-reactor, x-agent-resources, cv-promote-guard, tauri-agentic, plus portable ai-optimization, fusion-sage, bdd-strategizer, agent-orchestrator, **looper**, git-worktrees, etc.).

| Skill (portable control) | Path | When |
|--------------------------|------|------|
| **looper** | [skills/looper/SKILL.md](skills/looper/SKILL.md) | Multi-step agent cycles, outer state machine, bounded inner steps, multi-model routing, HITL pause gates — composes with orchestrator/subagent/fusion; not domain finder logic. **Library canonical:** `~/Work/personal/skills/looper` |
| Cursor rule (optional) | [rules/looper.mdc](rules/looper.mdc) | Discovery when loop/routing signals fire (`alwaysApply: false`) |

When adding a skill, update [docs/agent-playbook.md](../docs/agent-playbook.md) and this file. Keep root `AGENTS.md` as the short router only.

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
- `dev-loop.mdc` (alwaysApply: true) — read → grep → edit → AGENTS.md verify; commit only when asked.
- `agent-workflow.mdc` (alwaysApply: true) — triage; verify table is in root `AGENTS.md`.
- `secrets-agent-safety.mdc` (alwaysApply: true) — never dump X/xAI secrets via secret-tool or cat.
- `fusion-sage.mdc` (alwaysApply: false) — load on "ignite" / "use fusion".
- `finder-reactor.mdc` / `tauri-agentic.mdc` — glob-scoped domain rules.
- `looper.mdc` (alwaysApply: false) — structured loops, multi-model routing, HITL gates.

Slash commands (canonical `.agents/commands/`; symlink into `.cursor/commands/`):
- `session-start.md` — life-os `README.md` + verify SoT
- `gate.md` — `pnpm gate`

## Agent skills (`.cursor/skills/`)

This machine uses a **whole-tree** link (fine). Per-skill links also work if you want a smaller catalog:

```bash
ln -sfn ../.agents/skills .cursor/skills
# or: ln -sfn ../../.agents/skills/<name> .cursor/skills/<name>
```

Prefer project domain skills (finder-reactor, tauri-*, cv-promote-guard, x-agent-resources) over duplicating the same portable skills already in `~/.cursor/skills/`.

## X Agent Resources Integration

Downstream snapshots: [.agents/x-resources/README.md](x-resources/README.md) (agent hub — read first on X work).

```bash
./.agents/x-resources/refresh.sh   # pull skill.md + llms.txt from docs.x.com
```

Then: `x-agent-resources` skill, `data/distillation/`, `docs/x-tools.md`. Upstream wins when snapshots are stale.

## Conventions (Agentic + Tauri + pnpm + Rust)

- Triage with `agent-orchestrator` before any non-trivial work.
- Every autonomous decision in code (or prompts) must have self-guard + pause path.
- After agentic changes: follow root `AGENTS.md` verify table (`pnpm type-check`, `pnpm verify`, `cargo test`, `pnpm gate`). No `pnpm lint` / `pnpm precommit`.
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