#!/usr/bin/env bash
# Full CI parity — run before push. Mirrors .github/workflows/ci.yml gate job.
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
cargo test --lib

echo "== OK: gate passed"
