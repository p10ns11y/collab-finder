# Mission flow, persistence, and relevance

How Mission **Pull**, **Next 10**, and **Evaluate/Prepare** connect — and why restart + relevance pain can hit all three at once even when operator packs are seeded correctly.

## TL;DR findings

| Pain | Root cause | Fix direction |
|------|------------|---------------|
| **A** List empty after restart | Mission leads live in RAM (`missionFirms` MVU state); disk cache (`search_pool.json`) exists but UI never loads it on boot | Hydrate from cache on Mission mount; cache-first search |
| **B** Pull jobs feel off-profile | Pull ranks by firm heuristics + query tokens — **not** your CV | Profile keyword boost on titles; clearer UI copy |
| **C** Evaluate scores feel wrong | Frontend always sent bundled `defaultCvSummary` as `cv_summary`, **blocking** devprofile / kanithanj.cv / pack resolution on Rust | Treat distilled default as “no IPC override” unless user edited textarea |

Operator-pack-on-disk did **not** remove data — it moved the same distillation files to `~/.config/collab-finder/packs/`. Stubs only appear when seed was skipped.

---

## Four persistence lanes

Mission touches four stores that do not auto-sync on boot:

```mermaid
flowchart TB
  subgraph UI["React MVU (RAM — lost on restart)"]
    MF["missionFirms[]"]
    DF["durableFirms"]
    CV["cvSummary textarea"]
  end

  subgraph LS["localStorage"]
    CVLS["cf.cvSummary"]
    EDIT["cf.cvSummaryUserEdited"]
    SESS["cf.lastSession"]
  end

  subgraph SQLite["~/.local/share/collab-finder/*.db"]
    OPP["opportunities"]
    DUR["durability_iterations"]
  end

  subgraph Disk["Disk files"]
    POOL["mission_firms_cache/search_pool.json"]
    PACKS["~/.config/collab-finder/packs/*"]
    RANK["rank.json"]
  end

  MF -.->|"was NOT restored on AppStarted"| POOL
  CVLS --> CV
  EDIT --> CV
  SESS --> UI
  DUR --> DF
  PACKS --> Evaluate
  POOL -->|"Pull + force_refresh=false"| MF
```

| Store | Survives restart? | Used by |
|-------|-------------------|---------|
| `missionFirms` (RAM) | No | Mission list UI |
| `search_pool.json` | Yes | Pull cache (Rust) |
| `localStorage` CV | Yes | Discover textarea → **was** always sent to Evaluate |
| `packs/*` | Yes | Next 10, Evaluate constraints, CV fallback |
| SQLite | Yes | Imported opps, durability waves |

---

## Mission — three relevance lanes

Users treat Mission as one surface; code runs **three pipelines**:

```mermaid
flowchart LR
  subgraph Pull["Lane 1: Pull"]
    Q["query + firm chips"]
    API["Greenhouse / Lever / Ashby / JobTech"]
    CACHE["search_pool.json"]
    RANK["score_lead: firm + query + durability"]
    Q --> API --> CACHE --> RANK --> LIST["Mission list"]
  end

  subgraph Next10["Lane 2: Next 10"]
    UNI["packs/universe.json"]
    W["rank.json"]
    WAVE["firm_durability::run_wave"]
    UNI --> WAVE
    W --> WAVE --> STRIP["Durability strip"]
  end

  subgraph Eval["Lane 3: Evaluate / Prepare"]
    CVP["resolve_cv_packet()"]
    CON["constraints-*.txt"]
    XAI["xAI structured JSON"]
    CVP --> XAI
    CON --> XAI
  end

  LIST --> Eval
  STRIP -->|"Next 10"| Pull
```

| Lane | Uses CV? | Uses operator pack? |
|------|----------|---------------------|
| Pull | Optional profile boost (added) | Durability score only |
| Next 10 | No | `universe.json` + `rank.json` |
| Evaluate | Yes | constraints, proof, projects, cv-packet |

---

## Pull cache vs force refresh

```mermaid
sequenceDiagram
  participant U as User
  participant UI as MissionScreen
  participant FX as effects.ts
  participant RS as mission_firms.rs
  participant POOL as search_pool.json

  U->>UI: Restart app
  Note over UI: missionFirms = idle
  U->>UI: Open Mission
  UI->>FX: SearchRequested forceRefresh=false
  FX->>RS: force_refresh=false
  RS->>POOL: cache hit → filter pool
  RS-->>UI: leads displayed (no network)

  U->>UI: Click Pull (force)
  UI->>FX: forceRefresh=true
  RS->>POOL: fetch APIs, append pool
```

**Previous bug:** `MissionFirmsSearchRequested` defaulted `forceRefresh` to true when omitted, so Enter and filter toggles always hit the network and ignored cache.

---

## CV packet resolution (Evaluate / Prepare)

```mermaid
flowchart TD
  START["resolve_cv_packet() in Rust"]
  IPC{"Frontend cv_summary\n(non-empty IPC)?"}
  T2{"devprofile path?"}
  T3{"kanithanj.cv + cvdata?"}
  T4["packs/cv-packet.txt"]
  STUB["STUB placeholder"]

  START --> IPC
  IPC -->|yes| USE0["Use IPC text"]
  IPC -->|no| T2
  T2 -->|pruned cvdata| USE2["devprofile"]
  T2 -->|no| T3
  T3 -->|yes| USE3["kanithanj.cv"]
  T3 -->|no| T4
  T4 -->|missing| STUB

  USE0 & USE2 & USE3 & T4 --> PROMPT["xAI: CV + constraints + JD"]
```

### Sneaky bug (Lane 3)

Boot flow always set `cvSummary` to bundled `defaultCvSummary` from `queries.json` and persisted it to `localStorage`. Analyze sent that ~6k string as `cv_summary` on **every** Evaluate — so Rust never reached devprofile or kanithanj.cv even when configured.

**Fix:** `cvSummaryForIpc` returns `undefined` when the textarea still holds the distilled default and the user has not edited it (`cf.cvSummaryUserEdited`). Rust then runs the full resolution chain.

Priority after fix:

1. User-edited textarea
2. devprofile path → pruned `cvdata.json`
3. kanithanj.cv home
4. `~/.config/collab-finder/packs/cv-packet.txt`
5. Stub (only if packs unseeded)

---

## Operator pack abstraction

```mermaid
flowchart TD
  SEED["scripts/seed-operator-config.sh"]
  PACKS["~/.config/collab-finder/packs/"]
  OP["operator_pack.rs"]
  STUB["STUB_* in binary"]

  SEED --> PACKS
  PACKS -->|file exists| OP
  PACKS -->|missing| STUB
  OP --> DUR["firm_durability / Next 10"]
  OP --> OT["opportunity_target Evaluate/Prep"]
  OP --> MF["mission_firms profile boost"]
```

Same distillation sources as before (`data/distillation/`, `data/durability/`). Nothing compiled into the binary anymore.

Verify packs:

```bash
ls ~/.config/collab-finder/packs/
./scripts/seed-operator-config.sh   # if empty or stub-sized
```

---

## Verify locally

```bash
# Cache exists after at least one Pull
wc -c ~/.local/share/collab-finder/mission_firms_cache/search_pool.json

# Packs seeded
ls -la ~/.config/collab-finder/packs/cv-packet.txt universe.json

# IPC contract
node src/core/domain/opportunity-target-ipc.verify.mjs
```

In app:

1. Restart → open Mission → list should hydrate from cache without Pull.
2. Preferences → set devprofile path → Evaluate without editing CV textarea → packet should come from live cvdata.
3. Pull → titles with your stack keywords should rank higher (profile boost).

---

## Related code

| Area | Path |
|------|------|
| Mission UI | `src/view/screens/mission-screen.tsx` |
| Search effects | `src/core/finder/effects.ts` |
| Pull cache | `src-tauri/src/mission_firms.rs` |
| CV IPC contract | `src/core/domain/opportunity-target-ipc.ts` |
| CV resolve | `src-tauri/src/opportunity_target.rs` → `resolve_cv_packet` |
| Operator pack | `src-tauri/src/operator_pack.rs` |
| Config docs | `docs/config.md` |
