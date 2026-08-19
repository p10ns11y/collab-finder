#!/usr/bin/env bash
# PR/push CI — type-check, domain verify, Rust tests. No Vite bundle (release tag builds binary).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

echo "== pnpm type-check (tsc -b)"
pnpm run type-check

echo "== domain verify runners"
node scripts/run-verify.mjs

echo "== seed Rust test fixtures"
bash scripts/seed-testdata-for-ci.sh

echo "== cargo test --lib"
cd src-tauri
cargo test --lib -- --test-threads=1

echo "== OK: ci-check passed"
