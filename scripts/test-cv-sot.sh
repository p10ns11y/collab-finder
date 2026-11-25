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

for gone in   scripts/pull-cv-renderer.sh   scripts/test-pull-cv-renderer.sh   vendor/kanithanj-cv/src/components/cv-document.tsx   vendor/kanithanj-cv/scripts/ats-pdf-smoke.tsx   vendor/kanithanj-cv/src/lib/cv-layout-policy.ts
do
  if [[ -e "$ROOT/$gone" ]]; then
    fail "$gone must stay deleted (react-pdf is not the CV renderer)"
  fi
done
echo "OK cv-sot wave2 (react-pdf CV path stays deleted)"

INSTALL="$ROOT/vendor/kanithanj-cv/scripts/install-kanithanj-cv.sh"
grep -q 'set CVDATA_SRC=/path/to/cvdata.json' "$INSTALL" || fail "install must teach the cvdata pointer"
grep -q 'drop_foreign_cvdata_link' "$INSTALL" || fail "install must drop sibling cvdata links"
if grep -E 'DEVPROFILE=.*Work/personal/devprofile|HOME\}/Work/personal/devprofile' "$INSTALL"; then
  fail "install must not default cvdata to a sibling checkout"
fi
[[ -f "$ROOT/vendor/kanithanj-cv/scripts/pull-cvdata.sh" ]] || fail "pull-cvdata.sh missing"
echo "OK cv-sot wave3 (cvdata is a pointer)"
