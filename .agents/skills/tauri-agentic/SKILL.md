---
name: tauri-agentic
description: Patterns for building agentic, MCP-exposed, self-guarded desktop apps in Tauri (Rust backend + React/TS frontend). Expose finder functions as MCP tools, implement guards/pauses in UI and backend, command palette as agent interface, secure key storage, integration with X resources and CV guard. Use when implementing the Tauri shell, reactor UI, or MCP server. Fission for Rust/TS code; fusion for desktop as agent body.
---

# Tauri Agentic — Desktop as Agentic Platform

**Core Mission**: Turn a Tauri app into a first-class agentic environment where a reactor runs with autonomy, but self-guards and pauses are exposed in the UI and via MCP.

## Key Patterns

1. **MCP Server in Tauri**: Rust MCP (stdio or local HTTP). Tools: search, analyze, prep, promote, get_state. Guards on every call; `ask_user` for pauses.

2. **UI as Agent Interface**: Command palette with guard status; dashboard for spend/rate limits; diff viewer for CV promote ([cv-promote-guard](../cv-promote-guard/SKILL.md)).

3. **Backend Guards in Rust**: Central reactor wrapping platform client + LLM calls; structured decisions; secure keyring/file storage for API tokens.

4. **React Frontend**: [react-client-expert](../react-client-expert/SKILL.md) — minimal state, deliberate `invoke` calls, XState or reducer for reactor FSM.

5. **Integration**: Load X skill.md at startup ([x-agent-resources](../x-agent-resources/SKILL.md)); optional xurl shell.

## Guardrails

- All platform/LLM calls go through reactor core.
- MCP tools read-heavy by default; writes guarded.
- Keys never in frontend.
- Tauri capabilities: fs/dialog limited to app data + approved external CV path.

## Related

[finder-reactor](../finder-reactor/SKILL.md), [x-agent-resources](../x-agent-resources/SKILL.md), [cv-promote-guard](../cv-promote-guard/SKILL.md), [react-client-expert](../react-client-expert/SKILL.md), [fusion-sage](../fusion-sage/SKILL.md).

**Example provenance:** [collab-finder](https://github.com/p10ns11y/collab-finder).
