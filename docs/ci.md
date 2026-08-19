# CI and quality gates

collab-finder uses a **check** job on every push/PR, plus **complexity** and **CRAP report** only when app source changes. **Full Vite + Tauri binary build** runs on **tag push** (`release.yml`), not on docs/agent-only diffs.

## Local commands

```bash
pnpm run verify      # all domain *.verify.mjs runners (pure TS machines + wiring)
pnpm run ci-check-light  # meta/agent/docs PR parity (type-check + verify)
pnpm run ci-check    # app-source parity (above + Rust tests)
pnpm run gate        # ci-check + Vite build — run before push when UI/build inputs changed
pnpm run complexity  # Lizard cyclomatic complexity (CCN ≤ 15, same default as thepulimaangani)
```

Before push on Rust or domain logic changes, run **`pnpm run ci-check`** (or **`pnpm run gate`** when Vite inputs changed).

## What runs where

| Layer | Local `ci-check-light` | Local `ci-check` | GitHub PR (meta diff) | GitHub PR (`src/` diff) | Tag `v*.*.*` |
|-------|------------------------|------------------|------------------------|-------------------------|--------------|
| TypeScript | `tsc -b` | `tsc -b` | yes | yes | yes (via release build) |
| Domain verify | yes | yes | yes | yes | — |
| Rust tests | — | yes | skip | yes | — |
| WebKit apt | — | yes | skip | yes | yes |
| Lizard CCN | — | — | skip | yes | — |
| CRAP artifact | — | — | skip | yes | — |
| Tauri binary | — | — | skip | skip | yes |

**Docs / agent / scripts / CI config diffs**: run type-check + verify only (`ci-check-light`); skip WebKit, Rust tests, complexity, and CRAP. **WebKit + Tauri binary build** only on **`src/` or `src-tauri/`** diffs (check job) or **tag push** (`release.yml`).

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

- **changes** — detect `src/` / `src-tauri/` diff (`scripts/ci-paths-changed.sh`)
- **check** — light (type-check + verify) or full (+ WebKit + Rust) based on `app_source`
- **complexity** — Lizard CCN gate (`src/` / `src-tauri/` diffs only)
- **crap_report** — coverage + complexity artifact (`src/` / `src-tauri/` diffs only)

Release builds remain on tag push via `.github/workflows/release.yml`.
