#!/usr/bin/env bash
# Bootstrap. SoT is vendor/kanithanj-cv in this repo, or the GitHub remote.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
VENDOR_INSTALL="$HERE/../vendor/kanithanj-cv/scripts/install-kanithanj-cv.sh"

if [[ -f "$VENDOR_INSTALL" ]]; then
  exec bash "$VENDOR_INSTALL" "$@"
fi

# Piped from GitHub raw with no checkout: fetch vendor, then run its installer.
REMOTE="${KANITHANJ_CV_REMOTE:-https://github.com/p10ns11y/collab-finder.git}"
REF="${KANITHANJ_CV_REF:-main}"
TMP="$(mktemp -d)"
git clone --depth 1 --branch "$REF" --filter=blob:none --sparse "$REMOTE" "$TMP/repo"
git -C "$TMP/repo" sparse-checkout set vendor/kanithanj-cv
exec bash "$TMP/repo/vendor/kanithanj-cv/scripts/install-kanithanj-cv.sh" "$@"
