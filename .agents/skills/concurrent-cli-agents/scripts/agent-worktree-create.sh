#!/usr/bin/env bash
# Create an isolated git worktree for a concurrent CLI agent session.
set -euo pipefail

usage() {
	cat <<'EOF'
Usage: agent-worktree-create.sh --tool <name> --slug <slug> [--base <ref>]

Creates:
  .worktrees/<tool>-<slug>   (working directory)
  branch agent/<tool>/<slug>  (new branch from --base)

Prints the worktree path on stdout.

Options:
  --tool   Agent id (hermes, grok-build, openclaw, cursor, …)
  --slug   Short task id (kebab-case)
  --base   Start ref (default: HEAD)
  -h, --help
EOF
}

TOOL=""
SLUG=""
BASE="HEAD"

while [[ $# -gt 0 ]]; do
	case "$1" in
	--tool)
		TOOL="${2:?}"
		shift 2
		;;
	--slug)
		SLUG="${2:?}"
		shift 2
		;;
	--base)
		BASE="${2:?}"
		shift 2
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

if [[ -z "$TOOL" || -z "$SLUG" ]]; then
	echo "Error: --tool and --slug are required." >&2
	usage >&2
	exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BRANCH="agent/${TOOL}/${SLUG}"
DIR_NAME="${TOOL}-${SLUG}"
WT_DIR="${ROOT}/.worktrees/${DIR_NAME}"

if [[ -d "$WT_DIR" ]]; then
	echo "Error: worktree path already exists: $WT_DIR" >&2
	echo "  Remove with: agent-worktree-remove.sh --path .worktrees/${DIR_NAME}" >&2
	exit 1
fi

mkdir -p "${ROOT}/.worktrees"

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
	echo "Error: branch already exists: ${BRANCH}" >&2
	exit 1
fi

git worktree add -b "$BRANCH" "$WT_DIR" "$BASE"

if [[ -f "${ROOT}/.worktreeinclude" ]]; then
	while IFS= read -r rel || [[ -n "$rel" ]]; do
		[[ -z "$rel" || "$rel" =~ ^# ]] && continue
		src="${ROOT}/${rel}"
		dest="${WT_DIR}/${rel}"
		if [[ -e "$src" ]]; then
			mkdir -p "$(dirname "$dest")"
			cp -a "$src" "$dest"
		fi
	done <"${ROOT}/.worktreeinclude"
fi

echo "$WT_DIR"
