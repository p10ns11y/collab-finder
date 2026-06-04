# Agent instructions — collab-finder

**collab-finder** is a highly autonomous, agentic Tauri desktop app (Rust backend + React frontend) for discovering high-fit jobs, collabs, side hustles, and community opportunities on X, using xAI for intelligent analysis, CV tailoring, cover letter generation, research packs, and safe "promote insights" back to the user's devprofile portfolio.

User intervenes only when necessary. The system makes smart decisions with **self-guards, pauses, cost/rate/fit thresholds, and explicit approval gates**.

This project uses a **connected agent skills system** (fission + fusion) + **official X Agent Resources** for exponential, high-value development.

## Core Agent Skills System (Fission + Fusion)

- **`ai-optimization`** (fission): Token-efficient pruning, context compression, relevance scoring. Use for fast impl, prompt engineering, large contexts (CV + X posts + X skill.md).
- **`fusion-sage`** (fusion): Synthesis, surplus generation, self-improvement loops, higher-order abstractions (e.g. "FinderReactor", "CVPromoteGuard", "XOpportunityAgent"). Use for architecture, long-term value, agentic design.

**Recommended activation**:
- Normal work: Let auto-decide (fusion-sage routes).
- Architecture / agentic reactor / self-guards / exponential compounding: Say "use fusion" or "ignite".
- Pure speed / token heavy (prompts, Rust impl, CV pruning): "just fission" or load ai-optimization.

See `.agents/skills/fusion-sage/SKILL.md` and `.agents/skills/ai-optimization/SKILL.md`.

## X Agent Resources (First-Class, Official — High Leverage)

Integrated from day 1 (https://docs.x.com/tools/ai):
- **llms.txt / llms-full.txt**: Fetch and use as structured context for xAI (X API operators, auth, rate limits, endpoints, best practices).
- **skill.md**: The canonical agentskills.io capability spec for X (actions, params, constraints, workflows, gotchas, checklists). Ingest into every xAI prompt. Template for *this project's own* SKILL.md.
- **MCP (XMCP + Docs MCP)**: XMCP exposes 200+ X API endpoints as callable tools (with OAuth). Docs MCP for live doc search. The app itself will expose finder tools via MCP (search + prep + promote) so agents (Grok, Cursor, future) can drive it.
- **xurl**: Official CLI with smooth auth, token storage, shortcuts (`xurl search`, `xurl post`). Has its own SKILL.md. App can shell to it for UX or fall back; use its patterns for our X layer.

**Philosophy alignment**: "Easy to connect X, read and writing smooth". The finder is not a silo — it is a composable agent skill in the X + xAI ecosystem.

See `docs/x-tools.md`, `docs/SETUP.md`, `docs/agentic-architecture.md`, and `.agents/skills/x-agent-resources/SKILL.md`.

## Project-Specific Skills (collab-finder)

| When the user (or agent) asks about… | Read |
|-------------------------------------|------|
| Overall finder architecture, self-guards, pauses, autonomous decisions, intervention points | `.agents/skills/finder-reactor/SKILL.md` (core — fusion style with fission pruning) |
| X integration (search, MCP, xurl, official skill/llms ingestion) | `.agents/skills/x-agent-resources/SKILL.md` |
| Safe CV read/prune + promote insights with diff preview, backups, external devprofile guard | `.agents/skills/cv-promote-guard/SKILL.md` |
| Tauri/Rust + React agentic UI (MCP server exposure, command palette as agent interface, minimal state with reactors) | `.agents/skills/tauri-agentic/SKILL.md` + `react-client-expert` |
| Token-efficient prompts for xAI (CV packet + X posts + X skill.md + opportunity context) | `ai-optimization` (with project reference) |
| BDD/TDD for autonomous features (self-guards, decision logic, MCP contracts) | `bdd-strategizer` |
| Orchestration (briefs for sub-features, verify-before-merge, iterative agent waves) | `agent-orchestrator` |
| Git worktrees for concurrent agent dev of reactor parts | `git-worktrees` + `concurrent-cli-agents` |
| Supply chain, deps (Tauri, pnpm, Rust crates, MCP), audits | `fix-dependency-security`, `audit-allow-builds`, `supply-chain-harden` |
| Splitting work into reviewable units | `split-to-prs` |

## Agent Workflow (Triage + Self-Guards First)

**Always triage first** (read `agent-orchestrator`):
- Single-shot (≤2 files, obvious): direct + verify (cargo check, pnpm type-check/lint/build, tauri check).
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

Rules live in `.agents/rules/` (canonical). Cursor loads via `.cursor/rules` → `.agents/rules`.

Enable:
- `fusion-sage.mdc` (alwaysApply: true) — routes fission/fusion + agentic surplus.
- Project-specific: `finder-reactor.mdc`, `tauri-agentic.mdc` (see `.agents/rules/` for the full list).

Auto-load skills:
```bash
mkdir -p .cursor/skills
# Symlink core + custom (run after creating skills)
ln -sf ../.agents/skills/ai-optimization .cursor/skills/ai-optimization
ln -sf ../.agents/skills/fusion-sage .cursor/skills/fusion-sage
ln -sf ../.agents/skills/finder-reactor .cursor/skills/finder-reactor
# ... etc for others
```

Grok Build / agents: Prefix with `/fusion-sage`, `/fission`, or just load via AGENTS.md. Use subagent-delegation, spawn_subagent for complex finder features.

## Conventions (Tailored for Tauri + pnpm + Rust + X + Agentic)

- Repo root for commands.
- Prefer `pnpm` (lockfile present).
- After changes: `pnpm install`, audit if deps changed, `pnpm build`, `cd src-tauri && cargo check` (add `cargo clippy` when tightening Rust).
- **Lint/Format**: Biome planned (devprofile policy); not in `package.json` yet. Rust: `cargo fmt` + `cargo clippy`.
- **React client**: follow `react-client-expert` (minimal state, deliberate effects; no RSC for UI logic — this is desktop webview).
- **Agentic code**: Every decision point must have self-guard (threshold, pause hook, log + user intervention path). Use structured output (zod in TS, serde in Rust) for xAI "decide next".
- **X layer**: Always respect official skill.md constraints. Prefer patterns from xurl/XMCP. Ingest llms/skill for prompts.
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

See `.agents/README.md`, individual SKILL.md files, and the X resources docs.