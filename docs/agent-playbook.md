# Agent playbook — collab-finder

On-demand companion to root [`AGENTS.md`](../AGENTS.md) (the sticky router). Load this file when you need skills index, Cursor wiring, or conventions — not every turn.

## Life OS

High-level status, `next_action`, `review_date`, energy, and session plans live in:

`~/life-os/Projects/collab-finder/README.md`

Start a session there, do the work with `AGENTS.md` + `.agents/skills/` for *how*, then record outcome on that note. The life-os card links to this repo’s `AGENTS.md` and GitHub; this playbook and README link back so agents and humans share one tracker.

## Skills system (fission + fusion)

- **`ai-optimization`** (fission): token-efficient pruning, context compression, relevance scoring. Use for prompts, large CV + X post contexts.
- **`fusion-sage`** (fusion): synthesis, surplus, higher-order abstractions (FinderReactor, CVPromoteGuard). Activate with **"use fusion"** or **"ignite"** — not by default.

See `.agents/skills/fusion-sage/SKILL.md` and `.agents/skills/ai-optimization/SKILL.md`.

## X Agent Resources

On any X-related task, read [`.agents/x-resources/skill.md`](../.agents/x-resources/skill.md) first, then [`.agents/x-resources/README.md`](../.agents/x-resources/README.md) for refresh vs live docs. Refresh: `./.agents/x-resources/refresh.sh`. Do not treat a stale snapshot as law if the live API disagrees.

| Resource | Downstream | Upstream |
|----------|------------|----------|
| **skill.md** | `.agents/x-resources/skill.md` | https://docs.x.com/skill.md |
| **llms.txt** | `.agents/x-resources/llms.txt` | https://docs.x.com/llms.txt |
| **Presets** | `data/distillation/` | App-specific |

Also: **XMCP**, **Docs MCP**, **xurl** — [docs/x-tools.md](./x-tools.md). Finder MCP tools are planned; today use Tauri commands ([docs/tauri-commands.md](./tauri-commands.md)).

## Project skills (when the task matches)

| When | Read |
|------|------|
| Finder architecture, self-guards, pauses | `.agents/skills/finder-reactor/SKILL.md` |
| X search, MCP, xurl, official skill/llms | `.agents/x-resources/` then `x-agent-resources` |
| CV promote (sidecar, preview, confirm) | `cv-promote-guard` |
| Tauri + React agentic UI | `tauri-agentic` + `react-client-expert` |
| IPC / blank window / search not working | `tauri-ipc-debug` + [tauri-ipc-debugging.md](./tauri-ipc-debugging.md) |
| xAI prompt token budget | `ai-optimization` |
| BDD for guards / MCP contracts | `bdd-strategizer` |
| Multi-agent waves | `agent-orchestrator` |
| Structured loops | `looper` |
| Parallel worktrees | `git-worktrees` + `concurrent-cli-agents` |
| Deps / audit | `fix-dependency-security` |
| Reviewable units | `split-to-prs` |

## Self-guards (product + process)

- Cost / token / rate guards before xAI or X calls.
- Fit threshold + pause on low confidence or high-stakes (especially live CV promote).
- Explicit approval in the Tauri UI (and MCP `ask_user` when exposed).
- CV promote: sidecar first, unified diff, backup, never auto-write master.
- xAI structured output for pursue / score / next action; human override when a guard fires.
- Dev: verify-before-done ([AGENTS.md](../AGENTS.md) table), no LLM commit boilerplate.

Use "pause", "guard", "intervention", "self-check" when building decision logic.

## Cursor wiring

Canonical sources: `.agents/`. `.cursor/` is gitignored.

```bash
ln -sfn ../.agents/rules .cursor/rules   # must be the symlink itself, not rules/rules
ln -sfn ../.agents/skills .cursor/skills
mkdir -p .cursor/commands
ln -sfn ../../.agents/commands/session-start.md .cursor/commands/session-start.md
ln -sfn ../../.agents/commands/gate.md .cursor/commands/gate.md
```

See [`.agents/README.md`](../.agents/README.md) if `.cursor/rules/rules` appears.

Always-on rules should stay thin (`dev-loop`, `agent-workflow`, `secrets-agent-safety`). Domain rules use **globs** (`finder-reactor`, `tauri-agentic`). `fusion-sage.mdc` is requestable — say "ignite" to load.

## Conventions

- Repo root for `pnpm`. `cargo` in `src-tauri`.
- Verify: [AGENTS.md](../AGENTS.md) table — `pnpm type-check`, `pnpm verify`, `cargo test` under `src-tauri/src/`, `pnpm gate` for CI parity.
- **Biome / `pnpm lint` / `pnpm precommit` are not in this repo.** Do not invent them.
- React: `react-client-expert` (minimal state, deliberate effects; desktop webview, not RSC).
- Agentic code: every decision point has a guard, pause hook, and user path. Structured output (zod / serde) for xAI "decide next".
- X layer: `.agents/x-resources/skill.md`; align `data/distillation/` with operators + `x_query.rs`.
- CV promote: never mutate an external repo without the user in the loop.
- MCP: search / analyze / prep / promote must be tool-callable (today: Tauri commands).
- After parallel agent runs: worktree gc per `git-worktrees`. Never integrate via `cp`.
- Commits: clean factual messages. Ask before any LLM attribution line.

Stability hotspots (bearer/keyring, `app_dirs`, credential commands, the four invoke names): read STABILITY CONTRACT headers in `src-tauri/src/secrets.rs` and `app_dirs.rs` first. Unrelated refactors have broken these more than any other area.

## Testing

- Rust: `cd src-tauri && cargo test` (secrets, DB, reactor, query validation — no live X token).
- Domain TS: `pnpm verify`.
- Full: `pnpm gate` (mirrors CI).
- Autonomous logic: BDD via `bdd-strategizer` (decision tables for guards).
- Dogfood the app; intervene only on real pauses.

## Multi-session / exponential

Use `agent-orchestrator` + briefs for non-trivial reactor / MCP / CV-guard work. Concurrent slices via `concurrent-cli-agents` + worktrees. Surplus (cheaper future iterations) only in fusion mode.

Slash: `/session-start` (life-os + verify reminder), `/gate` (run full CI parity), `/eva` (emptiness) when the map is thin.
