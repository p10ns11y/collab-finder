# CI and quality gates

collab-finder uses a **gate** (must pass) plus **complexity** and **CRAP report** (quality signals).

## Local commands

```bash
pnpm run verify      # all domain *.verify.mjs runners (pure TS machines + wiring)
pnpm run gate        # install + build + verify + seed testdata + cargo test --lib
pnpm run complexity  # Lizard cyclomatic complexity (CCN ≤ 15, same default as thepulimaangani)
```

Before push on Rust or domain logic changes, run **`pnpm run gate`**.

## What the gate covers

| Layer | Check | Why |
|-------|--------|-----|
| TypeScript | `tsc -b` + Vite build | UI compiles |
| Domain | 16 verify runners under `src/` | Critical MVU machines, IPC contracts, keyboard/nav, wiring |
| Rust | `cargo test --lib` (163+ tests) | Secrets stability, reactor, opportunity target, rank, cv_home |
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

- **gate** — build + verify + Rust tests (required)
- **complexity** — Lizard CCN gate (required)
- **crap_report** — coverage + complexity artifact upload (informational)

Release builds remain on tag push via `.github/workflows/release.yml`.
