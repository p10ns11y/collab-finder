# Tauri command contract

The desktop shell exposes **Tauri commands** (not an MCP server yet). The React layer calls them via `src/adapters/tauri/*`.

**How `invoke` works (IPC vs HTTP, Intent Engine):** [tauri-ipc-and-intent-engine.md](./tauri-ipc-and-intent-engine.md) · **Debug in dev:** [tauri-ipc-debugging.md](./tauri-ipc-debugging.md)

## Credentials (STABILITY CONTRACT — do not change lightly)

| Command | Args | Returns | Adapter |
|---------|------|---------|---------|
| `has_x_bearer` | — | `boolean` | `credentials-adapter.ts` — legacy; prefer `get_x_bearer_storage` (`connected` = token present) |
| `get_x_bearer_storage` | — | `BearerStorageStatus` | same — active source, file path, keyring reachability |
| `set_x_bearer` | `{ token: string }` | `void` | same |
| `clear_x_bearer` | — | `void` | same |

**This set of 4 commands + the exact `BearerStorageStatus` / `Bearer*Info` shapes (snake_case) + the error string returned by internal `get_x_bearer` ("X bearer not configured...") form a stability boundary.**

- They have been repeatedly broken during refactors of unrelated features (DB storage policy for tweet content, "clean up lib.rs", broad "storage" modules, etc.).
- The Rust implementation lives behind loud STABILITY CONTRACT headers in `src-tauri/src/secrets.rs`, `src-tauri/src/app_dirs.rs`, and the credential section of `src-tauri/src/lib.rs`.
- `BearerStorageStatus` is the diagnostic surface for "is keyring working on this machine or are we on file fallback?" — the credentials panel depends on the exact fields.
- Bearer is read inside Rust for search/cycle/hydrate (`x_bearer()` helper) — never sent from the UI on each search.

`BearerStorageStatus` (from `get_x_bearer_storage`) matches the credentials panel: `active_source` (`keyring` | `file` | `none`), file path, keyring reachability, and plaintext-fallback notes.

See also the agent instructions in root AGENTS.md (bearer row + conventions) and the giant headers in the Rust sources before editing anything here or in the credential path.

## Finder / reactor

| Command | Args | Returns | Adapter | Notes |
|---------|------|---------|---------|-------|
| `search_x_recent` | `{ query, maxResults? }` | `XTweet[]` | `finder-adapter.ts` | Live X API; `maxResults` clamped 10–20. Returns full text; sqlite stores snippets only (best-effort). |
| `run_finder_cycle_cmd` | `{ query, cvSummary }` | `CycleResult` (`decision`, `tweets`, `best_tweet`) | same | Live X search via `guarded_search`; persists lead from `best_tweet` (fit-scored pick), not `tweets[0]`. |
| `get_reactor_state` | — | `ReactorState` | same | Shared `AppReactor` — leads/pauses persist across cycles |
| `promote_lead` | `{ lead_id: string }` (TS adapter defaults `'latest'`) | `string` | same | Stub message until CV guard is wired. Logs event. |

## History / audit (sqlite-backed, every action + deduped leads)

| Command | Args | Returns | Notes |
|---------|------|---------|-------|
| `get_search_history` | `{ limit? }` | `SearchRun[]` | Past queries, counts, rates, sources. |
| `get_search_run` | `{ id }` | `SearchRunWithTweets \| null` | Snippet tweets for one historical run (replayable). |
| `get_leads` | `{ minScore?, status?, q?, limit? }` | `Lead[]` | Unique opportunities (dedup by tweet_id + seen_count). Enriched with tweet snippet. |
| `get_dashboard_stats` | — | `DashboardStats` | totals, avg, top queries, most-reseen (for neat cards). |
| `get_recent_pauses` | `{ limit? }` | `Pause[]` | Guard triggers with context. |
| `get_events` | `{ limit? }` | `Event[]` | Broad TUI + reactor action log. |
| `search_past_tweets` | `{ ftsQuery, limit? }` | `XTweet[]` | FTS5 lookup on stored snippets (not full post bodies). |
| `hydrate_tweet` | `{ id }` | `XTweet` | Live lookup of full post from X; not persisted. Use when opening a lead or replay needs current text. |
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
