# collab-finder

**Agentic X opportunity finder** (Tauri desktop): self-guarded reactor, MVU React shell, secure X + xAI credentials, and a path to MCP autonomy. You intervene when guards fire — not on every step.

## Prerequisites

| Tool | Notes |
|------|--------|
| **Node.js** | LTS recommended |
| **pnpm** | `corepack enable` or install globally |
| **Rust** | Stable toolchain + `cargo` |
| **Tauri v2 system deps** | Linux: GTK/WebKit, `libsecret`/keyring. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). |

Arch/Linux detail, credential storage, and troubleshooting: **[docs/SETUP.md](docs/SETUP.md)**.

## Quick start

```bash
pnpm install
pnpm tauri dev
```

First launch opens **Discover** (opportunity rail + Quick Target). Sidebar nav: **Discover · Xplore · Settings**.

## First-run tour

### Settings — credentials

1. Open **Settings** in the sidebar.
2. **X connection** — paste your app Bearer token, **Save credentials**. Token is stored in Rust (not kept in UI state). Panel shows keyring vs file fallback via `get_x_bearer_storage`.
3. **xAI key** — paste your xAI API key for Quick Target analyze/prep on Discover. Same keyring/file pattern via `get_xai_key_storage`.

### Discover — opportunities + Quick Target

1. **Your Opportunities** rail (left) — persisted job rows from SQLite; click to hydrate fit + prep from stored blobs (no new xAI call).
2. **CV summary** — grounds analyze/prep; persisted in localStorage.
3. **Quick Target** — paste a job URL or JD, **Evaluate fit** (live xAI), then **Generate prep**. Optimistic row appears in the rail; server reconciles on refresh.

### Xplore — live X search + reactor cycle

1. **Search workspace** — live recent search (`search_x_recent`).
2. **Run autonomous cycle** — live X search via `guarded_search`, heuristic analyze in the reactor (xAI structured decisions for the cycle path are still planned); tweets + SQLite history.
3. Stats, raw history tables, and archive lookup are **not** in the sidebar today — use the command palette (⌘K / Ctrl+K) for search, cycle, presets, and history refresh where wired.

## Verify

```bash
pnpm build
cd src-tauri && cargo check
cd src-tauri && cargo test
```

`cargo test` covers secrets, db, reactor, and query validation (no live X token required). `package.json` does not yet define `type-check`, `lint`, or `precommit` scripts (see **AGENTS.md** for planned checks).

## Architecture (short)

| Layer | Location |
|-------|----------|
| MVU UI + guards | `src/core/finder/`, `src/view/`, `src/components/finder/` |
| Discover / Xplore / Settings screens | `src/view/screens/`, `src/components/layout/sidebar-nav.tsx` |
| Tauri bridge | `src/adapters/tauri/`, `src/ports/` |
| Live X search + secrets | `src-tauri/src/lib.rs`, `commands.rs`, `secrets.rs` |
| Quick Target + xAI | `src-tauri/src/opportunity_target.rs` |
| Durable history (SQLite) | `src-tauri/src/db.rs`, history MVU slices |
| Reactor + guards (Rust) | `src-tauri/src/finder_reactor.rs` |

## Tauri commands (25 handlers)

Grouped inventory (MCP server planned; today: `invoke` only). Full table: **[docs/tauri-commands.md](docs/tauri-commands.md)**.

| Group | Commands |
|-------|----------|
| **X bearer** | `has_x_bearer`, `get_x_bearer_storage`, `set_x_bearer`, `clear_x_bearer` |
| **xAI key** | `has_xai_key`, `get_xai_key_storage`, `set_xai_key`, `clear_xai_key` |
| **Quick Target** | `fetch_opportunity_target_page`, `analyze_opportunity_target`, `prep_opportunity_target`, `get_opportunities` |
| **Finder / reactor** | `search_x_recent`, `run_finder_cycle_cmd`, `get_reactor_state`, `promote_lead` |
| **History / audit** | `get_search_history`, `get_search_run`, `get_leads`, `get_dashboard_stats`, `get_recent_pauses`, `get_events`, `search_past_tweets`, `hydrate_tweet`, `log_event` |

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/SETUP.md](docs/SETUP.md) | Install, credentials, verify, Arch notes |
| [docs/agentic-architecture.md](docs/agentic-architecture.md) | System map, mermaid, milestone matrix |
| [docs/tauri-commands.md](docs/tauri-commands.md) | All `invoke` handlers |
| [docs/tauri-ipc-and-intent-engine.md](docs/tauri-ipc-and-intent-engine.md) | IPC Intent Engine, Arch/Linux |
| [docs/tauri-ipc-debugging.md](docs/tauri-ipc-debugging.md) | Dev: intercept and debug `invoke` |
| [docs/tauri-webview-and-devtools.md](docs/tauri-webview-and-devtools.md) | Linux WebKit WebView, Safari-like inspector, console `invoke` QA |
| [.agents/skills/tauri-ipc-debug/](.agents/skills/tauri-ipc-debug/SKILL.md) | Agent skill: layer-by-layer IPC triage |
| [docs/x-tools.md](docs/x-tools.md) | Official X agent resources |
| [data/distillation/README.md](data/distillation/README.md) | Search presets, curation, analyze prompts (UI source) |
| [.agents/x-resources/README.md](.agents/x-resources/README.md) | Official X skill.md / llms snapshots + refresh |
| [reports/intuitive-shell-plan.md](reports/intuitive-shell-plan.md) | Executable UX plan (Discover / Xplore / Settings) |

Diagrams in-repo; interactive architecture canvas is Cursor-only — see [agentic-architecture.md](docs/agentic-architecture.md).

## Agent / dev resources

- **AGENTS.md** — skills index, triage, conventions (`type-check` / `lint` / `precommit` not in `package.json` yet)
- **docs/x-tools.md** — official X llms.txt, skill.md, XMCP, xurl
- **.agents/skills/** — finder-reactor, tauri-agentic, cv-promote-guard, x-agent-resources, fusion-sage

## Data handling (X content)

- Post data is fetched via the **official X API** for personal productivity use only.
- SQLite stores **post IDs**, links (`https://x.com/i/web/status/{id}`), and **280-character snippets** for local preview and FTS — not full post bodies.
- Full text is available on demand via `hydrate_tweet` (lookup API; fresh data, 404 if deleted). Live search/cycle responses return full text from the API but only snippets are persisted.
- The local database (`collab-finder.db`) is never committed to the repo.

See [docs/x-content-storage-distributin-policy.md](docs/x-content-storage-distributin-policy.md) for rationale.

Private tool for p10ns11y.
