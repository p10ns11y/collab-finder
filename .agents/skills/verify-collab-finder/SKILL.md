---
name: verify-collab-finder
description: >
  Prove Gate verification map for collab-finder features. Use when validating a PR,
  running VerifySoT, or proving a surface (Tauri IPC + UI) with surviving evidence.
  Triggers: verify collab-finder, Prove Gate, pack health, Preferences operator pack,
  pipeline hash, Meta+3 Pipeline.
---

# verify-collab-finder

> **VerifySoT overlay:** [.agents/overlays/collab-finder-verify.md](../../.agents/overlays/collab-finder-verify.md)  
> **Session SoT:** `~/life-os/Projects/collab-finder/README.md` (`next_action` before code)

```text
TS/TSX        → pnpm type-check
domain TS     → pnpm verify
src-tauri/src → cd src-tauri && cargo test
CI parity     → pnpm gate
¬ pnpm lint · ¬ pnpm precommit
```

## Feature map

| Feature | Primary surface | IPC / entry | Headless proof | Seed / fixtures |
|---------|-----------------|-------------|----------------|-----------------|
| **Operator pack health** | Preferences → `OperatorPackHealthPanel` | `get_operator_pack_status` (`src-tauri/src/operator_pack.rs`) | `cargo test pack_status_tests` after `bash scripts/seed-testdata-for-ci.sh` | `./scripts/seed-operator-config.sh` (user packs); CI: `scripts/seed-testdata-for-ci.sh` |
| Rank packs | Preferences → `RankConfigPanel` | `get_rank_config`, `save_rank_config` | domain verify + Rust rank tests | `rank.json` via seed script |
| Fit mode | Preferences → `FitModePanel` | (view state) | `pnpm verify` | — |
| LLM route | Preferences → `LlmRoutePanel` | (view state) | `pnpm verify` | — |
| **Pipeline nav** | Sidebar **Pipeline** · `#pipeline` · **Meta+3** | `finder-nav.ts` (`HASH_SCREENS`) · `finder-keyboard.ts` (`SCREEN_BY_DIGIT['3']`) | `pnpm verify` → `finder-nav.verify` + `finder-keyboard.verify` | Docs: `docs/GUIDE.md` Navigation (Meta+1…9) |

### Operator pack health — UI contract

- **Route:** App → **Preferences** (`src/view/screens/preferences-screen.tsx`) → full-width **Operator pack health** card (`OperatorPackHealthPanel` in `preferences-panels.tsx`).
- **Badge labels:** `healthy` → **Seeded**; `stub` → **Stub identity**; `missing` → **Missing**; `degraded` → **Degraded**.
- **Actions:** **Refresh status** re-invokes `get_operator_pack_status` (no network).
- **Packs path:** `~/.config/collab-finder/packs/` (or `rank.json` `pack_dirs` override via `rank_config`).
- **Do not** dual-write ensembly SQLite when seeding or testing packs.

## Prove Gate workflow (per feature)

1. **Confirm tip** — `git rev-parse HEAD`; match PR `headRefOid`.
2. **CI truth** — `gh pr view <n> --json statusCheckRollup`. Note: PR CI may run `ci-check-light.sh` only (no Rust) unless `release_build=true`.
3. **Type-check** — `pnpm install` then `pnpm type-check` (exit 0 required).
4. **Rust unit proof** — `bash scripts/seed-testdata-for-ci.sh` then:
   ```bash
   cd src-tauri && cargo test pack_status_tests -- --nocapture
   ```
   Linux deps if link fails: `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libssl-dev`, `pkg-config`. Rust **stable ≥ 1.98** (edition2024 crates).
5. **Domain verify** — `pnpm verify` (report pass ratio; known `.ts` runner gaps are pre-existing).
6. **Full gate** (optional) — `pnpm gate` = build + verify + seed + `cargo test --lib`.
7. **GUI interview** (when Tauri runs) — open Preferences, confirm badge + file table + Refresh; screenshot to `/opt/cursor/artifacts/`.
8. **Evidence** — write `summary.json` under `/opt/cursor/artifacts/prove-gate-<pr>/` with commands, exit codes, and verdict.

## Operator pack health — expected test matrix

| Test | Asserts |
|------|---------|
| `pack_status_reports_missing_dir_as_missing` | `health == Missing`, `!seeded` |
| `pack_status_healthy_with_test_fixtures` | `health == Healthy`, `seeded`, cv-packet size > 100 |
| `pack_status_detects_stub_cv_packet` | `health == Stub`, `!seeded` |

**Seed fixtures:** `scripts/seed-testdata-for-ci.sh` copies 12 files into `src-tauri/testdata/`, matching all `EXPECTED_PACK_FILES` in `operator_pack.rs` (including `x-search-queries.json`, `hunt-rails.json`, `mission-firms.json`). After seeding, `pack_status_healthy_with_test_fixtures` asserts **Healthy** + `seeded`.

## Pipeline hash + Meta+3 — expected test matrix

| Test | Asserts |
|------|---------|
| `finder-nav.verify` `#pipeline → pipeline` | `screenFromHash('#pipeline') === 'pipeline'` (`HASH_SCREENS` includes `pipeline`) |
| `finder-nav.verify` `pipeline → #pipeline` | `hashFromScreen('pipeline') === '#pipeline'` |
| `finder-keyboard.verify` `digit 3 → pipeline` | `SCREEN_BY_DIGIT['3'] === 'pipeline'` (SidebarNav order; **not** Mission) |
| `finder-keyboard.verify` `meta+3 → pipeline` | `resolveShellHotkey('3', { meta: true })` → `{ kind: 'screen', screen: 'pipeline' }` |

Dogfood scar (#38): Meta+3 used to land on Mission. GUIDE Navigation is Meta+1…9 with Pipeline at **3**. Prove Gate for nav: run the two verify runners above; do not treat Preferences pack-health as coverage.

## Done when

- Commands re-run locally with captured exit codes (trust artifacts, not agent summaries).
- Verdict: **VERIFIED** | **NOT VERIFIED** | **BLOCKED** with reason.
- Feature map entry exists for the proved surface.
- Verify skill changes land in a **separate** PR (`chore(verify): …`), not bundled with product fixes unless unavoidable.

## Do not

- Merge product PRs from Prove Gate runs.
- `secret-tool` / log bearer tokens.
- Resurrect Game routes.
- Claim `cargo test` passed when CI only ran `ci-check-light.sh`.
