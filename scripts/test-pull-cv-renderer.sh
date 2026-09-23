#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PULL="$ROOT/scripts/pull-cv-renderer.sh"
fail() {
  echo "FAIL: $*" >&2
  exit 1
}

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
src="$scratch/src"
dest="$scratch/dest"
mkdir -p "$src/src/components" "$src/src/lib" "$dest"

for rel in \
  src/components/cv-document.tsx \
  src/lib/cv-overlay.ts \
  src/lib/cv-layout-policy.ts \
  src/lib/cv-featured-projects.ts \
  src/lib/apply-cv-filename.ts; do
  mkdir -p "$(dirname "$src/$rel")"
  printf 'fixture:%s\n' "$rel" >"$src/$rel"
done
printf 'secret\n' >"$src/src/lib/do-not-copy.ts"

KANITHANJ_RENDER_SRC="$src" KANITHANJ_RENDER_DEST="$dest" bash "$PULL"
for rel in \
  src/components/cv-document.tsx \
  src/lib/cv-overlay.ts \
  src/lib/cv-layout-policy.ts \
  src/lib/cv-featured-projects.ts \
  src/lib/apply-cv-filename.ts; do
  grep -qx "fixture:$rel" "$dest/$rel" || fail "did not pull $rel"
done
if [[ -e "$dest/src/lib/do-not-copy.ts" ]]; then
  fail "copied a file outside the allowlist"
fi

if KANITHANJ_RENDER_SRC="$src" KANITHANJ_RENDER_DEST="$dest" KANITHANJ_RENDER_ONLY=src/lib/do-not-copy.ts bash "$PULL" 2>"$scratch/err"; then
  fail "should refuse a path outside the allowlist"
fi
grep -q 'Refusing path outside allowlist' "$scratch/err" || fail "missing refuse message"

if grep -E 'HOME\}/Work/personal/devprofile|HOME/Work/personal/devprofile' "$PULL"; then
  fail "pull script must not default to a sibling checkout"
fi
grep -q 'Re-smoke after any pull' "$PULL" || fail "help must say to re-smoke after any pull"

# Marked single-column files survive a two-column look pull.
marked="$scratch/marked"
mkdir -p "$marked/src/components" "$marked/src/lib"
printf 'ATS-LAYOUT-POLICY: single-column\nLOCAL_KEEP\n' >"$marked/src/components/cv-document.tsx"
printf 'ATS-LAYOUT-POLICY: single-column\nLOCAL_POLICY\n' >"$marked/src/lib/cv-layout-policy.ts"
printf 'columnContainer\nTWO_COLUMN_LOOK\n' >"$src/src/components/cv-document.tsx"
printf 'UPSTREAM_POLICY two-column pack\n' >"$src/src/lib/cv-layout-policy.ts"
KANITHANJ_RENDER_SRC="$src" KANITHANJ_RENDER_DEST="$marked" \
  KANITHANJ_RENDER_QUARANTINE="$scratch/quarantine" \
  bash "$PULL" >"$scratch/keep-out"
grep -q 'LOCAL_KEEP' "$marked/src/components/cv-document.tsx" || fail "two-column look overwrote cv-document.tsx"
grep -q 'ATS-LAYOUT-POLICY: single-column' "$marked/src/components/cv-document.tsx" || fail "cv-document lost the layout marker"
if grep -q 'columnContainer' "$marked/src/components/cv-document.tsx"; then
  fail "cv-document.tsx contains a two-column layout"
fi
grep -q 'LOCAL_POLICY' "$marked/src/lib/cv-layout-policy.ts" || fail "layout-policy comment was overwritten"
grep -qx 'fixture:src/lib/cv-overlay.ts' "$marked/src/lib/cv-overlay.ts" || fail "non-layout allowlist file was not pulled"
qdoc="$(find "$scratch/quarantine" -name cv-document.tsx -print -quit)"
[[ -n "$qdoc" ]] || fail "incoming cv-document was not quarantined"
grep -q 'TWO_COLUMN_LOOK' "$qdoc" || fail "quarantine is missing the upstream look"
grep -q 'Re-smoke after any pull' "$scratch/keep-out" || fail "pull output must remind to re-smoke"

# A single-column incoming file that still has the marker may replace the local one.
printf 'ATS-LAYOUT-POLICY: single-column\nNEW_LOOK\n' >"$src/src/components/cv-document.tsx"
KANITHANJ_RENDER_SRC="$src" KANITHANJ_RENDER_DEST="$marked" \
  KANITHANJ_RENDER_QUARANTINE="$scratch/quarantine" \
  bash "$PULL" >"$scratch/replace-out"
grep -q 'NEW_LOOK' "$marked/src/components/cv-document.tsx" || fail "single-column look update was refused"
if grep -q 'LOCAL_KEEP' "$marked/src/components/cv-document.tsx"; then
  fail "previous cv-document body survived a marked single-column pull"
fi
grep -q 'LOCAL_POLICY' "$marked/src/lib/cv-layout-policy.ts" || fail "unmarked layout-policy was applied"

# ONLY the document, and the incoming look is two-column: keep the local file.
printf 'columnContainer\nleftColumn\nTWO_COLUMN_AGAIN\n' >"$src/src/components/cv-document.tsx"
KANITHANJ_RENDER_SRC="$src" KANITHANJ_RENDER_DEST="$marked" \
  KANITHANJ_RENDER_ONLY=src/components/cv-document.tsx \
  KANITHANJ_RENDER_QUARANTINE="$scratch/quarantine" \
  bash "$PULL" >"$scratch/only-out"
grep -q 'NEW_LOOK' "$marked/src/components/cv-document.tsx" || fail "ONLY pull restored two-column"
grep -q 'Re-smoke after any pull' "$scratch/only-out" || fail "ONLY pull must still remind to re-smoke"

echo "OK pull-cv-renderer"
