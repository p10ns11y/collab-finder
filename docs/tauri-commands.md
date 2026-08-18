# Tauri command contract

The desktop shell exposes Tauri commands (not an MCP server yet). The React layer calls them via `src/adapters/tauri/*`. Registration: `src-tauri/src/lib.rs` `generate_handler![]`.

**How `invoke` works (IPC vs HTTP, Intent Engine):** [tauri-ipc-and-intent-engine.md](./tauri-ipc-and-intent-engine.md) · **Debug in dev:** [tauri-ipc-debugging.md](./tauri-ipc-debugging.md)

## Credentials (STABILITY CONTRACT — do not change lightly)

| Command | Args | Returns | Adapter |
|---------|------|---------|---------|
| `has_x_bearer` | — | `boolean` | `credentials-adapter.ts` — legacy; prefer `get_x_bearer_storage` (`connected` = token present) |
| `get_x_bearer_storage` | — | `BearerStorageStatus` | same — active source, file path, keyring reachability |
| `set_x_bearer` | `{ token: string }` | `void` | same |
| `clear_x_bearer` | — | `void` | same |

**This set of 4 commands + the exact `BearerStorageStatus` / `Bearer*Info` shapes (snake_case) + the error string returned by internal `get_x_bearer` ("X bearer not configured...") form a stability boundary.**

### xAI key (exact parallel to bearer; used for target analysis, prep, CV tailoring)

| Command | Args | Returns | Notes |
|---------|------|---------|-------|
| `has_xai_key` | — | `boolean` | Quick presence check (used by UI preflight in discover/settings) |
| `get_xai_key_storage` | — | `XaiKeyStorageStatus` | Mirrors BearerStorageStatus: active_source, keyring + file details (0600 fallback) |
| `set_xai_key` | `{ key: string }` | `void` | Dual-write keyring + file; trims input |
| `clear_xai_key` | — | `void` | Clears both stores |

See STABILITY CONTRACT headers in `src-tauri/src/secrets.rs`, `app_dirs.rs`, and credential section of `lib.rs`. After edits to these or command registration: `cd src-tauri && cargo test`.

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
| `hydrate_tweet` | `{ id }` | `XTweet` | Live lookup of full post from X; not persisted. Manual QA: [tauri-webview-and-devtools.md](./tauri-webview-and-devtools.md#example-hydrate_tweet-full-post-on-demand). |
| `log_event` | `{ eventType, payload?, correlationId? }` | `void` | For frontend to record PresetSelected, intents etc. |

## Quick Target (Discover — URL or pasted JD → live xAI fit + prep)

Implemented in `src-tauri/src/opportunity_target.rs`. Adapter: `finder-adapter.ts` (`fetchOpportunityTargetPage`, `analyzeOpportunityTarget`, `prepOpportunityTarget`, `getOpportunities`). Requires saved xAI key (`set_xai_key`).

| Command | Args | Returns | Notes |
|---------|------|---------|-------|
| `fetch_opportunity_target_page` | `{ url: string }` | `OpportunityTargetPageResult` | Naive GET + basic tag strip; 20s timeout; truncates >8000 chars. Basic Greenhouse title/company extraction for prefill. |
| `analyze_opportunity_target` | `{ url?, pasted_jd?, title?, company?, cv_summary? }` | `OpportunityTargetAnalysisResult` | Live xAI structured fit. Mode from `fit_mode.txt`: **strict** → dual-fit `target_fit_v2` + compact constraints; **relaxed** → simple fitness `target_fit_simple_v1` (experience match, no You↔Role). Persists `fit_mode` in `analysis_json`. |
| `prep_opportunity_target` | `{ opportunity_id?, url?, pasted_jd?, title?, company?, cv_summary?, previous_fit? }` | `OpportunityTargetPrepResult` | Live xAI prep pack (`target_prep_v1`: cover letter, cv_suggestions, research_notes, optional exceptional_work_example). Updates row to `prepped`. `previous_fit` carries Evaluate Fit JSON from the panel. |
| `export_application_pack` | `{ opportunity_id }` | `ApplicationPackExportResult` | Pure materialization from stored prep (no xAI). Writes under app-local `application_packs/{slug}/`. Notes: `export_path=` + `pack_slug=`. **Never** mutates external `cvdata.json`. |
| `generate_apply_cv` | `{ opportunity_id }` | `GenerateApplyCvResult` | Export pack if needed, then spawn devprofile `generate-apply-cv` (`bun`/`pnpm`). Requires Settings **devprofile_path** + scripts on latest devprofile main. PDF only — **no master CV write**. |
| `get_fit_mode_cmd` | — | `string` (`strict` \| `relaxed`) | Current fit evaluation mode (default `strict`). |
| `set_fit_mode_cmd` | `{ mode? }` | `string` (normalized mode) | Persist mode to `fit_mode.txt` under app data dir. |
| `get_llm_route_status` | — | `LlmRouteStatus` | Probe `grok` / `cursor-agent` on PATH + xAI key presence (bool only). Returns quality + recommended backends. |
| `set_llm_route_quality` | `{ quality }` | `void` | Persist `fast` \| `moderate` \| `high` to `llm_quality.txt`. Analyze still uses xAI API this slice. |
| `run_local_grok_quest` | `{ input: { prompt, sessionId?, resume?, kind? } }` | `LocalGrokQuestResult` | Headless local `grok --prompt-file`. No yolo. Apply/EVA deny web; Free may fetch. |
| `persist_quest_turn` | `{ input: { sessionId, kind, contextIds, role, text, … } }` | `void` | Best-effort SQLite append. Never fails the ask. |
| `load_latest_quest_thread` | — | `QuestThread?` | Most recently updated thread + turns. |
| `load_quest_thread` | `{ sessionId }` | `QuestThread?` | One saved thread. |
| `list_quest_threads` | `{ limit? }` | `QuestThreadSummary[]` | Recent threads (preview = first user line). |
| `search_quest_turns` | `{ q, limit? }` | `QuestTurnHit[]` | `LIKE` search over saved turn text. |
| `get_opportunities` | `{ id?, q?, status?, limit? }` | `Opportunity[]` | SQLite read for rail, Data tables, and hydrate-by-id (`loadOpportunityCmd`). `id` filter pushed to SQL (TD-002). |

## Hire board (Discover — public sheet skim → Select/Evaluate)

Implemented in `src-tauri/src/hire_board.rs`. Sheet identity is **not** hardcoded: copy `data/hire-board/config.example.json` → `config.local.json` (gitignored) or set `HIRE_BOARD_SHEET_URL` / `HIRE_BOARD_CONFIG`.

| Command | Args | Returns | Notes |
|---------|------|---------|-------|
| `fetch_hire_board` | `{ sheetUrl?, q?, geo?, requireCareerUrl?, limit? }` | `HireBoardLead[]` | Live CSV export; filter + heuristic skim; marks `already_in_db` via URL. **No bulk insert.** |
| `select_hire_board_lead` | `{ company, location?, careerUrl, threadUrl? }` | `Opportunity` | Upserts `status=new` into `opportunities` (URL dedup). Evaluate uses `analyze_opportunity_target`. |

`OpportunityTargetAnalysisResult.fit` is strict JSON from xAI (see `xai.rs` + `target_fit_v1`). Types mirror `src/core/domain/opportunity-target.ts`.

## Durability ranker (Mission)

| Command | Args | Returns | Notes |
|---------|------|---------|-------|
| `list_durable_firms` | — | `IterationResult` | Fortress / AI-wave / theatre gates. Reads `data/durability/universe.v1.json`. Snapshots to SQLite v9. No apply state. |

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
- xAI structured analyze for the **reactor cycle** path (`run_finder_cycle_cmd` — today heuristic in `finder_reactor.rs`)
- CV promote to external devprofile with sidecar + diff preview + multi-confirm guard (`promote_lead` is stub until wired)

Quick Target analyze/prep on Discover is **live** (commands above). See root product skills for roadmap detail beyond this table.
