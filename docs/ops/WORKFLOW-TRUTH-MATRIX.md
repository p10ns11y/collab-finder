# Workflow truth matrix

Round 0 cash-hire audit, 2026-09-23. Status is what the code does today. This file does not record hiring outcomes.

Scope: Discover → pack, Navigating / Mission, pipeline, firm list, apply outcome, settings secrets and guards. Fit calibration / QUALIFY writeback is in flight on another change and is not implemented here. X search, Network graph, Imm, Typst, and neural RL are out of scope.

## Shell inventory

Sidebar and Meta+1…9 match `SCREEN_BY_DIGIT` in `src/core/domain/finder-keyboard.ts`.

| Screen id | Hash | Sidebar | Shell |
|-----------|------|---------|-------|
| `heading` | `#navigating` (`#heading` alias) | Navigating | Mounted |
| `discover` | `#discover` | Discover | Mounted |
| `pipeline` | `#pipeline` | Pipeline | Mounted |
| `mission` | `#mission` | Mission | Mounted |
| `sweden` | `#sweden` | Sweden | Mounted |
| `xplore` | `#xplore` | Xplore | Mounted (X search; not this audit) |
| `network` | `#network` | Network | Mounted (graph; not this audit) |
| `preferences` | `#preferences` | Preferences | Mounted |
| `settings` | `#settings` | Settings | Mounted |
| `stats` `history` `data` `lookup` | were `#stats` `#history` `#data` `#lookup` | Never | Removed this round |

Those four ids were valid hashes and session values. `FinderAppView` did not mount the components, so the header used the product name and the body rendered `Unknown screen`. Palette entries for them were already gone. The components and `GuardDashboard` (only imported by the unmounted Statistics screen) are deleted. `ScreenChanged` to those ids is a no-op. Old session blobs that name them stay on Discover.

There is no cash-hire CLI binary. Operator scripts that read the same loop: `pnpm export-pipeline`, `pnpm firm-list`.

## Matrix

| Workflow | Entry | Status | E2E smoke | Evidence | Verdict |
|----------|-------|--------|-----------|----------|---------|
| Discover → Evaluate → Prepare → Export pack | Sidebar **Discover** (`#discover`, Meta+2). FAB **Evaluate** → `OpportunityTargetAnalyzeRequested`. Fit panel **Prepare** → `OpportunityTargetPrepRequested`. **More → Export pack** → `ApplicationPackExportRequested`. Same fit panel on Mission and Sweden. | **works** | `node src/core/domain/discover-friction.wiring.verify.mjs` | UI: `src/view/screens/discover-screen.tsx`, `src/components/finder/opportunity-target-fit-panel.tsx`. Effects: `opportunityTargetAnalyzeCmd`, `opportunityTargetPrepCmd`, `exportApplicationPackCmd` in `src/core/finder/effects.ts`. IPC: `analyze_opportunity_target`, `prep_opportunity_target`, `export_application_pack` (`src-tauri/src/opportunity_target.rs`). Disk proof, run this round after `bash scripts/seed-testdata-for-ci.sh`: `cargo test --lib writes_files_and_does_not_touch_cvdata` passed. It writes `application_packs/` and does not touch cvdata. Evaluate and Prepare call xAI when a key is present; unit builds use the test stub. | **keep** |
| Generate apply CV | Fit panel **Generate apply CV** / **Regenerate PDF** → `GenerateApplyCvRequested` → `generate_apply_cv`. | **half** | `node src/core/domain/discover-friction.wiring.verify.mjs` (panel wiring). PDF spawn is not in default CI. | `generate_apply_cv` re-exports the pack, then spawns `kanithanj.cv` (`src-tauri/src/opportunity_target.rs`). `preflight_generate_apply_cv_requires_script` checks the script file. Full PDF path is `dogfood_qred_export_and_generate_apply_cv` and is `#[ignore]`. Missing toolchain fails in preflight rather than writing a fake PDF. | **complete** |
| Navigating / Next Do | Sidebar **Navigating** (`#navigating`, Meta+1). `HeadingScreen` reads the mission map. Hero is the first `do` in the focused slot (`findNextDo` when the operator has not picked a slot). | **works** (read-only) | `node src/core/domain/heading-cockpit.verify.mjs` and `node src/core/domain/heading-transport.verify.mjs` | `findNextDo` in `src/core/domain/heading-cockpit.ts`. Snapshot IPC `read_heading_snapshot` reads `cash-path-now.json`, `contacts.md`, `waybar.json` from the mission-maps directory (`src-tauri/src/lib.rs`). The screen does not write stages. Empty map copy matches `blackoutSentence`. | **keep** |
| Mission hunt | Sidebar **Mission** (`#mission`, Meta+4). **Pull** / **Import** / **Evaluate**. Cache-first on open. | **works** | `node src/core/domain/mission-hunt.wiring.verify.mjs` | `MissionFirmsSearchRequested` lists cache unless `forceRefresh`. Evaluate imports then analyzes (`src/core/finder/effects-hunt.ts`). IPC: `list_cached_mission_leads`, `search_mission_firms`, `import_mission_firm_lead`. | **keep** |
| Opportunity pipeline + stage dates | Sidebar **Pipeline** (`#pipeline`, Meta+3). Prep dropdown, Outcome dropdown, Analyzed / Prepped / Applied columns. | **works** | `node src/core/domain/opportunity-pipeline.verify.mjs` and `node src/core/domain/apply-reply-lane.verify.mjs` | Prep status: `update_opportunity_status_cmd` sets `opportunities.status` and `applied_at` when status becomes `applied` (`src-tauri/src/db.rs`). Outcome: `update_opportunity_outcome_cmd` allows waiting, screening, interview, offer, rejected, withdrawn. Analyzed / Prepped columns read `OpportunityTargetAnalyzed` / `OpportunityTargetPrepped` events (`timelineFromEvents`). Applied column reads `applied_at`. Rust, run this round: `get_pipeline_opportunities_includes_applied_not_in_recency_window` passed. Manual dropdown edits do not append a new event row; the date columns do not claim they do. | **keep** |
| Firm watch | Preferences → **Mission firm list**. Status chip **Watch**. Mission **Next 10** durability strip. `pnpm firm-list` regenerates `data/mission-firms/FIRM-LIST.md`. | **half** | `node src/core/domain/firm-maintained-list.verify.mjs` | `list_maintained_firms_cmd` is read-only. Rust, run this round after the CI testdata seed: `list_maintained_firms_sorted_with_volvo_cars_watch` passed (`volvo_cars` is Watch). `FirmStatus::Watch` is derived when `hiring_signal == 1` and the enum comment states it does not affect scoring gates (`src-tauri/src/firm_durability.rs`). `list_durable_firms` runs the ranker and snapshots. There is no firm-watch poller and no QUALIFY command in the UI or IPC. The only `QUALIFY` token is `TOP_QUALIFY_DEFAULT` in `src-tauri/src/network_graph.rs` (contact-graph top-N, not this loop). | **keep** |
| QUALIFY / fit writeback | No screen, button, or command. | **in-flight** | Not run here. | No fit-calibration or QUALIFY writeback module. Adjacent knobs that do exist: Preferences **Fit mode** (`get_fit_mode_cmd` / `set_fit_mode_cmd`) and **Rank packs** (`save_rank_config` → `list_durable_firms`). Strict prep still gates on overall ≥ 45 in `canRequestPrepBundle` (`src/core/domain/fit-mode.ts`). Left untouched for the agent that owns writeback. | **keep** |
| Apply-watch / outcome ingest | Pipeline Outcome dropdown. Reply lane and 2-day ATS follow-up are derived in the client. `pnpm export-pipeline` dumps the same SQLite rows. | **half** | `node src/core/domain/apply-reply-lane.verify.mjs` | No `apply-watch` symbol and no mail, webhook, or inbox ingest. Outcome changes persist on the opportunity row and admit a pulse tick (`HuntTickKind::OutcomeChange`). Lane copy on the Pipeline screen matches `COMPENSATING_FOLLOWUP_DAYS = 2`. | **keep** |
| Settings secrets | Sidebar **Settings** (`#settings`, Meta+9). X bearer panel and xAI key panel. | **works** | `node src/core/domain/xai-key-panel.verify.mjs` | IPC: `get_x_bearer_storage`, `set_x_bearer`, `clear_x_bearer`, `get_xai_key_storage`, `set_xai_key`, `clear_xai_key`, `get_xai_model_cmd`, `set_xai_model_cmd` (`src-tauri/src/lib.rs`, `src-tauri/src/secrets.rs`). Status payloads are source metadata (`keyring` / `file` / `env` / `none`), not key material. Rust, run this round: `set_and_read_back_via_file_fallback` passed. `clear_removes_connection` is the paired clear test in the same module. | **keep** |
| Reactor guards | Header pause count. `PauseLog` on Discover and Xplore. Preferences operator-pack health. | **half** | `node src/core/domain/discover-friction.wiring.verify.mjs` (header pause chip, Discover has no X search). Pack health is `get_operator_pack_status`. Rust, run this round: `pack_status_healthy_with_test_fixtures` passed. | Pauses are recorded by the reactor and shown on the header and `PauseLog`. Settings has no guard controls; its copy points at Preferences. `GuardDashboard` lived only on the unmounted Statistics screen and always badged token budget **active** and X rate **ok**. That card is removed with the screen. | **hide** (dashboard removed) |
| Unmounted audit screens | Former hashes `#stats` `#history` `#data` `#lookup` and any session blob with those ids. | **dead** | `node src/core/domain/finder-nav.verify.mjs` | `screenFromHash` returns null. `updateFinder` ignores `ScreenChanged` to `history`. `finder-app-view.tsx` does not import `HistoryScreen`, `DataScreen`, `StatsScreen`, `LookupScreen`, or `guard-dashboard`. | **hide** (done this round) |

## Commands touched by the six workflows

| Command | Role |
|---------|------|
| `analyze_opportunity_target` | Evaluate |
| `prep_opportunity_target` | Prepare |
| `export_application_pack` | Write pack directory |
| `generate_apply_cv` | Re-export pack and spawn CV PDF |
| `import_mission_firm_lead` / `import_platsbanken_ad` / `select_hire_board_lead` | Discover seeds |
| `read_heading_snapshot` / `read_cluster_route` / `clear_cluster_route` | Navigating read |
| `list_cached_mission_leads` / `search_mission_firms` / `list_durable_firms` | Mission |
| `get_pipeline_opportunities` | Pipeline read |
| `update_opportunity_status_cmd` / `update_opportunity_outcome_cmd` | Prep status and outcome |
| `list_maintained_firms_cmd` | Firm registry read |
| `get_x_bearer_storage` / `set_x_bearer` / `clear_x_bearer` | X bearer metadata |
| `get_xai_key_storage` / `set_xai_key` / `clear_xai_key` | xAI key metadata |
| `get_operator_pack_status` | Pack health badge |

`fetch_opportunity_target_page` is registered on the TS port and used inside Rust `resolve_opportunity_source`. No screen calls it. Left in place; it is not labeled in the UI.
