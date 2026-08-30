#!/usr/bin/env bash
# Optional one-way import. vendor/kanithanj-cv is the SoT; edit it here.
# Use this only to pull renderer files from a remote or local devprofile tree.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV="${DEVPROFILE_SRC:-}"
DEST="$ROOT/vendor/kanithanj-cv"

if [[ -z "$DEV" || ! -f "$DEV/scripts/generate-apply-cv.tsx" ]]; then
  echo "Set DEVPROFILE_SRC to a checkout that has scripts/generate-apply-cv.tsx" >&2
  exit 1
fi

mkdir -p "$DEST/scripts" "$DEST/src/components" "$DEST/src/lib" "$DEST/src/data"

copy() {
  local rel="$1"
  local src="$DEV/$rel"
  local out="$DEST/$rel"
  mkdir -p "$(dirname "$out")"
  cp "$src" "$out"
}

for rel in \
  scripts/generate-apply-cv.tsx \
  scripts/link-application-packs.mjs \
  src/components/cv-document.tsx \
  src/lib/cv-overlay.ts \
  src/lib/cv-layout-policy.ts \
  src/lib/cv-featured-projects.ts \
  src/lib/apply-cv-filename.ts; do
  copy "$rel"
done

# Placeholder cvdata — install symlinks real master at setup
if [[ ! -f "$DEST/src/data/cvdata.json" ]]; then
  cp "$DEV/src/data/cvdata.json" "$DEST/src/data/cvdata.example.json"
  cat >"$DEST/src/data/cvdata.json" <<'EOF'
{"name":"Configure cvdata","title":"Run Install kanithanj.cv in Preferences","email":"","phone":"","location":"","profile":"Symlink your master cvdata.json during install.","experience":[],"projects":[],"education":[],"skills":[]}
EOF
fi

echo "Imported renderer files → $DEST"
echo "Left README, package.json, and CLI scripts untouched (vendor is SoT)."
