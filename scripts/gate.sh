#!/usr/bin/env bash
# Full local CI parity — Vite build + verify + Rust tests.
# GitHub CI uses scripts/ci-check.sh (no Vite bundle); tag push uses release.yml for binary build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

echo "== pnpm run build (tsc + vite)"
pnpm run build

echo "== domain verify runners"
node scripts/run-verify.mjs

echo "== seed Rust test fixtures"
bash scripts/seed-testdata-for-ci.sh

echo "== cargo test --lib"
cd src-tauri
cargo test --lib -- --test-threads=1

echo "== OK: gate passed"
