#!/usr/bin/env bash
# Public-repo fitness: host aliases, action SHA pins, credential-shaped strings.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node scripts/ci-host-alias.mjs
node scripts/ci-action-pin.mjs
node scripts/ci-secrets-scan.mjs

echo "== OK: ci-fitness passed"
