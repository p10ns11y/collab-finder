#!/usr/bin/env bash
# Emit code=true|false — whether this push/PR touched app source trees.
# Used by .github/workflows/ci.yml to skip complexity / CRAP on docs·agent-only diffs.
set -euo pipefail

CODE=false

if [ "${GITHUB_EVENT_NAME:-}" = "pull_request" ]; then
  BASE="${GITHUB_BASE_SHA:-}"
  HEAD="${GITHUB_SHA:-HEAD}"
  if [ -z "$BASE" ]; then
    CODE=true
  else
    RANGE="${BASE}..${HEAD}"
  fi
elif [ "${GITHUB_EVENT_BEFORE:-}" = "0000000000000000000000000000000000000000" ] || [ -z "${GITHUB_EVENT_BEFORE:-}" ]; then
  CODE=true
else
  RANGE="${GITHUB_EVENT_BEFORE}..${GITHUB_SHA}"
fi

if [ "$CODE" = false ]; then
  PATTERN='^(src/|src-tauri/|package\.json|pnpm-lock\.yaml|vite\.config|tsconfig|tailwind|postcss|index\.html|scripts/|dx/)'
  if git diff --name-only "$RANGE" | grep -qE "$PATTERN"; then
    CODE=true
  fi
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "code=$CODE" >> "$GITHUB_OUTPUT"
else
  echo "code=$CODE"
fi
