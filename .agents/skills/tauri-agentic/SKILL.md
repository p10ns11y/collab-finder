---
name: tauri-agentic
description: Patterns for building agentic, MCP-exposed, self-guarded desktop apps in Tauri (Rust backend + React/TS frontend). Includes exposing hunter functions as MCP tools, implementing guards/pauses in UI and backend, command palette as agent interface, secure storage for keys, integration with X resources and CV guard. Use when implementing the Tauri shell, UI for reactor, or MCP server. Follows react-client-expert for frontend. Fission for specific Rust/TS code; fusion for how the desktop becomes the "agent body" for the hunter-reactor.
---

# Tauri Agentic — Desktop as Agentic Platform for the Hunter

**Core Mission**: Turn the Tauri app into a first-class agentic environment where the hunter-reactor runs with full autonomy (background scans, smart decisions), but with built-in self-guards and pauses exposed naturally in the UI and via MCP. This makes the desktop the perfect "body" for the agent: rich views for humans, tool interface for other agents.

## Key Patterns

1. **MCP Server in Tauri**:
   - Use Rust to implement MCP stdio or local HTTP server (tauri can spawn or use hyper/axum in a plugin).
   - Expose tools: search_x_opportunities, analyze_and_decide, generate_prep_with_guards, promote_with_preview, get_reactor_state.
   - Guards: every tool call goes through hunter-reactor guards (cost, fit, CV).
   - For "ask user": MCP can return a special "pause" response that the client (Grok) handles by surfacing to human.

2. **UI as Agent Interface**:
   - Command palette (cmd+k) that lists reactor actions, with guard status indicators (e.g., "Search (rate: 80% ok, cost est low)").
   - Visual guards: dashboard shows current spend, rate limits, pending pauses.
   - Prep views: letter editor with "apply guard" buttons, diff viewer for CV promote (using cv-promote-guard).
   - "Autonomous mode" toggle: runs background reactor loop (with pauses surfacing as notifications/dialogs).

3. **Backend Guards in Rust**:
   - Central HunterReactor struct that wraps X client (using x-agent-resources), xAI calls (with pruning), state (leads, preps in app_data_dir JSON).
   - Every decision: structured output from xAI, then apply guards (e.g., if fit < threshold { return Pause(Reason::LowFit) }).
   - Secure keys: tauri-plugin-keyring or store for X bearer, xAI key.
   - CV: use cv-promote-guard module for all reads/writes to devprofile path.

4. **React Frontend (client-only, per react-client-expert)**:
   - Minimal state: use XState or simple reducer for reactor state machine (searching -> analyzing -> deciding -> paused -> prepping).
   - No heavy effects; deliberate calls to invoke(tauriCommand).
   - Tailwind + shadcn-like for clean dashboard (cards for leads with score badges, guard icons).
   - MCP client side if needed for in-app agent comms.

5. **Self-Guards & Pauses in App**:
   - Cost guard: track tokens/$ in state, pause if > budget (user sets in settings).
   - Rate guard: monitor X headers, backoff.
   - Fit guard: don't auto-prep below threshold; surface in "review queue".
   - CV guard: promote always via cv-promote-guard flow (sidecar, preview, confirm).
   - Pause UI: modal or toast "Agent paused: Low confidence on this lead. Review? [Proceed] [Tweak query] [Ignore]".
   - Logging: all decisions to app data for audit/surplus.

6. **Integration with X Resources**:
   - At app start: fetch or use cached X skill.md / llms for prompt context (via x-agent-resources).
   - Option to use xurl binary if installed (shell from Rust with tauri::api::shell).
   - MCP exposure allows agents to use XMCP indirectly or directly.

## Implementation in collab-finder

- Rust: src-tauri/src/hunter_reactor.rs (state machine, guards, MCP tools).
- Commands: invoke handlers that delegate to reactor with guard checks.
- MCP: simple implementation using rmcp or custom (for v1, local HTTP on localhost:port with MCP JSON-RPC).
- UI: src/App.tsx enhanced with reactor views, using the skill's patterns.
- Startup: load config (devprofile_path, budgets), init reactor, optional background task (with pause on guards).

## Guardrails

- All X/xAI calls go through reactor (no direct calls from UI or elsewhere).
- MCP tools are read-heavy by default; writes guarded.
- UI must surface pauses immediately; no silent auto-actions on high-stakes.
- Keys never in frontend; only via secure invoke.
- Follow tauri security: capabilities for fs/dialog limited to app data + approved devprofile path.

## Surplus

⚡ Tauri Agentic Surplus (Q ≈ 1.6)
Wrapping the reactor in Tauri + MCP means agents (Grok in this chat, or Cursor) can drive full hunts without the user opening the app every time, while the UI provides rich pause/review when needed. This compounds: one agent run surfaces 5 opportunities, user reviews pauses in 2min, prep is done. Future: background autonomous mode with daily digest via MCP notification. Suggested follow-up: add tauri-plugin for system tray "hunter status" with quick pause/ resume.

## Related

- hunter-reactor (the logic this shells)
- x-agent-resources (X integration in the app)
- cv-promote-guard (CV flows in UI/MCP)
- react-client-expert (frontend discipline)
- fusion-sage (for the "desktop as agent body" abstraction)

## Activation

When building Tauri parts or MCP: load tauri-agentic + hunter-reactor + x-agent-resources.

In code: ensure guards are in the Rust core, not bolted on.

---

**The Tauri app is not just a pretty frontend for a CLI tool — it is the agentic platform that makes the hunter usable by humans and agents alike, with self-guards baked into the experience.** This setup ensures autonomy feels safe and exponential.

Build the shell around the reactor following these patterns from day one.
