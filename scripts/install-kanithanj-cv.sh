#!/usr/bin/env bash
# Install kanithanj.cv next to kanithanj.ai (~/.local/share/kanithanj.cv + ~/.local/bin/kanithanj.cv).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${KANITHANJ_CV_HOME:-${HOME}/.local/share/kanithanj.cv}"
BIN="${HOME}/.local/bin/kanithanj.cv"
SRC="${KANITHANJ_CV_SRC:-$ROOT/vendor/kanithanj-cv}"
CVDATA_SRC="${CVDATA_SRC:-}"
DEVPROFILE="${DEVPROFILE_SRC:-${HOME}/Work/personal/devprofile}"
CF_DATA="${XDG_DATA_HOME:-${HOME}/.local/share}/collab-finder"

if [[ ! -f "$SRC/scripts/generate-apply-cv.tsx" ]]; then
  echo "Missing vendor bundle — run scripts/extract-kanithanj-cv-from-devprofile.sh first" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")" "${HOME}/.local/bin" "$CF_DATA"

rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$SRC/." "$DEST/"

# Master CV: explicit CVDATA_SRC, else devprofile checkout, else keep placeholder
if [[ -z "$CVDATA_SRC" && -f "$DEVPROFILE/src/data/cvdata.json" ]]; then
  CVDATA_SRC="$DEVPROFILE/src/data/cvdata.json"
fi
if [[ -n "$CVDATA_SRC" && -f "$CVDATA_SRC" ]]; then
  ln -sf "$(realpath "$CVDATA_SRC")" "$DEST/src/data/cvdata.json"
  echo "Linked cvdata → $CVDATA_SRC"
fi

if command -v bun >/dev/null 2>&1; then
  (cd "$DEST" && bun install --silent)
else
  echo "warning: bun not found — run 'cd $DEST && bun install' before generate" >&2
fi

cat >"$BIN" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec bun "$DEST/scripts/generate-apply-cv.tsx" "\$@"
EOF
chmod +x "$BIN"

printf '%s\n' "$DEST" >"$CF_DATA/cv_home.txt"
echo "Installed kanithanj.cv"
echo "  home: $DEST"
echo "  cli:  $BIN"
echo "  app:  $CF_DATA/cv_home.txt"
