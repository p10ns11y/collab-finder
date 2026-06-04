# Distillation data — collab-finder

Curated, agent-readable artifacts for X search and LLM analyze (SpaceXAI-targeted). **Source of truth** for presets and prompts; the UI imports `x-search/queries.json`.

| Path | Purpose |
|------|---------|
| [curation/profile-and-strategy.md](./curation/profile-and-strategy.md) | Positioning, geo priorities, platforms (non-X) |
| [x-search/operators.md](./x-search/operators.md) | Valid v2 operators only — do not guess |
| [x-search/queries.json](./x-search/queries.json) | Qualified search presets + default CV packet |
| [prompts/xai-analyze-opportunity.md](./prompts/xai-analyze-opportunity.md) | Structured analyze template for reactor/xAI |
| [prompts/cv-packet-pruned.md](./prompts/cv-packet-pruned.md) | Pruned CV grounding for prompts |

Official X operator reference: https://docs.x.com/x-api/posts/search/integrate/operators

Rust validates queries via `src-tauri/src/x_query.rs` before any API call.

## Related docs (repo root)

| Doc | Why it matters for distillation |
|-----|--------------------------------|
| [docs/SETUP.md](../../docs/SETUP.md) | Run the app, bearer storage, verify |
| [docs/agentic-architecture.md](../../docs/agentic-architecture.md) | How presets/cycle/history fit the reactor |
| [docs/tauri-commands.md](../../docs/tauri-commands.md) | Commands that consume queries + CV packet |
| [docs/tauri-ipc-and-intent-engine.md](../../docs/tauri-ipc-and-intent-engine.md) | MVU → `invoke` → Rust (no HTTP for commands) |
| [docs/tauri-ipc-debugging.md](../../docs/tauri-ipc-debugging.md) | Trace `invoke` in dev (terminal + safe-invoke) |
| [docs/x-tools.md](../../docs/x-tools.md) | Official X skill/llms for prompt context |
| [README.md](../../README.md) | Project overview and doc index |
