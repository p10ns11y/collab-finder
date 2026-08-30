#!/usr/bin/env bash
# Pull master cvdata.json from p10ns11y/devprofile into the operator file.
# Default dest: ~/.config/kanithanj.cv/cvdata.json
# Does not default to a sibling checkout. Upload path: write that dest yourself.
set -euo pipefail

DEST="${KANITHANJ_CVDATA_DEST:-${XDG_CONFIG_HOME:-${HOME}/.config}/kanithanj.cv/cvdata.json}"
REMOTE="${KANITHANJ_CVDATA_REMOTE:-https://github.com/p10ns11y/devprofile.git}"
REF="${KANITHANJ_CVDATA_REF:-main}"
REL="src/data/cvdata.json"

if [[ -n "${KANITHANJ_CVDATA_SRC:-}" ]]; then
  SRC_FILE="$KANITHANJ_CVDATA_SRC"
  if [[ ! -f "$SRC_FILE" ]]; then
    echo "KANITHANJ_CVDATA_SRC is not a file: $SRC_FILE" >&2
    exit 1
  fi
else
  tmp="$(mktemp -d)"
  git clone --depth 1 --branch "$REF" --filter=blob:none --sparse "$REMOTE" "$tmp/repo"
  git -C "$tmp/repo" sparse-checkout set src/data
  SRC_FILE="$tmp/repo/$REL"
  if [[ ! -f "$SRC_FILE" ]]; then
    echo "Missing $REL in $REMOTE @ $REF" >&2
    rm -rf "$tmp"
    exit 1
  fi
fi

mkdir -p "$(dirname "$DEST")"
cp "$SRC_FILE" "$DEST"
if [[ -n "${tmp:-}" ]]; then
  rm -rf "$tmp"
fi
echo "pulled cvdata → $DEST"
