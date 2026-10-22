# Steering: collab-finder as a facts feeder

collab-finder stops being a second job-hunt app. It becomes a small, deterministic tool that answers two questions about firms and hands the answers to the pick step downstream:

1. **Is this firm stable?** Public IR cash evidence, already in `data/durability/universe.v1.json`.
2. **Do I know someone there?** Local connection exports, already parsed by `network_graph.rs`.

Finding, ranking, packing, applying and follow-ups belong to the downstream app. collab-finder does none of them.

```mermaid
flowchart LR
  subgraph CF["collab-finder (public, det)"]
    U["universe.v1.json<br/>public IR"] --> FF["facts firms"]
    N["connections.csv<br/>local, gitignored"] --> FW["facts warm"]
    FF --> OUT[("facts.json<br/>per firm, 0..1 + basis")]
    FW --> OUT
  end
  OUT -->|read-only file| K["downstream pick step<br/>(general layer)"]
  K -. never writes back .-> CF
```

## The one contract

`facts.json` uses the general-layer shape: keyed by firm id, each value `{value 0..1, basis}`, and a missing value means unknown. collab-finder never guesses a value.

| Sub-input | From | Rule (det) |
|---|---|---|
| `comp_stability.funding_runway` | `fortress` (0..4) + `cash` | `fortress / 4`; basis = `fy` + IR source URL |
| `culture.layoff_history` | `note` / cash trend | parked until there is a sourced field |
| `hire_likelihood.referral_or_warm_intro` | connections by company | ex-colleague ⇒ 1.0, first-degree ⇒ 0.6, no match ⇒ unknown |
| `red_flags` (soft) | `hiring_signal == 0`, `theater_saas` | soft flag with reason; never `hard` |

Warm-path output holds **counts per firm only**. No names, emails or profiles ever leave collab-finder.

## Lanes

```mermaid
flowchart TD
  Q{Can a rule decide it?} -->|yes| DET[det: v1 is all here]
  Q -->|no, typed + repeated| S1[s1: none planned]
  Q -->|no, unstructured| S2["s2, parked: IR PDF to cash evidence,<br/>cached by doc hash, then det"]
  Q -->|his fact or his click| H[human: confirm unsure firm matches]
```

v1 makes no SI calls. `xai.rs`, `llm_route.rs`, `local_grok.rs` and `finder_reactor.rs` work (their tests pass and the xAI path answers live), but SI belongs in Ensembly and Kanithanj (private). They move there and leave collab-finder, rather than staying as fallbacks.

## Keep / cut

```mermaid
flowchart LR
  subgraph KEEP["KEEP (det core)"]
    k1["firm_durability.rs"]
    k2["environment.rs + rank_config.rs"]
    k3["operator_pack.rs (places only)"]
    k4["network_graph.rs"]
    k5["app_dirs.rs"]
  end
  subgraph CUT["CUT (downstream owns it)"]
    c1["mission_firms.rs, platsbanken.rs, hire_board.rs"]
    c2["opportunity_target.rs"]
    c3["cv_home.rs, vendor/kanithanj-cv"]
    c4["pipeline, discover, sweden, mission screens"]
  end
  subgraph CUTSI["MOVE (working SI, moving to Ensembly/Kanithanj)"]
    s1["finder_reactor.rs"]
    s2["local_grok.rs"]
    s3["xai.rs, llm_route.rs"]
  end
```

The PR #101 marker list is reused as the delete order. Items are deleted one slice at a time, with no `#[deprecated]` step in between.

## Order

```mermaid
flowchart LR
  A[1 steering doc + identity] --> B[2 facts firms CLI] --> C[3 facts warm CLI]
  B --> D[4 cut quest]
  D --> E[5 cut xplore, move SI out]
  E --> F[6 cut hunt sources + CV]
  F --> G{7 shell: anyone opening it?}
  G -->|no| H[drop Tauri, CLI only]
  G -->|yes| I[two screens: Firms, Matches]
```

Each slice is one PR. Each slice is green on `pnpm gate` and `cargo test`. A cut PR deletes the code, its tests and its IPC commands together.

## Out of scope

- Any change to the downstream app. Merging several facts files there is its own task.
- Real data in git. Fixtures stay synthetic: `data/*.sample.csv`, the example universe.
