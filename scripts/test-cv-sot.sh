#!/usr/bin/env bash
# Guard the apply-CV SoT split. Add assertions as waves land.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail() {
  echo "FAIL: $*" >&2
  exit 1
}

if [[ -e "$ROOT/scripts/extract-kanithanj-cv-from-devprofile.sh" ]]; then
  fail "extract-kanithanj-cv-from-devprofile.sh must stay deleted (it copied the CLI writer)"
fi

if grep -R --include='*.sh' -E 'cp +"\$DEV/.*/generate-apply-cv|copy \(.*generate-apply-cv' "$ROOT/scripts" "$ROOT/vendor/kanithanj-cv/scripts" 2>/dev/null | grep -v test-cv-sot.sh | grep -q .; then
  fail "a script still copies generate-apply-cv.tsx from a DEVPROFILE tree"
fi

echo "OK cv-sot wave1 (no extract writer copy)"
