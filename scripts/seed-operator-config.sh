#!/usr/bin/env bash
# Seed operator identity into ~/.config/collab-finder/packs/ from gitignored data/operator/.
# One-time bootstrap from repo legacy paths if data/operator/ is empty.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OPERATOR="$ROOT/data/operator"
TESTDATA="$ROOT/src-tauri/testdata"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/collab-finder"
PACKS="$CONFIG/packs"

mkdir -p "$OPERATOR" "$PACKS" "$TESTDATA"

copy_if_missing() {
  local src="$1" dest_name="$2"
  if [[ -f "$OPERATOR/$dest_name" ]]; then
    return 0
  fi
  if [[ -f "$src" ]]; then
    cp "$src" "$OPERATOR/$dest_name"
    echo "bootstrapped operator/$dest_name from repo legacy"
  fi
}

copy_if_missing "$ROOT/data/durability/universe.v1.json" "universe.json"
copy_if_missing "$ROOT/data/durability/environments.v1.json" "places.json"
copy_if_missing "$ROOT/data/distillation/cv-packet-distilled.txt" "cv-packet.txt"
copy_if_missing "$ROOT/data/distillation/curation/candidate-constraints-compact.txt" "constraints-strict.txt"
copy_if_missing "$ROOT/data/distillation/curation/candidate-constraints-relaxed.txt" "constraints-relaxed.txt"
copy_if_missing "$ROOT/data/distillation/curation/proof-variants.md" "proof-variants.md"
copy_if_missing "$ROOT/data/distillation/public-projects-focused-flatten.json" "public-projects-focused.json"
copy_if_missing "$ROOT/data/distillation/public-projects.json" "public-projects.json"
copy_if_missing "$ROOT/data/distillation/public-projects-clean.json" "public-projects-clean.json"

for f in universe.json places.json cv-packet.txt constraints-strict.txt constraints-relaxed.txt \
  proof-variants.md public-projects-focused.json public-projects.json public-projects-clean.json; do
  if [[ -f "$OPERATOR/$f" ]]; then
    cp "$OPERATOR/$f" "$PACKS/$f"
    cp "$OPERATOR/$f" "$TESTDATA/$f"
  fi
done

RANK="$CONFIG/rank.json"
if [[ ! -f "$RANK" ]]; then
  cat >"$RANK" <<'EOF'
{
  "profile": "operator",
  "weights": { "spacexai": 8, "fortress": 7, "ai_tsunami": 6, "product_moat": 6, "hiring": 5 },
  "place_weights": { "economic": 5, "ethics": 5, "character": 4, "social": 6, "family": 6, "self_fit": 4 },
  "gates": { "theater_saas": true, "fortress_min": 2, "product_moat_min": 2 },
  "pack_dirs": []
}
EOF
  echo "wrote $RANK"
fi

echo "Operator pack → $PACKS"
echo "Test fixtures → $TESTDATA"
ls -la "$PACKS"
