# Tauri command contract

The desktop shell exposes **Tauri commands** (not an MCP server yet). The React layer calls them via `src/adapters/tauri/*`.

## Credentials

| Command | Args | Returns | Adapter |
|---------|------|---------|---------|
| `has_x_bearer` | — | `boolean` | `credentials-adapter.ts` |
| `set_x_bearer` | `{ token: string }` | `void` | same |
| `clear_x_bearer` | — | `void` | same |

Bearer is read inside Rust for search/cycle — never sent from the UI on each search.

## Finder / reactor

| Command | Args | Returns | Adapter | Notes |
|---------|------|---------|---------|-------|
| `search_x_recent` | `{ query, maxResults? }` | `XTweet[]` | `finder-adapter.ts` | Live X API; `maxResults` clamped 10–20 |
| `run_finder_cycle_cmd` | `{ query, cvSummary }` | `CycleResult` (`decision` + `tweets`) | same | Live X search via `guarded_search`; shared reactor state |
| `get_reactor_state` | — | `ReactorState` | same | Shared `AppReactor` — leads/pauses persist across cycles |
| `promote_lead` | `{ leadId? }` | `string` | same | Stub message until CV guard is wired |

## TypeScript bridge

```
View (finder-app-view.tsx)
  → dispatch FinderMsg
  → MVU update (src/core/finder/)
  → effects (src/core/finder/effects.ts)
  → ports (src/ports/)
  → adapters (src/adapters/tauri/)
  → invoke(command, args)
```

## Planned (not implemented)

- MCP stdio/HTTP server wrapping the same operations for Cursor/Grok
- `ask_user` pause tool for guard interventions
- xAI-backed `analyze` / prep / promote with CV guard sidecars

See root `SKILL.md` for the product-level tool spec; treat it as roadmap until listed above is implemented.
