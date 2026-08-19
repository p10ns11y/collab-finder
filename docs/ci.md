# CI and quality gates

collab-finder uses a **check** job on every push/PR, plus **complexity** and **CRAP report** only when app source changes. **Full Vite + Tauri binary build** runs on **tag push** (`release.yml`), not on docs/agent-only diffs.

## Local commands

```bash
pnpm run verify      # all domain *.verify.mjs runners (pure TS machines + wiring)
pnpm run ci-check    # same as GitHub check job (type-check + verify + cargo test)
pnpm run gate        # ci-check + Vite build — run before push when UI/build inputs changed
pnpm run complexity  # Lizard cyclomatic complexity (CCN ≤ 15, same default as thepulimaangani)
```

Before push on Rust or domain logic changes, run **`pnpm run ci-check`** (or **`pnpm run gate`** when Vite inputs changed).

## What runs where

| Layer | Local `ci-check` | Local `gate` | GitHub PR (any diff) | GitHub PR (code diff) | Tag `v*.*.*` |
|-------|------------------|--------------|----------------------|------------------------|--------------|
| TypeScript | `tsc -b` | `tsc -b` + Vite | yes | yes | yes (via release build) |
| Domain verify | yes | yes | yes | yes | — |
| Rust tests | yes | yes | yes | yes | — |
| Lizard CCN | — | — | skip | yes | — |
| CRAP artifact | — | — | skip | yes | — |
| Tauri binary | — | — | skip | skip | yes |

**Docs / agent-only diffs** (`.agents/`, `docs/`, `AGENTS.md`, …): still run type-check, verify, and Rust tests; skip Vite bundle, complexity, and CRAP.

## What the check covers

| Layer | Check | Why |
|-------|--------|-----|
| TypeScript | `tsc -b` | Types + project references |
| Domain | verify runners under `src/` | Critical MVU machines, IPC contracts, keyboard/nav, wiring |
| Rust | `cargo test --lib` | Secrets stability, reactor, opportunity target, rank, cv_home |
| Fixtures | `scripts/seed-testdata-for-ci.sh` | Populates gitignored `src-tauri/testdata/` from public distillation stubs |

Verify runners are **behavioral** tests (not line-coverage theater): they assert invariants on pure reducers and static wiring for hiring-loop paths.

## Cyclomatic complexity

Rust: **CCN ≤ 15** per function (Lizard). CI allows a **baseline of 14** existing violations (`LIZARD_RUST_WARN_BASELINE`) — new violations fail the job. TypeScript `src/core` must stay at **0** warnings.

Goal: drive Rust baseline to **0** by refactoring hot spots (see CRAP report artifacts).

Scanned trees:

- `src-tauri/src` (Rust backend)
- `src/core` (pure domain)

## CRAP report (CI artifact)

The **`crap_report`** workflow job merges Lizard complexity with Rust `cargo llvm-cov` line coverage (Agitar CRAP formula — same pattern as thepulimaangani).

Report-only for now; tighten with:

```bash
python3 dx/crap_report.py ... --max-mean 30
```

when baseline is stable.

## GitHub Actions

`.github/workflows/ci.yml`:

- **changes** — detect app-source diff (`scripts/ci-paths-changed.sh`)
- **check** — type-check + verify + Rust tests (always; replaces old gate job)
- **complexity** — Lizard CCN gate (app-source diffs only)
- **crap_report** — coverage + complexity artifact upload (app-source diffs only)

Release builds remain on tag push via `.github/workflows/release.yml`.
