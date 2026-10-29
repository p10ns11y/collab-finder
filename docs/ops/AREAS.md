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

An arrow means depends on. Edges were read from TS imports, Rust paths, and IPC names on main at `e155c47`: 88 directed edges. The hub edge folds 55 links (UI kit, messages, IPC). The other 33 are drawn. `<-->` is a two-way pair.

15 areas share one tree. `bridge` has 12 neighbours. `store` is the data area the most others depend on. Cycles run through `shell`, `runtime`, `bridge`, `discover`, `hunt`, `xplore`, `pipeline`, `quest`, `credentials`, `store`, `packs`, `ingest`, `network`, and `hire-board`. `profile-data` only has incoming edges. `cv-renderer`, `ops`, and `docs` have none. `ops` still chooses which checks run.
<!-- /area-map-graph:mermaid -->

`*` stays inside one path segment. `**` walks directories. `docs/ops/areas.json` is the config the check reads.

## Paths

| Area | Kind | Owns |
|---|---|---|
| shell | functional | `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `src/app/**`, `src/shell/**`, `src/lib/**`, `src/index.css`, `src/types/**`, `src/view/finder-app-view.tsx`, `src/view/screens/heading-screen.tsx`, `src/components/layout/**`, `src/components/ui/**`, `src/components/finder/command-palette.tsx`, `src/components/finder/error-banner.tsx`, `src/core/domain/finder-nav*`, `src/core/domain/finder-keyboard*`, `src/core/domain/heading-*`, `index.html` |
| runtime | functional | `src/core/finder/**`, `src/core/mvu/**`, `src/runtime/**`, `src/ports/finder-port.ts`, `src/core/async.ts`, `src/core/result.ts`, `src/core/error.ts` |
| bridge | functional | `src/adapters/tauri/**` except `src/adapters/tauri/credentials-adapter.ts`, `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/capabilities/**`, `src-tauri/tauri.conf.json`, `src-tauri/build.rs` |
| discover | functional | `src-tauri/src/opportunity_target.rs`, `src-tauri/src/cv_home.rs`, `src-tauri/src/xai.rs`, `src-tauri/src/llm_route.rs`, `src/core/domain/application-pack.ts`, `src/core/domain/cv-*`, `src/core/domain/discover-*`, `src/core/domain/devprofile-path-panel*`, `src/core/domain/fit-*`, `src/core/domain/llm-route*`, `src/core/domain/opportunity-rail-label*`, `src/core/domain/opportunity-target*`, `src/core/domain/opportunity-url*`, `src/core/domain/fixtures/**`, `src/components/finder/opportunity-target-fit-panel.tsx`, `src/components/finder/artifact-reader.tsx`, `src/components/finder/cv-*`, `src/view/screens/discover-screen.tsx`, `scripts/fit-calibration.mjs` |
| hunt | functional | `src-tauri/src/platsbanken.rs`, `src-tauri/src/mission_firms.rs`, `src-tauri/src/america_eu.rs`, `src-tauri/src/product_lane.rs`, `src-tauri/src/commands/hunt.rs`, `src-tauri/tests/**`, `src/core/domain/hunt-rails*`, `src/core/domain/platsbanken*`, `src/core/domain/mission-*`, `src/core/domain/sweden-hunt*`, `src/components/finder/hunt-*`, `src/view/screens/sweden-screen.tsx`, `src/view/screens/mission-screen.tsx`, `data/hunt-presets/**`, `data/mission-firms/**`, `scripts/generate-firm-list.mjs`, `scripts/qa-platsbanken-freshness.sh`, `docs/qa/**` |
| xplore | functional | `src-tauri/src/finder_reactor.rs`, `src-tauri/src/x_search.rs`, `src-tauri/src/x_query.rs`, `src/core/domain/finder.ts`, `src/core/domain/distillation.ts`, `src/core/domain/search-presets.ts`, `src/components/finder/search-workspace.tsx`, `src/components/finder/tweet-feed.tsx`, `src/components/finder/decision-panel.tsx`, `src/components/finder/pause-log.tsx`, `src/view/screens/xplore-screen.tsx`, `data/distillation/x-search/**` |
| pipeline | functional | `src-tauri/src/qualify_policy.rs`, `src-tauri/src/decide.rs`, `src-tauri/src/decide/**`, `src-tauri/schemas/**`, `src/core/domain/history.ts`, `src/core/domain/pipeline-timeline.ts`, `src/core/domain/opportunity-pipeline*`, `src/core/domain/apply-reply-lane*`, `src/core/domain/qualify-policy*`, `src/view/screens/pipeline-screen.tsx`, `scripts/export-pipeline.mjs`, `scripts/sync-pack-artifacts.py`, `scripts/qualify-hillclimb.mjs` |
| quest | functional | `src-tauri/src/local_grok.rs`, `src/core/domain/quest*`, `src/components/finder/quest-drawer.tsx` |
| credentials | functional | `src-tauri/src/secrets.rs`, `src-tauri/src/secrets/**`, `src/core/domain/credentials.ts`, `src/core/domain/xai-key-*`, `src/core/security/**`, `src/ports/credentials-port.ts`, `src/adapters/tauri/credentials-adapter.ts`, `src/components/finder/credentials-*`, `src/view/screens/settings-screen.tsx` |
| cv-renderer | functional | `vendor/kanithanj-cv/**`, `scripts/install-kanithanj-cv.sh`, `scripts/pull-cv-renderer.sh`, `scripts/pull-cvdata.sh`, `scripts/test-cv-sot.sh`, `scripts/test-pull-*` |
| store | data | `src-tauri/src/db.rs`, `src-tauri/src/app_dirs.rs`, `src-tauri/src/pulse.rs`, `scripts/backup-db.sh`, `scripts/pulse-export.mjs`, `scripts/pulse-import.mjs`, `scripts/seed-testdata-for-ci.sh` |
| packs | data | `src-tauri/src/operator_pack.rs`, `src-tauri/src/rank_config.rs`, `src-tauri/src/environment.rs`, `src-tauri/src/firm_durability.rs`, `src-tauri/src/facts.rs`, `src/core/domain/operator-pack-health.ts`, `src/core/domain/firm-durability.ts`, `src/core/domain/firm-maintained-list*`, `src/view/screens/preferences-*`, `data/durability/**`, `data/facts/**`, `data/pipeline/**`, `scripts/seed-operator-config.sh`, `scripts/load-pipeline-config.mjs` |
| ingest | data | `src-tauri/src/research_ingest.rs`, `src-tauri/src/bin/**`, `src-tauri/fixtures/**` |
| network | data | `src-tauri/src/network_graph.rs`, `src/core/domain/network-graph.ts`, `src/view/screens/network-screen.tsx`, `data/connections.sample.csv`, `data/contacts.sample.csv`, `data/network-csv.md` |
| hire-board | data | `src-tauri/src/hire_board.rs`, `src/core/domain/hire-board.ts`, `src/components/finder/hire-board-panel.tsx`, `data/hire-board/**` |
| profile-data | data | `data/distillation/**` except `data/distillation/x-search/**`, `scripts/prune-public-projects.mjs` |
| ops | ops | `.github/**`, `scripts/ci-*`, `scripts/run-verify.mjs`, `scripts/cut-release.sh`, `scripts/ensure-lizard.sh`, `scripts/sync-agent-skills.sh`, `scripts/gate.sh`, `scripts/area-map*`, `dx/**`, `package.json`, `pnpm-lock.yaml`, `src-tauri/Cargo.*`, `src-tauri/icons/**`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `postcss.config.js`, `stryker.config.json`, `.gitignore`, `src-tauri/.gitignore`, `session-sot.example`, `skills-lock.json` |
| docs | docs | `**/*.md`, `docs/**`, `.agents/**`, `.grok/**`, `archive/**`, except `docs/qa/**`, `data/**`, `vendor/**`, `.github/**`, `src-tauri/tests/**` |

## Cadence

In order:

1. **Nightly** when the area has 1,500+ lines in 30 days, or 10+ neighbours, or it owns the database or the sync path.
2. **Monthly** when it has no import edges and no effect on the build, or it is a quiet leaf: under 200 lines in 30 days, under 1,000 in 90, and at most 5 neighbours.
3. **Weekly** otherwise.

<!-- area-map-graph:cadence -->
Lines are added plus deleted on main from 2026-09-22 (30 days) and 2026-07-24 (90 days). Lockfiles and binaries are left out. A commit counts once for each area it touches. A path that is gone at the tip is counted on the apart line, not in an area row. Edges are distinct neighbours on the graph above.

| Area | Kind | 30 days: commits / lines | 90 days: commits / lines | Edges in / out (neighbours) | Cadence | Reason |
|---|---|---|---|---|---|---|
| hunt | functional | 5 / 3,220 | 29 / 9,094 | 4 / 8 (8) | Nightly | 1,500+ lines in 30 days |
| discover | functional | 5 / 765 | 28 / 8,466 | 9 / 10 (10) | Nightly | 10+ neighbours |
| shell | functional | 6 / 723 | 24 / 4,834 | 11 / 10 (11) | Nightly | 10+ neighbours |
| bridge | functional | 7 / 358 | 34 / 2,680 | 7 / 12 (12) | Nightly | 10+ neighbours |
| runtime | functional | 2 / 39 | 30 / 2,985 | 11 / 11 (11) | Nightly | 10+ neighbours |
| store | data | 1 / 39 | 13 / 2,099 | 9 / 3 (10) | Nightly | 10+ neighbours; owns the database path; owns the sync path |
| ops | ops | 10 / 2,872 | 33 / 4,003 | 0 / 0 (0) | Weekly | no import edges, but it sets which checks run |
| pipeline | functional | 2 / 1,416 | 7 / 2,899 | 5 / 5 (6) | Weekly | 1,000+ lines in 90 days |
| ingest | data | 2 / 822 | 2 / 822 | 1 / 2 (3) | Weekly | 822 lines in 30 days |
| credentials | functional | 1 / 624 | 8 / 1,622 | 4 / 5 (5) | Weekly | 1,000+ lines in 90 days |
| packs | data | 4 / 540 | 20 / 5,129 | 7 / 5 (8) | Weekly | 1,000+ lines in 90 days |
| network | data | 1 / 2 | 5 / 2,336 | 4 / 4 (5) | Weekly | 1,000+ lines in 90 days |
| xplore | functional | 1 / 2 | 5 / 396 | 8 / 5 (9) | Weekly | 9 neighbours |
| quest | functional | 0 / 0 | 7 / 1,405 | 3 / 4 (5) | Weekly | 1,000+ lines in 90 days |
| docs | docs | 25 / 1,120 | 74 / 13,548 | 0 / 0 (0) | Monthly | no import edges |
| cv-renderer | functional | 3 / 989 | 12 / 5,318 | 0 / 0 (0) | Monthly | no import edges |
| profile-data | data | 1 / 1 | 3 / 34 | 2 / 0 (2) | Monthly | quiet leaf |
| hire-board | data | 0 / 0 | 3 / 952 | 3 / 4 (5) | Monthly | quiet leaf |

6 nightly, 8 weekly, 4 monthly.

Apart from area rows: 30 days 3 commits / 1,751 lines; 90 days 18 commits / 8,530 lines.
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
