# CI and quality gates

collab-finder uses a **light check** on most PRs (type-check + verify). **WebKit + Rust tests + CRAP** run only on **version manifest** diffs; **Tauri binary** builds on **tag push** (`release.yml`).

## Local commands

```bash
pnpm run verify           # all domain *.verify.mjs runners
pnpm run ci-check-light   # PR parity for meta / src-only diffs (no WebKit)
pnpm run ci-check         # version-bump / pre-release parity (+ Rust tests; needs WebKit locally)
pnpm run gate             # ci-check + Vite build — before push when UI inputs changed
pnpm run complexity       # Lizard (CCN ≤ 15)
```

Before push on Rust changes, run **`pnpm run ci-check`** locally (WebKit required on Linux). Meta/agent/docs-only: **`pnpm run ci-check-light`** is enough.

## What runs where

| Layer | Meta / agent / scripts | `src/` only | Version bump in diff | Tag `v*.*.*` |
|-------|------------------------|-------------|----------------------|--------------|
| Type-check + verify | yes | yes | yes | yes (release build) |
| Rust tests | — | — | yes (+ WebKit) | yes (+ WebKit) |
| Lizard CCN | — | yes | yes | — |
| CRAP artifact | — | — | yes (+ WebKit) | — |
| Tauri binary | — | — | — | yes |

Version manifests: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.

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

- **changes** — `app_source` (`src/` / `src-tauri/`) and `release_build` (version manifests)
- **check** — light always except version-bump diffs (then WebKit + Rust tests)
- **complexity** — Lizard when `app_source`
- **crap_report** — when `release_build` (needs WebKit)

Release builds remain on tag push via `.github/workflows/release.yml`.
