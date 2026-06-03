#!/usr/bin/env bash
# Merge an agent task branch into the current branch (safe integration — no cp).
set -euo pipefail

usage() {
	cat <<'EOF'
Usage: agent-worktree-merge.sh --branch <agent/...> [--no-ff]

Merges <branch> into the branch currently checked out in the primary worktree.
Run from repo root. Fails if there are uncommitted changes in the primary checkout.

Options:
  --branch   Agent branch to merge (e.g. agent/cursor/fix-auth)
  --no-ff    Pass --no-ff to git merge
  -h, --help
EOF
}

BRANCH=""
NO_FF=()

while [[ $# -gt 0 ]]; do
	case "$1" in
	--branch)
		BRANCH="${2:?}"
		shift 2
		;;
	--no-ff)
		NO_FF=(--no-ff)
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

if [[ -z "$BRANCH" ]]; then
	echo "Error: --branch is required." >&2
	usage >&2
	exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
	echo "Error: primary checkout has uncommitted changes. Commit or stash first." >&2
	exit 1
fi

if ! git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
	echo "Error: branch not found: ${BRANCH}" >&2
	exit 1
fi

TARGET="$(git branch --show-current)"
echo "Merging ${BRANCH} into ${TARGET}..."

if ! git merge "${NO_FF[@]}" "$BRANCH" -m "merge: integrate ${BRANCH} into ${TARGET}"; then
	echo "" >&2
	echo "Merge stopped (conflicts or other error). Resolve in this checkout, then:" >&2
	echo "  git add <resolved-files>" >&2
	echo "  git merge --continue" >&2
	echo "  # or: git merge --abort" >&2
	exit 1
fi

echo "Merged ${BRANCH} into ${TARGET}."
