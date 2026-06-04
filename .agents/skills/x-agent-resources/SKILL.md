---
name: x-agent-resources
description: Integration and usage of official X Developer Platform agent resources (llms.txt, skill.md, MCP/XMCP, xurl, OpenAPI) for accurate, smooth, composable X access in collab-finder. Use when building search, analysis, posting, or any X interaction. Ensures we leverage llms/skill for prompt context, MCP for tool exposure, xurl for CLI UX, and follow the spec for our own SKILL/MCP. Fission for implementation details; fusion for how it unifies with finder-reactor and overall agentic design.
---

# X Agent Resources — Official Primitives for X-Powered Agents

**Core Mission**: Make every X interaction in collab-finder correct, efficient, and agent-composable by treating the official X agent resources as first-class citizens — not afterthoughts. This enables exponential value because the finder can be driven by agents (including itself in meta-loops), and development reuses battle-tested specs instead of reinventing.

## Key Resources (Always Reference Fresh or Cached)

- **llms.txt / llms-full.txt** (https://docs.x.com/llms.txt, https://docs.x.com/llms-full.txt): Structured index + full Markdown docs for LLMs. Use to ground xAI prompts on X API capabilities, operators, auth, rates, endpoints.
- **skill.md** (https://docs.x.com/skill.md): agentskills.io spec describing capabilities, actions, params, constraints, workflows, gotchas, verification. Ingest into prompts; use as template for our SKILL.md.
- **MCP Servers**:
  - XMCP (https://github.com/xdevplatform/xmcp): Local MCP server exposing 200+ X API endpoints as tools (with OAuth). Run alongside or integrate patterns.
  - Docs MCP (https://docs.x.com/mcp): Hosted for searching/reading docs via MCP.
- **xurl** (https://github.com/xdevplatform/xurl): Official CLI with auto-auth, shortcuts (xurl search, xurl post), SKILL.md for agents. Shell to it for smooth UX or use as reference impl.
- **OpenAPI Spec**: https://api.x.com/2/openapi.json — for generating clients or feeding agents.
- **Discovery**: .well-known/agent-skills/, etc.

See docs/x-tools.md for full details and how-to (curl, npx skills add, etc.).

## Agent read order (mandatory for X work)

1. [.agents/x-resources/README.md](../../x-resources/README.md) — snapshot vs live, refresh policy.
2. [.agents/x-resources/skill.md](../../x-resources/skill.md) — vendored capability spec (**read first**).
3. This skill (`x-agent-resources`) — collab-finder integration patterns.
4. [data/distillation/](../../../data/distillation/README.md) — app presets (must match operators + skill).
5. Live `https://docs.x.com/...` page from `llms.txt` if API behavior disagrees with snapshot — then run `refresh.sh` and commit.

## Integration Principles

1. **Ingest for Intelligence**: Every xAI call in the finder-reactor MUST include (or reference cached) relevant excerpts from X skill.md + llms context. This prevents hallucinated operators, wrong auth assumptions, rate limit ignorance.
2. **MCP for Composability**: Expose finder functions (search, analyze, prep, promote) as MCP tools. Allow XMCP for direct X ops when richer than our custom client. This makes the whole system usable by Grok, Cursor, etc., without GUI.
3. **xurl for UX & Fallback**: Document and optionally shell to xurl for ad-hoc or when our Rust client needs a trusted path. Its Bubble Tea TUI and token mgmt are models for our Tauri UI.
4. **Follow the Spec**: Our root SKILL.md and any MCP server must be compatible with agentskills.io + X's format so agents discover us reliably.
5. **Self-Guards Apply**: MCP tool calls respect the same guards/pauses as the UI (e.g., no auto-post without approval; fit guards before heavy prep).
6. **Surplus**: Using these resources should yield "cheaper future X interactions" (accurate prompts reduce retries; MCP reduces custom glue code).

## Implementation in collab-finder

- **At startup / refresh**: Load from `.agents/x-resources/` in dev; copy to app data in production. Refresh vendored files via [refresh.sh](../../x-resources/refresh.sh) when upstream changes.
- **In Rust backend (x_client / xai_client)**: Use skill.md knowledge to validate/build queries. Structured prompts always prefix with "Current X capabilities from skill.md: ...".
- **MCP Server**: Implement in Tauri (or sidecar) using MCP protocol. Tools like:
  - search_x_opportunities(query, cv_context)
  - analyze_and_decide(lead)
  - generate_prep_with_guards(lead)
  - promote_with_preview(insights)
- **UI**: Command palette / buttons that map 1:1 to MCP tools for consistency.
- **Prompt Library**: Central place (e.g. src-tauri/src/prompts/x_context.md or generated) that combines X skill + our CV packet + finder state.
- **Testing**: Use bdd-strategizer for "agent calls MCP search, guard fires on low rate, pauses".
- **Dev**: When coding X features, load this skill + xurl/xmcp repos for reference.

## Guardrails Specific to X Resources

- Never assume X API behavior not in the current skill.md/llms (e.g., don't invent endpoints).
- For writes (posts, DMs): always guard + user pause (even if using xurl or XMCP).
- Rate limits: surface from headers or MCP responses; backoff built into reactor.
- Auth: Prefer secure Tauri store; fall back to xurl-style if needed. Never hardcode tokens.
- When running XMCP locally for dev: use allow-list to limit to read/search for safety during testing.

## Activation

- Building X search/prep logic: load x-agent-resources + finder-reactor + ai-optimization (for pruning X posts + skill context).
- Architecture of MCP exposure: fusion-sage + this skill + tauri-agentic.
- Using in prompts or agent calls: reference the official URLs + our SKILL.md.

## Surplus Examples

⚡ X Resources Surplus (Q ≈ 1.5)
By ingesting official skill.md into the analyze step, we avoid 3-5 bad queries per 10 opportunities (invalid operators or rate-unaware calls). Future win: one fetch at startup replaces per-call context bloat, saving ~2k tokens/cycle. Suggested: auto-generate a "X Context Snapshot" skill from llms.txt for even tighter fission.

Track updates in surplus-log or fusion-state.

## Related

- finder-reactor (the consumer of these resources)
- Root SKILL.md (we publish our own following the pattern)
- tauri-agentic (MCP server impl)
- Official: https://docs.x.com/tools/ai , xurl repo, xmcp repo

---

**These resources are the "easy connect" that makes the entire agentic vision possible.** Without them, we'd reinvent X integration poorly. With them, the finder is accurate, composable, and compounds with the broader X agent ecosystem (including this project's own contributions back via our SKILL/MCP).

Always start X-related work with [x-resources/README.md](../../x-resources/README.md) + [skill.md](../../x-resources/skill.md), then this skill.