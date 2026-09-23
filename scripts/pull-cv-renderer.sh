#!/usr/bin/env bash
# One-way look pull. SoT is p10ns11y/devprofile. Copies only the allowlist
# into vendor/kanithanj-cv. Does not default to a sibling checkout.
#
#   scripts/pull-cv-renderer.sh
#   KANITHANJ_RENDER_REF=feat/cv-independent-work scripts/pull-cv-renderer.sh
#   KANITHANJ_RENDER_SRC=/explicit/checkout scripts/pull-cv-renderer.sh
#
# cv-document.tsx and cv-layout-policy.ts carry ATS-LAYOUT-POLICY: single-column.
# When that marker is already in the destination, a pull will not overwrite the
# file with a look that drops the marker or restores a two-column page
# (columnContainer / leftColumn / rightColumn). The incoming copy is written
# under vendor/kanithanj-cv/.pull-quarantine/ (gitignored) instead.
#
# Re-smoke after any pull:
#   (cd vendor/kanithanj-cv && bun scripts/ats-pdf-smoke.tsx)
# A two-column page fails positional ATS text extraction.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${KANITHANJ_RENDER_DEST:-$ROOT/vendor/kanithanj-cv}"
REMOTE="${KANITHANJ_RENDER_REMOTE:-https://github.com/p10ns11y/devprofile.git}"
REF="${KANITHANJ_RENDER_REF:-main}"
ATS_LAYOUT_MARKER='ATS-LAYOUT-POLICY: single-column'
TWO_COLUMN_RE='columnContainer|leftColumn|rightColumn'
QUARANTINE_ROOT="${KANITHANJ_RENDER_QUARANTINE:-$DEST/.pull-quarantine}"
QUARANTINE_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

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

is_layout_file() {
  case "$1" in
    src/components/cv-document.tsx|src/lib/cv-layout-policy.ts) return 0 ;;
    *) return 1 ;;
  esac
}

file_has_marker() {
  grep -q -F "$ATS_LAYOUT_MARKER" "$1"
}

file_is_two_column() {
  grep -E -q "$TWO_COLUMN_RE" "$1"
}

remind_resmoke() {
  echo "Re-smoke after any pull: (cd \"$DEST\" && bun scripts/ats-pdf-smoke.tsx)"
}

quarantine_incoming() {
  local rel="$1"
  local src_file="$2"
  local qdir="$QUARANTINE_ROOT/$QUARANTINE_STAMP"
  mkdir -p "$qdir/$(dirname "$rel")"
  cp "$src_file" "$qdir/$rel"
  echo "KEPT $rel (ATS layout-policy marker). Upstream copy → $qdir/$rel" >&2
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
kept=0
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
  if is_layout_file "$rel" && [[ -f "$out" ]] && file_has_marker "$out"; then
    if file_is_two_column "$src_file" || ! file_has_marker "$src_file"; then
      quarantine_incoming "$rel" "$src_file"
      kept=$((kept + 1))
      continue
    fi
  fi

  backup=""
  if is_layout_file "$rel" && [[ -f "$out" ]] && file_has_marker "$out"; then
    backup="$(mktemp)"
    cp "$out" "$backup"
  fi
  mkdir -p "$(dirname "$out")"
  cp "$src_file" "$out"
  if [[ -n "$backup" ]]; then
    if ! file_has_marker "$out" || file_is_two_column "$out"; then
      cp "$backup" "$out"
      rm -f "$backup"
      echo "FAIL: $rel lost single-column ATS layout; restored the previous file" >&2
      remind_resmoke >&2
      [[ -n "$cleanup" ]] && rm -rf "$cleanup"
      exit 1
    fi
    rm -f "$backup"
  fi
  copied=$((copied + 1))
  echo "pulled $rel"
done

[[ -n "$cleanup" ]] && rm -rf "$cleanup"

for rel in src/components/cv-document.tsx src/lib/cv-layout-policy.ts; do
  out="$DEST/$rel"
  if [[ -f "$out" ]] && file_has_marker "$out" && file_is_two_column "$out"; then
    echo "FAIL: $rel has the ATS layout-policy marker and a two-column layout" >&2
    remind_resmoke >&2
    exit 1
  fi
done

if [[ "$copied" -eq 0 && "$kept" -eq 0 ]]; then
  echo "Nothing copied" >&2
  exit 1
fi
echo "OK pulled $copied renderer file(s), kept $kept ATS layout file(s) → $DEST"
remind_resmoke
