# Areas

Every tracked file belongs to one area. Tests and `*.verify.mjs` runners sit with the area they cover.

<!-- area-map-graph:mermaid -->
```mermaid
flowchart LR
  subgraph hubs["Wiring hubs"]
    shell
    runtime
    bridge
  end
  subgraph screens["Screen areas: wired through all three hubs"]
    discover
    hunt
    xplore
    pipeline
    quest
    credentials
    packs
    network
    hire_board["hire-board"]
  end
  subgraph rustdata["Rust and data only: no hub imports"]
    store
    ingest
    profile_data["profile-data"]
    cv_renderer["cv-renderer"]
  end
  subgraph alone["Isolated: no import edges"]
    ops
    docs
    kanithanj_v0["kanithanj-v0"]
  end

  hubs <-->|"UI kit, messages, IPC"| screens

  bridge --> store
  discover <--> hunt
  discover <--> xplore
  discover <--> pipeline
  discover <--> credentials
  discover <--> packs
  discover <--> hire_board
  discover --> store
  hunt --> pipeline
  hunt --> packs
  hunt --> store
  hunt --> ingest
  pipeline --> xplore
  packs --> xplore
  network --> xplore
  xplore <--> store
  xplore --> profile_data
  quest --> store
  quest --> profile_data
  credentials --> store
  store --> packs
  ingest --> packs
  network <--> store
  hire_board --> store
  ingest --> store
```

An arrow means depends on. Edges were read from TS imports, Rust paths, and IPC names on main at `fc493a2`: 88 directed edges. The hub edge folds 55 links (UI kit, messages, IPC). The other 33 are drawn. `<-->` is a two-way pair.

15 areas share one tree. `bridge` has 12 neighbours. `store` is the data area the most others depend on. Cycles run through `shell`, `runtime`, `bridge`, `discover`, `hunt`, `xplore`, `pipeline`, `quest`, `credentials`, `store`, `packs`, `ingest`, `network`, and `hire-board`. `profile-data` only has incoming edges. `cv-renderer`, `ops`, `kanithanj-v0`, and `docs` have none. `ops` still chooses which checks run.
<!-- /area-map-graph:mermaid -->

`*` stays inside one path segment. `**` walks directories. `docs/ops/areas.json` is the config the check reads.

## Paths

| Area | Kind | Owns |
|---|---|---|
| shell | functional | `apps/desktop/src/main.tsx`, `apps/desktop/src/App.tsx`, `apps/desktop/src/vite-env.d.ts`, `apps/desktop/src/app/**`, `apps/desktop/src/shell/**`, `apps/desktop/src/lib/**`, `apps/desktop/src/index.css`, `apps/desktop/src/types/**`, `apps/desktop/src/view/finder-app-view.tsx`, `apps/desktop/src/view/web-preview-chrome.verify.mjs`, `apps/desktop/src/view/screens/heading-screen.tsx`, `apps/desktop/src/components/layout/**`, `apps/desktop/src/components/ui/**`, `apps/desktop/src/components/finder/command-palette.tsx`, `apps/desktop/src/components/finder/error-banner.tsx`, `apps/desktop/src/core/domain/finder-nav*`, `apps/desktop/src/core/domain/finder-keyboard*`, `apps/desktop/src/core/domain/heading-*`, `apps/desktop/index.html` |
| runtime | functional | `apps/desktop/src/core/finder/**`, `apps/desktop/src/core/mvu/**`, `apps/desktop/src/runtime/**`, `apps/desktop/src/ports/finder-port.ts`, `apps/desktop/src/core/async.ts`, `apps/desktop/src/core/result.ts`, `apps/desktop/src/core/error.ts` |
| bridge | functional | `apps/desktop/src/adapters/tauri/**`, `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/capabilities/**`, `src-tauri/tauri.conf.json`, `src-tauri/build.rs`, except `apps/desktop/src/adapters/tauri/credentials-adapter.ts` |
| discover | functional | `src-tauri/src/opportunity_target.rs`, `src-tauri/src/cv_home.rs`, `src-tauri/src/xai.rs`, `src-tauri/src/llm_route.rs`, `apps/desktop/src/core/domain/application-pack.ts`, `apps/desktop/src/core/domain/cv-*`, `apps/desktop/src/core/domain/discover-*`, `apps/desktop/src/core/domain/devprofile-path-panel*`, `apps/desktop/src/core/domain/fit-*`, `apps/desktop/src/core/domain/llm-route*`, `apps/desktop/src/core/domain/opportunity-rail-label*`, `apps/desktop/src/core/domain/opportunity-target*`, `apps/desktop/src/core/domain/opportunity-url*`, `apps/desktop/src/core/domain/fixtures/**`, `apps/desktop/src/components/finder/opportunity-target-fit-panel.tsx`, `apps/desktop/src/components/finder/artifact-reader.tsx`, `apps/desktop/src/components/finder/cv-*`, `apps/desktop/src/view/screens/discover-screen.tsx`, `scripts/fit-calibration.mjs` |
| hunt | functional | `src-tauri/src/platsbanken.rs`, `src-tauri/src/mission_firms.rs`, `src-tauri/src/america_eu.rs`, `src-tauri/src/product_lane.rs`, `src-tauri/src/commands/hunt.rs`, `src-tauri/tests/**`, `apps/desktop/src/core/domain/hunt-rails*`, `apps/desktop/src/core/domain/platsbanken*`, `apps/desktop/src/core/domain/mission-*`, `apps/desktop/src/core/domain/sweden-hunt*`, `apps/desktop/src/components/finder/hunt-*`, `apps/desktop/src/view/screens/sweden-screen.tsx`, `apps/desktop/src/view/screens/mission-screen.tsx`, `data/hunt-presets/**`, `data/mission-firms/**`, `scripts/generate-firm-list.mjs`, `scripts/qa-platsbanken-freshness.sh`, `docs/qa/**` |
| xplore | functional | `src-tauri/src/finder_reactor.rs`, `src-tauri/src/x_search.rs`, `src-tauri/src/x_query.rs`, `apps/desktop/src/core/domain/finder.ts`, `apps/desktop/src/core/domain/distillation.ts`, `apps/desktop/src/core/domain/search-presets.ts`, `apps/desktop/src/components/finder/search-workspace.tsx`, `apps/desktop/src/components/finder/tweet-feed.tsx`, `apps/desktop/src/components/finder/decision-panel.tsx`, `apps/desktop/src/components/finder/pause-log.tsx`, `apps/desktop/src/view/screens/xplore-screen.tsx`, `data/distillation/x-search/**` |
| pipeline | functional | `src-tauri/src/qualify_policy.rs`, `src-tauri/src/decide.rs`, `src-tauri/src/decide/**`, `src-tauri/schemas/**`, `apps/desktop/src/core/domain/history.ts`, `apps/desktop/src/core/domain/pipeline-timeline.ts`, `apps/desktop/src/core/domain/opportunity-pipeline*`, `apps/desktop/src/core/domain/apply-reply-lane*`, `apps/desktop/src/core/domain/qualify-policy*`, `apps/desktop/src/view/screens/pipeline-screen.tsx`, `scripts/export-pipeline.mjs`, `scripts/sync-pack-artifacts.py`, `scripts/qualify-hillclimb.mjs` |
| quest | functional | `src-tauri/src/local_grok.rs`, `apps/desktop/src/core/domain/quest*`, `apps/desktop/src/components/finder/quest-drawer.tsx` |
| credentials | functional | `src-tauri/src/secrets.rs`, `src-tauri/src/secrets/**`, `apps/desktop/src/core/domain/credentials.ts`, `apps/desktop/src/core/domain/xai-key-*`, `apps/desktop/src/core/security/**`, `apps/desktop/src/ports/credentials-port.ts`, `apps/desktop/src/adapters/tauri/credentials-adapter.ts`, `apps/desktop/src/components/finder/credentials-*`, `apps/desktop/src/view/screens/settings-screen.tsx` |
| cv-renderer | functional | `vendor/kanithanj-cv/**`, `scripts/install-kanithanj-cv.sh`, `scripts/pull-cvdata.sh`, `scripts/test-cv-sot.sh`, `scripts/test-pull-*` |
| store | data | `src-tauri/src/db.rs`, `src-tauri/src/app_dirs.rs`, `src-tauri/src/pulse.rs`, `scripts/backup-db.sh`, `scripts/pulse-export.mjs`, `scripts/pulse-import.mjs`, `scripts/seed-testdata-for-ci.sh` |
| packs | data | `src-tauri/src/operator_pack.rs`, `src-tauri/src/rank_config.rs`, `src-tauri/src/environment.rs`, `src-tauri/src/firm_durability.rs`, `src-tauri/src/facts.rs`, `apps/desktop/src/core/domain/operator-pack-health.ts`, `apps/desktop/src/core/domain/firm-durability.ts`, `apps/desktop/src/core/domain/firm-maintained-list*`, `apps/desktop/src/view/screens/preferences-*`, `data/durability/**`, `data/facts/**`, `data/pipeline/**`, `scripts/seed-operator-config.sh`, `scripts/load-pipeline-config.mjs` |
| ingest | data | `src-tauri/src/research_ingest.rs`, `src-tauri/src/bin/**`, `src-tauri/fixtures/**` |
| network | data | `src-tauri/src/network_graph.rs`, `apps/desktop/src/core/domain/network-graph.ts`, `apps/desktop/src/view/screens/network-screen.tsx`, `data/connections.sample.csv`, `data/contacts.sample.csv`, `data/network-csv.md` |
| hire-board | data | `src-tauri/src/hire_board.rs`, `apps/desktop/src/core/domain/hire-board.ts`, `apps/desktop/src/components/finder/hire-board-panel.tsx`, `data/hire-board/**` |
| profile-data | data | `data/distillation/**`, `scripts/prune-public-projects.mjs`, `apps/desktop/src/web/fixtures/**`, except `data/distillation/x-search/**` |
| ops | ops | `.github/**`, `scripts/ci-*`, `scripts/run-verify.mjs`, `scripts/cut-release.sh`, `scripts/ensure-lizard.sh`, `scripts/test-ensure-lizard.sh`, `scripts/sync-agent-skills.sh`, `scripts/gate.sh`, `scripts/area-map*`, `scripts/scan-web-privacy.mjs`, `scripts/operator-personal-names.mjs`, `scripts/web-preview*`, `dx/**`, `package.json`, `pnpm-lock.yaml`, `src-tauri/Cargo.*`, `src-tauri/icons/**`, `apps/desktop/tsconfig.json`, `apps/desktop/tsconfig.node.json`, `apps/desktop/vite.config.ts`, `apps/desktop/postcss.config.js`, `apps/desktop/stryker.config.json`, `.gitignore`, `src-tauri/.gitignore`, `session-sot.example`, `skills-lock.json`, `LICENSE`, `pnpm-workspace.yaml`, `apps/desktop/package.json` |
| kanithanj-v0 | functional | `packages/**`, `apps/web/**`, `spec/**`, except `**/*.md` |
| docs | docs | `**/*.md`, `docs/**`, `.agents/**`, `.grok/**`, `archive/**`, except `docs/qa/**`, `data/**`, `vendor/**`, `.github/**`, `src-tauri/tests/**`, `apps/desktop/src/web/fixtures/**` |

## Cadence

In order:

1. **Nightly** when the area has 1,500+ lines in 30 days, or 10+ neighbours, or it owns the database or the sync path.
2. **Monthly** when it has no import edges and no effect on the build, or it is a quiet leaf: under 200 lines in 30 days, under 1,000 in 90, and at most 5 neighbours.
3. **Weekly** otherwise.

<!-- area-map-graph:cadence -->
Lines are added plus deleted on main from 2026-10-26 (30 days) and 2026-08-27 (90 days). Lockfiles and binaries are left out. A commit counts once for each area it touches. A path that is gone at the tip is counted on the apart line, not in an area row. Edges are distinct neighbours on the graph above.

| Area | Kind | 30 days: commits / lines | 90 days: commits / lines | Edges in / out (neighbours) | Cadence | Reason |
|---|---|---|---|---|---|---|
| bridge | functional | 2 / 3 | 19 / 1,368 | 7 / 12 (12) | Nightly | 10+ neighbours |
| store | data | 0 / 0 | 6 / 1,053 | 9 / 3 (10) | Nightly | 10+ neighbours; owns the database path; owns the sync path |
| discover | functional | 0 / 0 | 5 / 342 | 9 / 10 (10) | Nightly | 10+ neighbours |
| runtime | functional | 0 / 0 | 0 / 0 | 11 / 11 (11) | Nightly | 10+ neighbours |
| shell | functional | 0 / 0 | 0 / 0 | 11 / 10 (11) | Nightly | 10+ neighbours |
| ops | ops | 10 / 1,627 | 29 / 4,546 | 0 / 0 (0) | Weekly | no import edges, but it sets which checks run |
| pipeline | functional | 1 / 1,128 | 6 / 2,607 | 5 / 5 (6) | Weekly | 1,000+ lines in 90 days |
| packs | data | 1 / 118 | 12 / 1,331 | 7 / 5 (8) | Weekly | 1,000+ lines in 90 days |
| hunt | functional | 0 / 0 | 14 / 4,344 | 4 / 8 (8) | Weekly | 1,000+ lines in 90 days |
| xplore | functional | 0 / 0 | 2 / 192 | 8 / 5 (9) | Weekly | 9 neighbours |
| kanithanj-v0 | functional | 19 / 9,310 | 19 / 9,310 | 0 / 0 (0) | Monthly | no import edges |
| docs | docs | 10 / 358 | 59 / 6,227 | 0 / 0 (0) | Monthly | no import edges |
| network | data | 1 / 4 | 3 / 53 | 4 / 4 (5) | Monthly | quiet leaf |
| cv-renderer | functional | 1 / 2 | 12 / 2,946 | 0 / 0 (0) | Monthly | no import edges |
| ingest | data | 0 / 0 | 2 / 822 | 1 / 2 (3) | Monthly | quiet leaf |
| credentials | functional | 0 / 0 | 1 / 383 | 4 / 5 (5) | Monthly | quiet leaf |
| hire-board | data | 0 / 0 | 1 / 1 | 3 / 4 (5) | Monthly | quiet leaf |
| profile-data | data | 0 / 0 | 1 / 1 | 2 / 0 (2) | Monthly | quiet leaf |
| quest | functional | 0 / 0 | 0 / 0 | 3 / 4 (5) | Monthly | quiet leaf |

5 nightly, 5 weekly, 9 monthly.

Apart from area rows: 30 days 9 commits / 3,480 lines; 90 days 52 commits / 22,495 lines.
<!-- /area-map-graph:cadence -->

## Schedule (UTC)

| When | What |
|---|---|
| About 01:00 daily | laptop-1 writes the encrypted database snapshot; box runs the merge as a dry run and applies only if clean. The timer follows laptop-1 local time, so in winter this moves to about 02:00 UTC. |
| 02:30 daily | Nightly area review. The data part reads the snapshot receipt first; a missing receipt is itself a finding. |
| Monday 03:30 | Weekly area review |
| 1st of the month 04:30 | Monthly area review, then recompute the churn table and area map from a fresh 30 / 90-day window and let the cadence follow |

The box to laptop-1 direction runs only on demand, never on the daily timer.

## Acceptance

- [x] TODO: script that rebuilds the area graph (TS imports, Rust module paths, IPC command names) and the churn table, with its output committed

## Review

Per-PR review is green CI plus the area owner's look. That is the check while a pull is open. Pulls that already merged keep the bar they met when they landed, and this does not lower that bar.
