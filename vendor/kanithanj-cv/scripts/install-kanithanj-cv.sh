#!/usr/bin/env bash
# Install or sync kanithanj.cv. SoT is collab-finder (vendor/kanithanj-cv).
# Does not assume a sibling devprofile checkout.
#
# From a collab-finder checkout:
#   scripts/install-kanithanj-cv.sh
# From any machine:
#   curl -fsSL https://raw.githubusercontent.com/p10ns11y/collab-finder/main/scripts/install-kanithanj-cv.sh | bash
# Optional:
#   KANITHANJ_CV_REMOTE  git URL (default https://github.com/p10ns11y/collab-finder.git)
#   KANITHANJ_CV_REF     branch or tag (default main)
#   KANITHANJ_CV_SRC     local vendor/kanithanj-cv tree
#   CVDATA_SRC           master cvdata.json to symlink
#   KANITHANJ_CV_HOME    install destination
set -euo pipefail

DEST="${KANITHANJ_CV_HOME:-${HOME}/.local/share/kanithanj.cv}"
BIN="${HOME}/.local/bin/kanithanj.cv"
REMOTE="${KANITHANJ_CV_REMOTE:-https://github.com/p10ns11y/collab-finder.git}"
REF="${KANITHANJ_CV_REF:-main}"
CF_DATA="${XDG_DATA_HOME:-${HOME}/.local/share}/collab-finder"
CONFIG_CVDATA="${XDG_CONFIG_HOME:-${HOME}/.config}/kanithanj.cv/cvdata.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SYNC=0
if [[ "${1:-}" == "--sync" ]]; then
  SYNC=1
fi

if [[ "$SYNC" -eq 1 && -f "$DEST/.install.json" ]]; then
  REMOTE="$(node -e 'const i=require(process.argv[1]); process.stdout.write(i.remote||"")' "$DEST/.install.json")"
  REF="$(node -e 'const i=require(process.argv[1]); process.stdout.write(i.ref||"")' "$DEST/.install.json")"
  RECORDED_VENDOR="$(node -e 'const i=require(process.argv[1]); process.stdout.write(i.vendorPath||"")' "$DEST/.install.json")"
  if [[ -z "$REMOTE" ]]; then REMOTE="https://github.com/p10ns11y/collab-finder.git"; fi
  if [[ -z "$REF" ]]; then REF="main"; fi
  if [[ -z "${KANITHANJ_CV_SRC:-}" && -n "${RECORDED_VENDOR:-}" && -f "${RECORDED_VENDOR}/scripts/generate-apply-cv.tsx" ]]; then
    KANITHANJ_CV_SRC="$RECORDED_VENDOR"
  fi
fi

guess_vendor() {
  local candidate resolved dest_resolved
  dest_resolved="$(cd "$DEST" 2>/dev/null && pwd || true)"
  for candidate in \
    "${KANITHANJ_CV_SRC:-}" \
    "${SCRIPT_DIR}/../vendor/kanithanj-cv" \
    "${SCRIPT_DIR}/.."; do
    if [[ -z "$candidate" || ! -f "$candidate/scripts/generate-apply-cv.tsx" ]]; then
      continue
    fi
    resolved="$(cd "$candidate" && pwd)"
    if [[ -n "$dest_resolved" && "$resolved" == "$dest_resolved" ]]; then
      continue
    fi
    printf '%s\n' "$resolved"
    return 0
  done
  return 1
}

fetch_vendor_from_remote() {
  local tmp
  tmp="$(mktemp -d)"
  if command -v git >/dev/null 2>&1; then
    git clone --depth 1 --branch "$REF" --filter=blob:none --sparse "$REMOTE" "$tmp/repo"
    git -C "$tmp/repo" sparse-checkout set vendor/kanithanj-cv
    if [[ -f "$tmp/repo/vendor/kanithanj-cv/scripts/generate-apply-cv.tsx" ]]; then
      printf '%s\n' "$tmp/repo/vendor/kanithanj-cv"
      return 0
    fi
  fi
  echo "Could not fetch $REMOTE @ $REF" >&2
  echo "Set KANITHANJ_CV_SRC to a local vendor/kanithanj-cv tree." >&2
  exit 1
}

SOURCE="vendor"
VENDOR_PATH=""
if SRC="$(guess_vendor)"; then
  VENDOR_PATH="$(cd "$SRC" && pwd)"
else
  SOURCE="remote"
  SRC="$(fetch_vendor_from_remote)"
fi

if [[ ! -f "$SRC/scripts/generate-apply-cv.tsx" ]]; then
  echo "Missing kanithanj.cv tree at $SRC" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")" "${HOME}/.local/bin" "$CF_DATA/application_packs" "$(dirname "$CONFIG_CVDATA")"

SAVED_CVDATA=""
if [[ -L "$DEST/src/data/cvdata.json" ]]; then
  SAVED_CVDATA="$(readlink -f "$DEST/src/data/cvdata.json" || true)"
fi

mkdir -p "$DEST"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude node_modules \
    --exclude out \
    --exclude application_packs \
    --exclude src/data/cvdata.json \
    --exclude .install.json \
    "$SRC/" "$DEST/"
else
  cp -a "$SRC/." "$DEST/"
fi

if [[ -f "$SCRIPT_DIR/install-kanithanj-cv.sh" ]]; then
  mkdir -p "$DEST/scripts"
  cp "$SCRIPT_DIR/install-kanithanj-cv.sh" "$DEST/scripts/install-kanithanj-cv.sh"
  chmod +x "$DEST/scripts/install-kanithanj-cv.sh"
fi

if [[ -z "${CVDATA_SRC:-}" && -n "$SAVED_CVDATA" && -f "$SAVED_CVDATA" ]]; then
  CVDATA_SRC="$SAVED_CVDATA"
fi
if [[ -z "${CVDATA_SRC:-}" && -f "$CONFIG_CVDATA" ]]; then
  CVDATA_SRC="$CONFIG_CVDATA"
fi
if [[ -n "${CVDATA_SRC:-}" && -f "$CVDATA_SRC" ]]; then
  mkdir -p "$DEST/src/data"
  ln -sfn "$(realpath "$CVDATA_SRC")" "$DEST/src/data/cvdata.json"
  echo "Linked cvdata → $CVDATA_SRC"
else
  echo "cvdata: no pointer (bundled placeholder kept)"
  echo "  set CVDATA_SRC=/path/to/cvdata.json"
  echo "  or put a file at $CONFIG_CVDATA"
  echo "  then re-run install. Content is not copied."
fi

PACKS="${COLLAB_FINDER_PACKS:-$CF_DATA/application_packs}"
mkdir -p "$PACKS"
ln -sfn "$PACKS" "$DEST/application_packs"
echo "Linked application_packs → $PACKS"

INSTALLED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat >"$DEST/.install.json" <<EOF
{
  "source": "$SOURCE",
  "remote": "$REMOTE",
  "ref": "$REF",
  "vendorPath": $(if [[ -n "$VENDOR_PATH" ]]; then node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$VENDOR_PATH"; else echo null; fi),
  "installedAt": "$INSTALLED_AT"
}
EOF

if command -v bun >/dev/null 2>&1; then
  (cd "$DEST" && bun install --silent)
else
  echo "warning: bun not found — run 'cd $DEST && bun install' before generate" >&2
fi

cat >"$BIN" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec bun "$DEST/scripts/kanithanj-cv.ts" "\$@"
EOF
chmod +x "$BIN"

printf '%s\n' "$DEST" >"$CF_DATA/cv_home.txt"
echo "Installed kanithanj.cv"
echo "  home: $DEST"
echo "  cli:  $BIN"
echo "  packs: $PACKS"
echo "  app:  $CF_DATA/cv_home.txt"
