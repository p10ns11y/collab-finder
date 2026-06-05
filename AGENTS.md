# Agent instructions — collab-finder

**collab-finder** is a highly autonomous, agentic Tauri desktop app (Rust backend + React frontend) for discovering high-fit jobs, collabs, side hustles, and community opportunities on X, using xAI for intelligent analysis, CV tailoring, cover letter generation, research packs, and safe "promote insights" back to the user's devprofile portfolio.

User intervenes only when necessary. The system makes smart decisions with **self-guards, pauses, cost/rate/fit thresholds, and explicit approval gates**.

This project uses a **connected agent skills system** (fission + fusion) + **official X Agent Resources** for exponential, high-value development.

## Agent routing (canonical — read first)

| If you are working on… | Read in order |
|------------------------|---------------|
| **X API, search queries, operators, xAI prompts** | [.agents/x-resources/README.md](.agents/x-resources/README.md) → [.agents/x-resources/skill.md](.agents/x-resources/skill.md) → [.agents/skills/x-agent-resources/SKILL.md](.agents/skills/x-agent-resources/SKILL.md) → [data/distillation/](data/distillation/README.md) |
| **Finder reactor, guards, autonomous cycle** | [.agents/skills/finder-reactor/SKILL.md](.agents/skills/finder-reactor/SKILL.md) + x-resources row above when X is involved |
| **Tauri shell, IPC, `invoke`, history DB** | [.agents/skills/tauri-agentic/SKILL.md](.agents/skills/tauri-agentic/SKILL.md) → [docs/tauri-ipc-and-intent-engine.md](docs/tauri-ipc-and-intent-engine.md) · [docs/tauri-ipc-debugging.md](docs/tauri-ipc-debugging.md) |
| **X bearer storage (keyring vs file)** | [docs/SETUP.md](docs/SETUP.md) (save/read/dual-write) · [docs/tauri-commands.md](docs/tauri-commands.md) (`get_x_bearer_storage`) **+ src-tauri/src/secrets.rs (STABILITY CONTRACT header) + src-tauri/src/app_dirs.rs** — this area has been repeatedly broken by unrelated "storage" or lib.rs refactors (see the giant headers in those files) |
| **CV promote / devprofile** | [.agents/skills/cv-promote-guard/SKILL.md](.agents/skills/cv-promote-guard/SKILL.md) |
| **Architecture / milestones** | [docs/agentic-architecture.md](docs/agentic-architecture.md) |
| **Setup / run / verify** | [docs/SETUP.md](docs/SETUP.md) |

**X snapshots:** upstream changes frequently — vendored copies live under `.agents/x-resources/`; refresh with [.agents/x-resources/refresh.sh](.agents/x-resources/refresh.sh) (see README). Do not treat stale `skill.md` as law if the live API disagrees.

**Cursor local wiring:** `.cursor/` is gitignored; recreate symlinks per [.agents/README.md](.agents/README.md). Canonical sources are always `.agents/`.

## Core Agent Skills System (Fission + Fusion)

- **`ai-optimization`** (fission): Token-efficient pruning, context compression, relevance scoring. Use for fast impl, prompt engineering, large contexts (CV + X posts + X skill.md).
- **`fusion-sage`** (fusion): Synthesis, surplus generation, self-improvement loops, higher-order abstractions (e.g. "FinderReactor", "CVPromoteGuard", "XOpportunityAgent"). Use for architecture, long-term value, agentic design.

**Recommended activation**:
- Normal work: Let auto-decide (fusion-sage routes).
- Architecture / agentic reactor / self-guards / exponential compounding: Say "use fusion" or "ignite".
- Pure speed / token heavy (prompts, Rust impl, CV pruning): "just fission" or load ai-optimization.

See `.agents/skills/fusion-sage/SKILL.md` and `.agents/skills/ai-optimization/SKILL.md`.

## X Agent Resources (First-Class, Official — High Leverage)

Integrated from day 1 ([docs.x.com/tools/ai](https://docs.x.com/tools/ai)). **On any X-related task, read [.agents/x-resources/skill.md](.agents/x-resources/skill.md) first** (downstream snapshot), then follow [.agents/x-resources/README.md](.agents/x-resources/README.md) for refresh vs live docs.

| Resource | Downstream | Upstream |
|----------|------------|----------|
| **skill.md** | `.agents/x-resources/skill.md` | https://docs.x.com/skill.md |
| **llms.txt** (index) | `.agents/x-resources/llms.txt` | https://docs.x.com/llms.txt |
| **Our presets / curation** | `data/distillation/` | App-specific (not X official) |

Also: **XMCP**, **Docs MCP**, **xurl** — see [docs/x-tools.md](docs/x-tools.md) and `x-agent-resources` skill. The finder will expose MCP tools; today use Tauri commands ([docs/tauri-commands.md](docs/tauri-commands.md)).

## Project-Specific Skills (collab-finder)

| When the user (or agent) asks about… | Read |
|-------------------------------------|------|
| Overall finder architecture, self-guards, pauses, autonomous decisions, intervention points | `.agents/skills/finder-reactor/SKILL.md` (core — fusion style with fission pruning) |
| X integration (search, MCP, xurl, official skill/llms ingestion) | `.agents/x-resources/README.md` → `skill.md` → `.agents/skills/x-agent-resources/SKILL.md` |
| Safe CV read/prune + promote insights with diff preview, backups, external devprofile guard | `.agents/skills/cv-promote-guard/SKILL.md` |
| Tauri/Rust + React agentic UI (MCP server exposure, command palette as agent interface, minimal state with reactors) | `.agents/skills/tauri-agentic/SKILL.md` + `react-client-expert` |
| Tauri `invoke` / IPC failures, search/cycle/history not working in dev, bearer or blank window | `.agents/skills/tauri-ipc-debug/SKILL.md` + [docs/tauri-ipc-debugging.md](docs/tauri-ipc-debugging.md) |
| Token-efficient prompts for xAI (CV packet + X posts + X skill.md + opportunity context) | `ai-optimization` (with project reference) |
| BDD/TDD for autonomous features (self-guards, decision logic, MCP contracts) | `bdd-strategizer` |
| Orchestration (briefs for sub-features, verify-before-merge, iterative agent waves) | `agent-orchestrator` |
| Git worktrees for concurrent agent dev of reactor parts | `git-worktrees` + `concurrent-cli-agents` |
| Supply chain, deps (Tauri, pnpm, Rust crates, MCP), audits | `fix-dependency-security`, `audit-allow-builds`, `supply-chain-harden` |
| Splitting work into reviewable units | `split-to-prs` |

## Agent Workflow (Triage + Self-Guards First)

**Always triage first** (read `agent-orchestrator`):
- Single-shot (≤2 files, obvious): direct + verify (`pnpm build`, `cd src-tauri && cargo check && cargo test`; see [docs/SETUP.md](docs/SETUP.md) — `type-check`/`lint` scripts not in package.json yet). For anything touching Tauri commands, lib.rs, or data/secret paths, treat as "not single-shot" and run the full test + (ideally) manual credentials panel check.
- Light: short bullets + implement.
- Full: briefs, worktrees if multi-session, independent verification.

**Self-guards & pauses (built into the product + dev process)**:
- Cost / token / rate limit guards before xAI or X calls.
- Fit score threshold + "pause for user" on low-confidence or high-stakes (e.g. promote to live portfolio CV).
- Explicit approval gates in the Tauri UI (and MCP "ask_user" tool).
- CV promote: always sidecar first, unified diff preview, backup, never auto-write master without confirmation.
- "Smart and intelli decisions": xAI structured output for "pursue? score? next action?" with reasoning; human override only when guard triggers.
- Dev process: verify-before-done, pre-commit checks (see rules), no LLM boilerplate in commits.

Use "pause", "guard", "intervention", "self-check" in prompts when building decision logic.

## Cursor / IDE Setup (High Standard from Beginning)

Rules live in `.agents/rules/` (canonical). Cursor loads via **one** symlink:

```bash
ln -sfn ../.agents/rules .cursor/rules   # .cursor/rules must NOT be a directory named rules/rules
```

Enable: `fusion-sage.mdc` (alwaysApply), `finder-reactor.mdc`, `tauri-agentic.mdc`, etc. — see `.agents/rules/`.

Auto-load skills (one symlink per skill under `.cursor/skills/`):

```bash
mkdir -p .cursor/skills
ln -sfn ../../.agents/skills/fusion-sage .cursor/skills/fusion-sage
ln -sfn ../../.agents/skills/finder-reactor .cursor/skills/finder-reactor
ln -sfn ../../.agents/skills/tauri-ipc-debug .cursor/skills/tauri-ipc-debug
# ... etc
```

See [.agents/README.md](.agents/README.md) if `.cursor/rules/rules` appears (nested symlink mistake).

Grok Build / agents: Prefix with `/fusion-sage`, `/fission`, or just load via AGENTS.md. Use subagent-delegation, spawn_subagent for complex finder features.

## Conventions (Tailored for Tauri + pnpm + Rust + X + Agentic)

- Repo root for commands.
- Prefer `pnpm` (lockfile present).
- After changes: `pnpm install`, audit if deps changed, `pnpm build`, `cd src-tauri && cargo check`. For **any edit under `src-tauri/src/`** you must also run `cd src-tauri && cargo test` (this exercises the secrets/keyring harness, DB, and the dual-write invariants that have repeatedly regressed).
  - Special rule for stability hotspots (bearer/keyring, app_dirs, credential commands in lib.rs, the 4 invoke names): see the giant "STABILITY CONTRACT" headers in `src-tauri/src/secrets.rs` and `src-tauri/src/app_dirs.rs`. These have been broken by "unrelated" work (tweet content storage policy, db schema, "clean up lib.rs", broad storage refactors) more than any other area. Always grep + read the headers first. Verify by running the app and inspecting the X Connection panel's keyring status after the change.
- **Lint/Format**: Biome planned (devprofile policy); not in `package.json` yet. Rust: `cargo fmt` + `cargo clippy`.
- **React client**: follow `react-client-expert` (minimal state, deliberate effects; no RSC for UI logic — this is desktop webview).
- **Agentic code**: Every decision point must have self-guard (threshold, pause hook, log + user intervention path). Use structured output (zod in TS, serde in Rust) for xAI "decide next".
- **X layer**: Read `.agents/x-resources/skill.md` (refresh when upstream drifts). Align `data/distillation/` queries with operators doc + `x_query.rs`. Prefer xurl/XMCP patterns per `x-agent-resources` skill.
- **CV promote**: Strict guard — sidecar + preview + explicit confirm. Never mutate external repo without user in loop.
- **MCP exposure**: Core finder functions (search, analyze, prep, promote) must be callable as tools (for this env + future agents).
- After agent runs (execute-plan, subagents, concurrent): run `grok worktree gc` + cleanup scripts. Use worktrees for parallel reactor development.
- Commit hygiene: Clean factual messages. No LLM attribution boilerplate unless user confirmed the exact LLM in context.

Run `pnpm` / `cargo` in the appropriate subdir (src-tauri for Rust).

## E2E / Testing (Agentic Features)

- Tauri has its own test story (future: use Playwright against the webview or Tauri-specific).
- For the autonomous logic: heavy BDD via `bdd-strategizer` (decision tables for guards, "pause on low fit", MCP contracts).
- Manual "dogfood" the app as the primary user (you intervene only on real pauses).

## Long-Running / Exponential Development

- Use `agent-orchestrator` + briefs for any non-trivial feature (the finder reactor, MCP server, CV guard).
- Concurrent development via `concurrent-cli-agents` + git worktrees (isolate Rust vs React vs prompt engineering).
- Self-improvement: After every major task, generate surplus (cheaper future finder iterations, better guard patterns).
- The app itself is the "exponential value engine": once the agentic core (reactor + guards + MCP) is in, development of features (new search strategies, better prep, community collabs) compounds because agents can drive it.

See `agent-orchestrator` skill and `git-worktrees` skill for workflow patterns.

## Agent Attribution & Hygiene

Same strict rule as devprofile: clean factual commits. Ask before any LLM boilerplate.

---

**This setup is designed so that within a few days of agentic work (you + me + subagents), the project yields REALLY high autonomous value**: a self-guarded, pause-aware, xAI + X MCP-powered opportunity reactor that prepares everything for you with minimal intervention, while the *development process itself* feels exponential (fission speed + fusion compounding + official X agent primitives).

Load the fusion rule. Say "ignite" for the reactor design. Let's make it unstoppable.

See [.agents/README.md](.agents/README.md), the [agent routing](#agent-routing-canonical--read-first) table above, and [.agents/x-resources/README.md](.agents/x-resources/README.md).