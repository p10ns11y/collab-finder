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

echo "OK pull-cv-renderer"
