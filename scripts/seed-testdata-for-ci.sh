#!/usr/bin/env bash
# Populate src-tauri/testdata/ from repo distillation stubs (CI + fresh clone).
# Does not touch ~/.config — safe for GitHub Actions.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TESTDATA="$ROOT/src-tauri/testdata"
mkdir -p "$TESTDATA"

copy() {
  local src="$1" name="$2"
  if [[ -f "$src" ]]; then
    cp "$src" "$TESTDATA/$name"
  fi
}

copy "$ROOT/data/durability/universe.v1.json" "universe.json"
copy "$ROOT/data/durability/environments.v1.json" "places.json"
copy "$ROOT/data/distillation/cv-packet-distilled.txt" "cv-packet.txt"
copy "$ROOT/data/distillation/curation/candidate-constraints-compact.txt" "constraints-strict.txt"
copy "$ROOT/data/distillation/curation/candidate-constraints-relaxed.txt" "constraints-relaxed.txt"
copy "$ROOT/data/distillation/curation/proof-variants.md" "proof-variants.md"
copy "$ROOT/data/distillation/public-projects-focused-flatten.json" "public-projects-focused.json"
copy "$ROOT/data/distillation/public-projects.json" "public-projects.json"
copy "$ROOT/data/distillation/public-projects-clean.json" "public-projects-clean.json"
copy "$ROOT/data/distillation/x-search/queries.json" "x-search-queries.json"
copy "$ROOT/data/durability/example-pack/hunt-rails.json" "hunt-rails.json"
copy "$ROOT/data/durability/example-pack/mission-firms.json" "mission-firms.json"

test -f "$TESTDATA/universe.json" || { echo "missing universe.json seed source" >&2; exit 1; }
test -f "$TESTDATA/x-search-queries.json" || { echo "missing x-search-queries.json seed source" >&2; exit 1; }
test -f "$TESTDATA/hunt-rails.json" || { echo "missing hunt-rails.json seed source" >&2; exit 1; }
test -f "$TESTDATA/mission-firms.json" || { echo "missing mission-firms.json seed source" >&2; exit 1; }
echo "Seeded Rust testdata → $TESTDATA ($(ls -1 "$TESTDATA" | wc -l) files)"
