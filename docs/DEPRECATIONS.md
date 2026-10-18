# Deprecations (kanithanj rebuild)

Tracking: KSP-49 (rebuild) and KSP-50 (these markers). Everything listed here is marked, and will be deleted once the new core and views cover it. Markers only, with no behaviour change.

Marker forms:
- Rust: `#[deprecated(note = "kanithanj rebuild: see docs/DEPRECATIONS.md")]`
- TS/TSX: a first-line comment, `// DEPRECATED(rebuild): see docs/DEPRECATIONS.md`

## Rust modules

- `src-tauri/src/finder_reactor.rs` (xplore): Fake "decision": keyword `fit_score`, CV thrown away, hard-coded confidence.
- `src-tauri/src/local_grok.rs` (quest): Quest drawer harness. Replaced by a chat/voice line over the core.
- `src-tauri/src/lib.rs heading snapshot + cluster route fns` (shell): Navigating reads an external mission map, not the app's own data.

## Tauri commands

- `get_fit_mode_cmd`: Fit mode is deleted
- `set_fit_mode_cmd`: Fit mode is deleted
- `read_heading_snapshot`: Navigating
- `read_cluster_route`: Navigating
- `clear_cluster_route`: Navigating
- `run_local_grok_quest`: Quest drawer
- `get_x_search_catalog`: Xplore presets
- `run_finder_cycle_cmd`: Xplore fake cycle
- `get_reactor_state`: Xplore reactor
- `promote_lead`: Only writes an audit note
- `get_search_history`: Xplore screen
- `get_search_run`: Xplore screen
- `get_leads`: `leads` merges into candidates
- `get_recent_pauses`: Xplore guards
- `search_past_tweets`: Xplore screen
- `hydrate_tweet`: Xplore screen
- `persist_quest_turn`: Quest drawer
- `load_latest_quest_thread`: Quest drawer
- `load_quest_thread`: Quest drawer
- `list_quest_threads`: Quest drawer
- `search_quest_turns`: Quest drawer

## Views and components

- `src/view/screens/discover-screen.tsx` (discover): Replaced by the B pick card; Evaluate behind a FAB with an empty first view
- `src/view/screens/heading-screen.tsx` (shell): Navigating; external mission map
- `src/view/screens/mission-screen.tsx` (hunt): Source screen; becomes an adapter
- `src/view/screens/sweden-screen.tsx` (hunt): Source screen; becomes an adapter
- `src/view/screens/xplore-screen.tsx` (xplore): Cut as a screen
- `src/view/screens/pipeline-screen.tsx` (pipeline): Two dropdowns; replaced by the follow-up card and Tracker over one state machine
- `src/view/screens/network-screen.tsx` (network): Demoted to a warm-path flag
- `src/view/screens/preferences-screen.tsx` (packs): Merged into one Settings, asked only when needed
- `src/view/screens/preferences-panels.tsx` (packs): 756-line config panel
- `src/view/screens/settings-screen.tsx` (credentials): Keys are asked inline at first use
- `src/view/finder-app-view.tsx` (shell): 9-screen router; replaced by one B surface
- `src/components/layout/app-shell.tsx` (shell): 9-screen shell
- `src/components/layout/header.tsx` (shell): 9-screen shell
- `src/components/layout/hunt-split-shell.tsx` (shell): Source-screen split
- `src/components/layout/sidebar-nav.tsx` (shell): 9 destinations
- `src/components/finder/artifact-reader.tsx` (discover): Rebuilt as the B pack preview
- `src/components/finder/command-palette.tsx` (shell): Not a must-have; bring back later if needed
- `src/components/finder/credentials-panel.tsx` (credentials): Replaced by the inline key ask
- `src/components/finder/credentials-storage-details.tsx` (credentials): Shows plumbing
- `src/components/finder/cv-cycle-context-panel.tsx` (discover): Xplore/CV cycle context
- `src/components/finder/cv-summary-input.tsx` (discover): Replaced by the minute-0 CV drop
- `src/components/finder/decision-panel.tsx` (xplore): Fake cycle decision
- `src/components/finder/error-banner.tsx` (shell): Rebuilt on the B surface
- `src/components/finder/hire-board-panel.tsx` (hire-board): Source panel; becomes an adapter
- `src/components/finder/hunt-fit-pane.tsx` (hunt): Replaced by the B Why? view
- `src/components/finder/hunt-presets-row.tsx` (hunt): Source presets
- `src/components/finder/opportunity-target-fit-panel.tsx` (discover): Replaced by the B Why? view
- `src/components/finder/pause-log.tsx` (xplore): Xplore guards
- `src/components/finder/quest-drawer.tsx` (quest): Replaced by a chat line
- `src/components/finder/search-workspace.tsx` (xplore): X search UI
- `src/components/finder/tweet-feed.tsx` (xplore): X feed, no Evaluate path

## TS domain helpers

- `src/core/domain/finder.ts`
- `src/core/domain/distillation.ts`
- `src/core/domain/search-presets.ts`
- `src/core/domain/quest.ts`
- `src/core/domain/quest-context.ts`
- `src/core/domain/heading-cockpit.ts`
- `src/core/domain/heading-transport.ts`
- `src/core/domain/finder-nav.ts`
- `src/core/domain/finder-keyboard.ts`
- `src/core/domain/fit-mode.ts`
- `src/core/domain/discover-chrome.ts`
- `src/core/domain/opportunity-rail-label.ts`
- `src/core/domain/hunt-rails.ts`
- `src/core/domain/mission-firms.ts`
- `src/core/domain/platsbanken.ts`
- `src/core/domain/hire-board.ts`
- `src/core/domain/network-graph.ts`
- `src/core/domain/cv-packet-panel-open.ts`
- `src/core/domain/devprofile-path-panel.ts`
- `src/core/domain/xai-key-panel.ts`
- `src/core/domain/xai-key-form.ts`
- `src/adapters/tauri/heading-boot.ts`

## Message types (`src/core/finder/msg.ts`)

- Quest drawer: Quest* (15)
- Xplore cycle and X search: Cycle*, Hydrate*, Lookup*, Promote*, Reactor*, Search*, PresetSelected, QueryChanged (27)
- Mission, Sweden, hunt rails, hire board screens: MissionFirm*, MissionLead*, Platsbanken*, Hunt*, HireBoard* (41)
- Network screen: Network* (10)
- Screen nav and palette: ScreenChanged, Palette* (3)
