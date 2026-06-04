# collab-finder

**Agentic X opportunity finder** (Tauri desktop): self-guarded reactor, MVU React shell, secure X credentials, and a path to MCP + xAI autonomy. You intervene when guards fire — not on every step.

## Quick start

```bash
pnpm install
pnpm tauri dev
```

Full prerequisites, credential flow, and verify commands: **[docs/SETUP.md](docs/SETUP.md)**.

1. Open **X connection**, paste your app Bearer token, **Save to keychain** (stored in Rust — not kept in UI state).
2. Use the search workspace for **live** recent search (`search_x_recent`).
3. **Run autonomous cycle** — live X search via `guarded_search`, heuristic analyze (xAI planned); tweets + sqlite history.
4. **History & Lookup** panel — stats, past searches, deduped leads (survives restart).
5. Command palette (⌘K) and guard/pause panels surface intervention points.

## Architecture (short)

| Layer | Location |
|-------|----------|
| MVU UI + guards | `src/core/finder/`, `src/view/`, `src/components/finder/` |
| Tauri bridge | `src/adapters/tauri/`, `src/ports/` |
| Live X search + secrets | `src-tauri/src/lib.rs`, `secrets.rs` |
| Durable history (SQLite) | `src-tauri/src/db.rs`, `HistoryDashboard` |
| Reactor + guards (Rust) | `src-tauri/src/finder_reactor.rs` |

**Tauri commands today** (15 handlers; MCP server planned): credentials (`has_x_bearer`, `set_x_bearer`, `clear_x_bearer`), finder/reactor (`search_x_recent`, `run_finder_cycle_cmd`, `get_reactor_state`, `promote_lead`), history/audit (`get_search_history`, `get_search_run`, `get_leads`, `get_dashboard_stats`, `get_recent_pauses`, `get_events`, `search_past_tweets`, `log_event`). Full table: **[docs/tauri-commands.md](docs/tauri-commands.md)**.

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/SETUP.md](docs/SETUP.md) | Install, credentials, verify, Arch notes |
| [docs/agentic-architecture.md](docs/agentic-architecture.md) | System map, mermaid, milestone matrix |
| [docs/tauri-commands.md](docs/tauri-commands.md) | All 15 `invoke` handlers |
| [docs/tauri-ipc-and-intent-engine.md](docs/tauri-ipc-and-intent-engine.md) | IPC Intent Engine, Arch/Linux |
| [docs/tauri-ipc-debugging.md](docs/tauri-ipc-debugging.md) | Dev: intercept and debug `invoke` |
| [.agents/skills/tauri-ipc-debug/](.agents/skills/tauri-ipc-debug/SKILL.md) | Agent skill: layer-by-layer IPC triage |
| [docs/x-tools.md](docs/x-tools.md) | Official X agent resources |
| [data/distillation/README.md](data/distillation/README.md) | Search presets, curation, analyze prompts (UI source) |

Diagrams in-repo; interactive architecture canvas is Cursor-only — see [agentic-architecture.md](docs/agentic-architecture.md).

## Agent / dev resources

- **AGENTS.md** — skills index, triage, conventions
- **docs/x-tools.md** — official X llms.txt, skill.md, XMCP, xurl
- **.agents/skills/** — finder-reactor, tauri-agentic, cv-promote-guard, x-agent-resources, fusion-sage

Private tool for p10ns11y.
