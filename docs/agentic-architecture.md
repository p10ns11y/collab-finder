# Agentic Architecture — collab-finder

See root .agents/skills/agentic-reactor/SKILL.md (overarching), finder-reactor, tauri-agentic, x-agent-resources, cv-promote-guard for full details.

## Principles
- Autonomy with self-guards/pauses (no silent high-stakes actions).
- Smart decisions via structured xAI (confidence, guards, rationale).
- MCP composability (agents drive the reactor).
- X official resources first-class (ingest skill.md/llms for accuracy).
- CV promote always guarded (sidecar, diff, confirm).
- Surplus after every cycle/ change for exponential compounding.
- Fission (prune, tight code) + Fusion (synthesis, living reactor).

## Components
- Rust: finder_reactor.rs (state machine, guards, X context load, MCP tools stubs).
- Tauri: commands expose reactor; secure storage; capabilities scoped.
- React: command palette, guard dashboard, pause surfaces, autonomous trigger (minimal state).
- .agents/: full skills/rules for dev (load via fusion-sage.mdc etc.); X resources in .agents/x-resources/.
- MCP: Tauri commands + future stdio/HTTP server for "ask_user" pauses etc.

## Self-Guards Examples (implemented in reactor)
- Cost: before xAI est.
- XRate: from skill knowledge + headers.
- Fit: threshold pause.
- CV: delegate to cv-promote-guard (sidecar only until confirm).

## Pauses/Intervention
- UI: modals/toasts/notifs.
- MCP: special pause responses.
- Log all for meta-surplus.

## Next (exponential)
- Real xAI calls with full context (CV prune + X skill prefix).
- Full prep artifacts, background daemon.
- Real MCP server (tauri plugin or axum).
- Use bdd-strategizer for guard tests.
- Subagents/worktrees for parallel features.

This setup ensures from day 1 the project is the "living agent" you described: high autonomy, value compounds via real use + dev feedback loops.
