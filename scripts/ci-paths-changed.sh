#!/usr/bin/env bash
# Emit app_source and release_build for CI job gating.
#
# app_source    — src/ or src-tauri/ changed → complexity (Lizard, no WebKit)
# release_build — version *field* changed in manifests → WebKit + Rust tests + CRAP
# Tag binary build — release.yml only (not this script)
set -euo pipefail

APP_SOURCE=false
RELEASE_BUILD=false

if [ "${GITHUB_EVENT_NAME:-}" = "pull_request" ]; then
  BASE="${GITHUB_BASE_SHA:-}"
  HEAD="${GITHUB_SHA:-HEAD}"
  if [ -z "$BASE" ]; then
    APP_SOURCE=true
  else
    RANGE="${BASE}..${HEAD}"
  fi
elif [ "${GITHUB_EVENT_BEFORE:-}" = "0000000000000000000000000000000000000000" ] || [ -z "${GITHUB_EVENT_BEFORE:-}" ]; then
  APP_SOURCE=true
else
  RANGE="${GITHUB_EVENT_BEFORE}..${GITHUB_SHA}"
fi

if [ -n "${RANGE:-}" ]; then
  CHANGED="$(git diff --name-only "$RANGE")"
  if printf '%s\n' "$CHANGED" | grep -qE '^(src/|src-tauri/)'; then
    APP_SOURCE=true
  fi

  BASE_REF="${RANGE%%..*}"
  HEAD_REF="${RANGE##*..}"

  pkg_base="$(git show "${BASE_REF}:package.json" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('version',''))" 2>/dev/null || true)"
  pkg_head="$(git show "${HEAD_REF}:package.json" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('version',''))" 2>/dev/null || true)"
  if [ -n "$pkg_base" ] && [ -n "$pkg_head" ] && [ "$pkg_base" != "$pkg_head" ]; then
    RELEASE_BUILD=true
  fi

  tauri_base="$(git show "${BASE_REF}:src-tauri/tauri.conf.json" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('version',''))" 2>/dev/null || true)"
  tauri_head="$(git show "${HEAD_REF}:src-tauri/tauri.conf.json" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('version',''))" 2>/dev/null || true)"
  if [ -n "$tauri_base" ] && [ -n "$tauri_head" ] && [ "$tauri_base" != "$tauri_head" ]; then
    RELEASE_BUILD=true
  fi

  cargo_base="$(git show "${BASE_REF}:src-tauri/Cargo.toml" 2>/dev/null | awk -F'"' '/^version = / { print $2; exit }' || true)"
  cargo_head="$(git show "${HEAD_REF}:src-tauri/Cargo.toml" 2>/dev/null | awk -F'"' '/^version = / { print $2; exit }' || true)"
  if [ -n "$cargo_base" ] && [ -n "$cargo_head" ] && [ "$cargo_base" != "$cargo_head" ]; then
    RELEASE_BUILD=true
  fi
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "app_source=$APP_SOURCE" >> "$GITHUB_OUTPUT"
  echo "release_build=$RELEASE_BUILD" >> "$GITHUB_OUTPUT"
else
  echo "app_source=$APP_SOURCE release_build=$RELEASE_BUILD"
fi
