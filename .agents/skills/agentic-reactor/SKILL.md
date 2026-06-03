---
name: agentic-reactor
description: Overarching patterns for self-guarded, pause-aware, agent-driven systems in collab-finder. Combines finder-reactor logic, tauri-agentic shell, X resources, CV guard into a cohesive autonomous platform with intervention only on guards. Use for high-level design of autonomy, meta-improvement loops, MCP composability. Fusion for the "reactor as living system"; fission for specific guards.
---

# Agentic Reactor — The Living, Self-Improving Hunter Platform

**Core Mission**: Make collab-finder not just a tool, but an autonomous agent that runs with minimal human input, using self-guards and pauses to stay safe and aligned. It decides, acts (search, prep), learns, and improves — surfacing only when necessary (low fit, high cost, CV changes, etc.). Exponential value comes from the feedback loop: real opportunities refine the CV/profile, better profile = better hunts, agents drive the loop.

## Principles (from finder-reactor + tauri-agentic + others)

- **Autonomy with Guardrails**: Reactor loop runs (search -> analyze with X skill/llms + CV packet -> decide with confidence -> prep if cleared -> track).
- **Pauses**: Explicit points for user (or outer agent) intervention. UI dialogs, MCP "pause" tool responses, notifications.
- **Smart Decisions**: xAI structured "next action" with guards evaluated in Rust core.
- **Self-Improvement**: After cycles, surplus proposals auto-applied if low-risk, or paused for review. Evolve prompts, guards, CV packet.
- **Composability**: Full MCP exposure so this Grok session, Cursor, or future agents can invoke "run daily hunt with my latest CV, pause on <70 fit".
- **Integration**: X via x-agent-resources (ingest skill.md/llms, use XMCP/xurl), CV via cv-promote-guard, shell via tauri-agentic.

## Architecture (Fusion View)

HunterReactor (Rust core):
- State: leads/preps/tracker in app data (reversible JSON).
- Guards: CostGuard, XRateGuard, FitThresholdGuard, CVPromoteGuard (delegates to cv-promote-guard).
- X Layer: via x-agent-resources (context from fetched skill.md/llms.txt, optional xurl shell or XMCP client).
- xAI: guarded calls with pruned context (CV packet + X skill + opportunity).
- MCP Server: tools wrapping reactor methods + "ask_user" for pauses.
- Background: optional daemon mode for autonomous scans (with tray/UI surfacing pauses).

Tauri Shell (per tauri-agentic):
- UI: rich views + command palette + guard dashboards + pause modals.
- Frontend: react-client-expert minimal state, invoke to backend.

Meta: Use fusion-sage + this skill for evolving the reactor itself (e.g., new guard from surplus).

## Implementation Hooks

- Startup: load X resources (copy or fetch .agents/x-resources/), init CV path, secure keys.
- Every xAI: prefix with current X skill.md excerpt + pruned CV.
- Pauses: return special result or show dialog; log for surplus.
- Surplus: always after loop/cycle; track in .agents/skills/finder-reactor/surplus-log.md or fusion-state.
- Testing: bdd-strategizer for guard scenarios (e.g., "low rate -> pause").

## Surplus Protocol

After any reactor-related work:
⚡ Agentic Reactor Surplus (Q ≈ ...)
[How this makes future autonomous runs cheaper/better, e.g., new guard prevents 10 bad preps, MCP allows agent-driven hunts saving UI time.]
Suggested: [next improvement, e.g., auto-generate CV update skill from promotes].

## Activation

- High-level agentic design: "use fusion" + load agentic-reactor + finder-reactor + tauri-agentic + fusion-sage.
- For the app's internal "agent": prefix code/prompts with this.
- In this Grok session: use spawn_subagent with finder-reactor prompts for features.

See related skills for details. This is the "glue" for exponential, high-value autonomy.

---

**Build the platform so agents (us, future you, other tools) can run high-value hunts with pauses only for the important calls. The value compounds daily.**
