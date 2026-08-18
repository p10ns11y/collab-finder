#!/usr/bin/env bash
# Cyclomatic complexity gate (Lizard). Default CCN threshold 15 — same as thepulimaangani.
# Fails when any function exceeds threshold (-W).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CCN="${LIZARD_CCN_THRESHOLD:-15}"
# Baseline: allow current debt; fail when new functions exceed CCN (drive toward 0 over time).
RUST_BASELINE="${LIZARD_RUST_WARN_BASELINE:-14}"

# shellcheck source=scripts/ensure-lizard.sh
source "${ROOT}/scripts/ensure-lizard.sh"

echo "== Lizard Rust backend (CCN threshold ${CCN}, baseline warnings ${RUST_BASELINE})"
lizard src-tauri/src \
  --exclude src-tauri/src/vendor \
  -l rust \
  -C "${CCN}" \
  --ignore_warnings "${RUST_BASELINE}"

echo "== Lizard TS domain core (CCN threshold ${CCN})"
lizard src/core \
  -l javascript \
  -C "${CCN}" \
  --ignore_warnings 0

echo "== OK: complexity gate passed"
