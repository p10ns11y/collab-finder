# Distillation data — collab-finder

Curated, agent-readable artifacts for X search and LLM analyze (SpaceXAI-targeted). **Source of truth** for presets and prompts; the UI imports `x-search/queries.json`.

| Path | Purpose |
|------|---------|
| [curation/profile-and-strategy.md](./curation/profile-and-strategy.md) | Positioning, geo priorities, platforms (non-X) |
| [x-search/operators.md](./x-search/operators.md) | Valid v2 operators only — do not guess |
| [x-search/queries.json](./x-search/queries.json) | Qualified search presets + default CV packet |
| [cv-packet-distilled.txt](./cv-packet-distilled.txt) | General distilled CV (~6k chars; PDF + projects; synced to `queries.json` + Rust IPC fallback) |
| [cv-packet-agent-distilled.txt](./cv-packet-agent-distilled.txt) | Agent-optimized context packet (MVU/Tauri/OSS focus; for reactor/MCP — not app default) |
| [prompts/cv-packet-agent.md](./prompts/cv-packet-agent.md) | When to use agent vs general CV packet |
| [public-projects.json](./public-projects.json) | Pruned public GitHub repos for CV/agent grounding (re-prune raw API dump via `scripts/prune-public-projects.mjs`) |
| [prompts/xai-analyze-opportunity.md](./prompts/xai-analyze-opportunity.md) | Structured analyze template for reactor/xAI |
| [prompts/cv-packet-pruned.md](./prompts/cv-packet-pruned.md) | Pruned CV grounding for prompts |

Official X operator reference: https://docs.x.com/x-api/posts/search/integrate/operators

**X agent snapshots (upstream):** [.agents/x-resources/README.md](../../.agents/x-resources/README.md) → [skill.md](../../.agents/x-resources/skill.md) before changing queries or prompts. Refresh: `../../.agents/x-resources/refresh.sh`.

Rust validates queries via `src-tauri/src/x_query.rs` before any API call.

## Related docs (repo root)

| Doc | Why it matters for distillation |
|-----|--------------------------------|
| [docs/SETUP.md](../../docs/SETUP.md) | Run the app, bearer storage, verify |
| [docs/agentic-architecture.md](../../docs/agentic-architecture.md) | How presets/cycle/history fit the reactor |
| [docs/tauri-commands.md](../../docs/tauri-commands.md) | Commands that consume queries + CV packet |
| [docs/tauri-ipc-and-intent-engine.md](../../docs/tauri-ipc-and-intent-engine.md) | MVU → `invoke` → Rust (no HTTP for commands) |
| [docs/tauri-ipc-debugging.md](../../docs/tauri-ipc-debugging.md) | Trace `invoke` in dev (terminal + safe-invoke) |
| [docs/x-tools.md](../../docs/x-tools.md) | XMCP, xurl, discovery links |
| [.agents/x-resources/README.md](../../.agents/x-resources/README.md) | Vendored skill.md / llms.txt + refresh |
| [README.md](../../README.md) | Project overview and doc index |
