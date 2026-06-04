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
