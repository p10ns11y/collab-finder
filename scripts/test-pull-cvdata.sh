#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PULL="$ROOT/vendor/kanithanj-cv/scripts/pull-cvdata.sh"
fail() {
  echo "FAIL: $*" >&2
  exit 1
}

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
src="$scratch/master.json"
dest="$scratch/config/kanithanj.cv/cvdata.json"
printf '{"name":"from-fixture"}\n' >"$src"

KANITHANJ_CVDATA_SRC="$src" KANITHANJ_CVDATA_DEST="$dest" bash "$PULL"
grep -q '"from-fixture"' "$dest" || fail "did not write dest"

if grep -E 'HOME\}/Work/personal/devprofile|HOME/Work/personal/devprofile' "$PULL"; then
  fail "pull-cvdata must not default to a sibling checkout"
fi
grep -q 'sparse-checkout set src/data' "$PULL" || fail "sparse-checkout must use the src/data directory"

echo "OK pull-cvdata"
