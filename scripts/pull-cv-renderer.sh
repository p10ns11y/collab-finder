#!/usr/bin/env bash
# One-way look pull. SoT is p10ns11y/devprofile. Copies only the allowlist
# into vendor/kanithanj-cv. Does not default to a sibling checkout.
#
#   scripts/pull-cv-renderer.sh
#   KANITHANJ_RENDER_REF=feat/cv-independent-work scripts/pull-cv-renderer.sh
#   KANITHANJ_RENDER_SRC=/explicit/checkout scripts/pull-cv-renderer.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${KANITHANJ_RENDER_DEST:-$ROOT/vendor/kanithanj-cv}"
REMOTE="${KANITHANJ_RENDER_REMOTE:-https://github.com/p10ns11y/devprofile.git}"
REF="${KANITHANJ_RENDER_REF:-main}"

ALLOWLIST=(
  src/components/cv-document.tsx
  src/lib/cv-overlay.ts
  src/lib/cv-layout-policy.ts
  src/lib/cv-featured-projects.ts
  src/lib/apply-cv-filename.ts
)

is_allowed() {
  local rel="$1"
  local item
  for item in "${ALLOWLIST[@]}"; do
    if [[ "$item" == "$rel" ]]; then
      return 0
    fi
  done
  return 1
}

if [[ -n "${KANITHANJ_RENDER_ONLY:-}" ]]; then
  is_allowed "$KANITHANJ_RENDER_ONLY" || {
    echo "Refusing path outside allowlist: $KANITHANJ_RENDER_ONLY" >&2
    exit 1
  }
fi

cleanup=""
if [[ -n "${KANITHANJ_RENDER_SRC:-}" ]]; then
  SRC="$KANITHANJ_RENDER_SRC"
  if [[ ! -d "$SRC" ]]; then
    echo "KANITHANJ_RENDER_SRC is not a directory: $SRC" >&2
    exit 1
  fi
else
  tmp="$(mktemp -d)"
  cleanup="$tmp"
  git clone --depth 1 --branch "$REF" --filter=blob:none --sparse "$REMOTE" "$tmp/repo"
  git -C "$tmp/repo" sparse-checkout set src/components src/lib
  SRC="$tmp/repo"
fi

copied=0
for rel in "${ALLOWLIST[@]}"; do
  if [[ -n "${KANITHANJ_RENDER_ONLY:-}" && "$rel" != "$KANITHANJ_RENDER_ONLY" ]]; then
    continue
  fi
  src_file="$SRC/$rel"
  if [[ ! -f "$src_file" ]]; then
    echo "Missing $rel in $SRC" >&2
    [[ -n "$cleanup" ]] && rm -rf "$cleanup"
    exit 1
  fi
  out="$DEST/$rel"
  mkdir -p "$(dirname "$out")"
  cp "$src_file" "$out"
  copied=$((copied + 1))
  echo "pulled $rel"
done

[[ -n "$cleanup" ]] && rm -rf "$cleanup"

if [[ "$copied" -eq 0 ]]; then
  echo "Nothing copied" >&2
  exit 1
fi
echo "OK pulled $copied renderer file(s) → $DEST"
