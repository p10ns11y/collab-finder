# collab-finder

**Highly autonomous, agentic X opportunity finder** (Tauri desktop). Self-guarded reactor with pauses, smart decisions (xAI structured), MCP exposure for agents (Grok/Cursor/etc can drive "run hunt, pause on low fit or CV promote"). User intervenes only on guards.

Live guarded autonomous cycles, X skill.md/llms context baked in, CV promote via sidecar+preview+confirm (cv-promote-guard), full query control.

See .agents/ (AGENTS.md, SKILL.md, finder-reactor/agentic-reactor/x-agent-resources/cv-promote-guard/tauri-agentic skills, rules) + docs/x-tools.md for the high-standard agentic foundation from day 1. Development compounds exponentially (fusion surplus, subagents, bdd for guards).

## Quick Start (agentic dev ready)

```bash
cd ~/Work/personal/collab-finder
pnpm install
# (cargo tauri if needed)
pnpm tauri dev
```

- Provide temp X Bearer in UI.
- Use ⌘K palette or "Run Autonomous Cycle" for guarded hunt (uses X resources, applies cost/rate/fit/CV guards, surfaces pauses).
- Configure devprofile path in future for real CV grounding + guarded promote.

## Architecture (per agentic-reactor + friends)

- **FinderReactor (Rust core)**: State in app_data, guards (Cost/XRate/Fit/CVPromote), X via x-agent-resources (skill.md context + low-level search), stub xAI decisions (real soon: pruned CV + X skill prefix), MCP tools (run_finder_cycle, promote_lead, get_reactor_state).
- **Tauri Shell**: React minimal UI (command palette as agent iface, guard dashboard, pause modals, autonomous button).
- **Autonomy**: Loop with self-guards/pauses; only intervene on low conf/high stakes/CV. Surplus after cycles.
- **Exponential**: MCP so agents drive it; .agents/ skills for us (load fusion + finder-reactor when building); X official resources prevent reinvention.

Full setup follows devprofile's connected fission/fusion + X agent resources (llms.txt, skill.md, MCP, xurl) for composable, high-value autonomy.

Private tool for p10ns11y. See session plan for full vision.
