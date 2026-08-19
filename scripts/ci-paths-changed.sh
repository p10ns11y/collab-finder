#!/usr/bin/env bash
# Emit app_source=true|false — whether diff touched src/ or src-tauri/ (functional app code).
# Agent/docs/scripts/CI config edits → false → skip WebKit, Rust tests, complexity, CRAP.
set -euo pipefail

APP_SOURCE=false

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

if [ "$APP_SOURCE" = false ]; then
  PATTERN='^(src/|src-tauri/)'
  if git diff --name-only "$RANGE" | grep -qE "$PATTERN"; then
    APP_SOURCE=true
  fi
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "app_source=$APP_SOURCE" >> "$GITHUB_OUTPUT"
  # Legacy output name used by workflow if: conditions
  echo "code=$APP_SOURCE" >> "$GITHUB_OUTPUT"
else
  echo "app_source=$APP_SOURCE"
fi
