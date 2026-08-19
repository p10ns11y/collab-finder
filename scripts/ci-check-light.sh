#!/usr/bin/env bash
# Meta/agent/docs CI — TS type-check + domain verify only. No WebKit, no Rust link.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

echo "== pnpm type-check (tsc -b)"
pnpm run type-check

echo "== domain verify runners"
node scripts/run-verify.mjs

echo "== OK: ci-check-light passed (no app-source diff — skipped Rust/WebKit)"
