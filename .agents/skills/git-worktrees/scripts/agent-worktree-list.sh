#!/usr/bin/env bash
# List git worktrees for this repo (paths + branches).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
	echo "Error: not inside a git repository." >&2
	exit 1
}

cd "$ROOT"
echo "Worktrees for: ${ROOT}"
echo ""
git worktree list --porcelain | awk '
/^worktree / { path=$2 }
/^branch / { sub(/^refs\/heads\//, "", $2); printf "  %s  →  %s\n", path, $2 }
/^detached / { printf "  %s  →  (detached)\n", path }
'
