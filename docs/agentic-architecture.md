# Agentic architecture — collab-finder

Living map of how autonomy, guards, and the desktop shell fit together. Skills with full detail: `.agents/skills/agentic-reactor/`, `finder-reactor/`, `tauri-agentic/`, `cv-promote-guard/`, `x-agent-resources/`.

## Principles

- **Autonomy with self-guards** — no silent high-stakes actions (CV promote, spend, post).
- **Structured decisions** — xAI JSON with confidence, rationale, guards (target; partial stubs today).
- **Composability** — Tauri commands today; MCP exposure planned for external agents.
- **X official resources** — `skill.md` / `llms.txt` vendored under `.agents/x-resources/` for prompts.
- **CV promote** — sidecar, diff preview, explicit confirm (`cv-promote-guard` skill).

## System overview

```mermaid
flowchart TB
  subgraph ui [React shell]
    View[finder-app-view]
    MVU[MVU program core/finder]
    View --> MVU
  end

  subgraph bridge [TypeScript ports]
    Ports[ports/finder + credentials]
    Adapters[adapters/tauri]
    MVU --> Ports --> Adapters
  end

  subgraph tauri [Tauri Rust]
    Cmd[lib.rs commands]
    Sec[secrets keyring + file]
    React[finder_reactor]
    XAPI[X API v2 recent search]
    Adapters --> Cmd
    Cmd --> Sec
    Cmd --> React
    Cmd --> XAPI
  end

  subgraph future [Planned]
    MCP[MCP server]
    xAI[xAI structured decide]
    CV[devprofile CV guard]
    MCP -.-> Cmd
    React -.-> xAI
    React -.-> CV
  end
```

## TypeScript layers (shipped)

| Layer | Path | Role |
|-------|------|------|
| **Domain** | `src/core/domain/finder.ts` | Tweet, Decision, ReactorState types |
| **MVU** | `src/core/mvu/engine.ts` | Program/update/cmd loop |
| **Finder model** | `src/core/finder/*` | Model, messages, update, effects, selectors |
| **Policy** | `src/core/security/credentials-policy.ts` | Bearer validation, connection gate |
| **Ports** | `src/ports/*` | Interfaces for testability |
| **Adapters** | `src/adapters/tauri/*` | `invoke` + `Result` error mapping |
| **Runtime** | `src/runtime/finder-runtime.ts` | Wires program + ports for React |
| **View** | `src/view/finder-app-view.tsx` | Composes finder panels |

```mermaid
sequenceDiagram
  participant U as User
  participant V as View
  participant M as MVU update
  participant E as effects
  participant A as Tauri adapter
  participant R as Rust command

  U->>V: Run search
  V->>M: SearchRequested
  M->>E: searchCmd
  E->>A: finder.search(query)
  A->>R: search_x_recent
  R-->>A: XTweet[]
  A-->>E: Result
  E->>M: SearchSucceeded
  M-->>V: re-render feed
```

## Rust backend

| Module | Role |
|--------|------|
| `src-tauri/src/lib.rs` | Tauri commands, live `search_x_recent` |
| `src-tauri/src/secrets.rs` | Keyring + file_store for bearer |
| `src-tauri/src/finder_reactor.rs` | Guards, lead state, stub cycle/xAI |

**Guard examples** (reactor; enforcement grows with real xAI/X):

- Cost — before xAI calls
- X rate — from skill context + headers
- Fit — threshold → pause
- CV promote — delegate to cv-promote-guard (not wired to devprofile yet)

## Autonomous cycle (current behavior)

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> SearchUI: User search (MVU)
  SearchUI --> XLive: search_x_recent
  XLive --> Idle: tweets in feed

  Idle --> CycleUI: Run autonomous cycle
  CycleUI --> Reactor: run_finder_cycle_cmd
  Reactor --> StubSearch: guarded_search placeholder
  StubSearch --> Heuristic: stub analyze_lead
  Heuristic --> Decision: Decision JSON to UI
  Decision --> Idle
```

Until `guarded_search` delegates to the same HTTP path as `search_x_recent`, the cycle can return decisions without live tweets.

## Pauses and intervention

- **UI** — guard dashboard, pause log, decision panel, credentials gate
- **Future MCP** — pause responses + `ask_user`
- **Logging** — pause reasons in reactor state for meta-improvement

## Milestone matrix

| Capability | Shipped | Next |
|------------|---------|------|
| X recent search | Yes (`lib.rs`) | Query presets, rate telemetry |
| Secure bearer | Yes (`secrets`) | OAuth / xurl alignment |
| MVU UI shell | Yes | More guard-driven pauses |
| Reactor live search in cycle | No | Wire `guarded_search` → X API |
| xAI decisions | No | Pruned CV + skill.md prefix |
| MCP agent API | No | stdio server over commands |
| CV promote guard | No | devprofile path config + sidecar UI |

## Related docs

- [SETUP.md](./SETUP.md) — install, credentials, verify commands
- [tauri-commands.md](./tauri-commands.md) — invoke contract table
- [x-tools.md](./x-tools.md) — official X agent resources
- Interactive walkthrough: [architecture canvas](/home/sustainableabundance/.cursor/projects/home-sustainableabundance-Work-personal-collab-finder/canvases/collab-finder-architecture.canvas.tsx) (open beside chat in Cursor)

## Exponential development

- `.agents/` skills + fusion/fission for compounding dev velocity
- BDD on guard tables (`bdd-strategizer`) as behavior hardens
- Worktrees for parallel reactor vs UI vs prompt work (`git-worktrees`)

This doc is the canonical architecture reference; keep it aligned with `docs-reliability-review` findings when milestones land.
