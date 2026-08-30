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

PULL="$ROOT/scripts/pull-cv-renderer.sh"
[[ -x "$PULL" || -f "$PULL" ]] || fail "pull-cv-renderer.sh missing"
grep -q 'src/components/cv-document.tsx' "$PULL" || fail "allowlist missing cv-document.tsx"
if grep -q 'scripts/generate-apply-cv.tsx' "$PULL"; then
  fail "pull-cv-renderer.sh must not copy the CLI writer"
fi
if grep -E 'HOME\}/Work/personal/devprofile|HOME/Work/personal/devprofile' "$PULL"; then
  fail "pull-cv-renderer.sh must not default to a sibling checkout"
fi
echo "OK cv-sot wave2 (renderer pull allowlist)"

INSTALL="$ROOT/vendor/kanithanj-cv/scripts/install-kanithanj-cv.sh"
grep -q 'set CVDATA_SRC=/path/to/cvdata.json' "$INSTALL" || fail "install must teach the cvdata pointer"
grep -q 'drop_foreign_cvdata_link' "$INSTALL" || fail "install must drop sibling cvdata links"
if grep -E 'DEVPROFILE=.*Work/personal/devprofile|HOME\}/Work/personal/devprofile' "$INSTALL"; then
  fail "install must not default cvdata to a sibling checkout"
fi
[[ -f "$ROOT/vendor/kanithanj-cv/scripts/pull-cvdata.sh" ]] || fail "pull-cvdata.sh missing"
echo "OK cv-sot wave3 (cvdata is a pointer)"
