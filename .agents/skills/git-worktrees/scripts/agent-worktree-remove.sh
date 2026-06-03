#!/usr/bin/env bash
# Remove a worktree after its branch is merged (optional branch delete).
set -euo pipefail

usage() {
	cat <<'EOF'
Usage: agent-worktree-remove.sh --path <worktree-path> [--delete-branch]

Removes a worktree. Refuses if the worktree has uncommitted changes unless --force.

Options:
  --path            Path to worktree (e.g. .worktrees/cursor-fix-auth)
  --delete-branch   Delete the checked-out branch after remove
  --force           Remove even with uncommitted changes (dangerous)
  -h, --help
EOF
}

WT_PATH=""
DELETE_BRANCH=false
FORCE=()

while [[ $# -gt 0 ]]; do
	case "$1" in
	--path)
		WT_PATH="${2:?}"
		shift 2
		;;
	--delete-branch)
		DELETE_BRANCH=true
		shift
		;;
	--force)
		FORCE=(--force)
		shift
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "Unknown argument: $1" >&2
		usage >&2
		exit 1
		;;
	esac
done

if [[ -z "$WT_PATH" ]]; then
	echo "Error: --path is required." >&2
	usage >&2
	exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# Resolve relative paths from repo root
if [[ "$WT_PATH" != /* ]]; then
	WT_PATH="${ROOT}/${WT_PATH}"
fi

BRANCH="$(git -C "$WT_PATH" branch --show-current 2>/dev/null || true)"

git worktree remove "${FORCE[@]}" "$WT_PATH"

if [[ "$DELETE_BRANCH" == true && -n "$BRANCH" && "$BRANCH" != "$(git branch --show-current)" ]]; then
	git branch -d "$BRANCH" 2>/dev/null || git branch -D "$BRANCH"
	echo "Removed branch: ${BRANCH}"
fi

echo "Removed worktree: ${WT_PATH}"
