#!/usr/bin/env bash
# Refresh vendored X agent resources from upstream. Run from repo root:
#   ./.agents/x-resources/refresh.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/.agents/x-resources"
mkdir -p "$DIR"
curl -fsSL https://docs.x.com/skill.md -o "$DIR/skill.md"
curl -fsSL https://docs.x.com/llms.txt -o "$DIR/llms.txt"
echo "Refreshed skill.md and llms.txt in $DIR"
