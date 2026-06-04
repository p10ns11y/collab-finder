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
| `search_x_recent` | `{ query, maxResults? }` | `XTweet[]` | `finder-adapter.ts` | Live X API; `maxResults` clamped 10–20. Persists run + hits + rate to sqlite (best-effort). |
| `run_finder_cycle_cmd` | `{ query, cvSummary }` | `CycleResult` (`decision` + `tweets`) | same | Live X search via `guarded_search`; shared reactor state. Also persists search + upserts lead (dedup + seen_count). |
| `get_reactor_state` | — | `ReactorState` | same | Shared `AppReactor` — leads/pauses persist across cycles |
| `promote_lead` | `{ lead_id: string }` (TS adapter defaults `'latest'`) | `string` | same | Stub message until CV guard is wired. Logs event. |

## History / audit (sqlite-backed, every action + deduped leads)

| Command | Args | Returns | Notes |
|---------|------|---------|-------|
| `get_search_history` | `{ limit? }` | `SearchRun[]` | Past queries, counts, rates, sources. |
| `get_search_run` | `{ id }` | `SearchRunWithTweets \| null` | Full tweets for one historical run (replayable). |
| `get_leads` | `{ minScore?, status?, q?, limit? }` | `Lead[]` | Unique opportunities (dedup by tweet_id + seen_count). Enriched with tweet text. |
| `get_dashboard_stats` | — | `DashboardStats` | totals, avg, top queries, most-reseen (for neat cards). |
| `get_recent_pauses` | `{ limit? }` | `Pause[]` | Guard triggers with context. |
| `get_events` | `{ limit? }` | `Event[]` | Broad TUI + reactor action log. |
| `search_past_tweets` | `{ ftsQuery, limit? }` | `XTweet[]` | FTS5 full-text lookup on stored tweet bodies. |
| `log_event` | `{ eventType, payload?, correlationId? }` | `void` | For frontend to record PresetSelected, intents etc. |

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
