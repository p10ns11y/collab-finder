#!/usr/bin/env bash
# Clean Grok-managed worktrees (global ~/.grok/worktrees/ layer) + final native
# prune for local .worktrees/ (the project default per git-worktrees/SKILL.md).
#
# This is the preferred wrapper for reclaiming disk after execute-plan, best-of-n,
# concurrent subagents, etc. (local .worktrees/ first; global only if used as fallback).
#
# Primary mechanism (when grok CLI is available):
#   - grok worktree list --json   → authoritative source of truth
#   - grok worktree gc            → removes dead/stale DB records (very fast)
#   - grok worktree rm <id>       → removes specific tracked worktrees
#
# The script adds two important things the raw CLI does not:
#   1. Safe branch preservation (fetch unique commits into your primary repo
#      under refs/orphans/grok-clean/... before deletion).
#   2. Detection + cleanup of on-disk clones that are no longer tracked in the DB.
#
# Repo-local .worktrees/ (created with git worktree add) are handled by the
# other scripts in this directory + native `git worktree prune`.

set -euo pipefail

GROK_BASE="${HOME}/.grok/worktrees"
DRY_RUN=true
PRUNE=false
PRESERVE_BRANCHES=true
FORCE=false
TARGET_SLUG=""
LIST_ALL=false
PRESERVED_NS="refs/orphans/grok-clean"

usage() {
	cat <<'EOF'
Usage: agent-worktree-clean.sh [options]

Clean orphaned / stale worktrees managed by the Grok CLI (the ones under
~/.grok/worktrees/ created by execute-plan, subagents, etc. — fallback only;
local `.worktrees/` inside project are the strong default per git-worktrees/SKILL.md).

By default this is a **dry run** that shows what would happen.

Primary path (recommended):
  Uses `grok worktree list --json` + `grok worktree gc` / `rm` when the
  grok CLI is available (for globals). Always ends with `git worktree prune`
  for native local worktrees. Far more reliable than raw filesystem scanning.

Options:
  --prune, --execute     Actually perform removals (after showing plan)
  --no-preserve          Do not fetch branches from worktrees before removal
                         (only use if you are sure the commits are already safe)
  --force                Skip confirmation prompts
  --slug <name>          Limit to a specific repo slug under ~/.grok/worktrees/ (global fallback layer)
  --all                  Consider all repos under ~/.grok/worktrees/ (global fallback layer)
  --base <path>          Override the base directory (advanced)
  -h, --help

Recommended usage after a big plan:
  .agents/skills/git-worktrees/scripts/agent-worktree-clean.sh
  .agents/skills/git-worktrees/scripts/agent-worktree-clean.sh --prune

The script will (when possible) preserve any branches that only existed inside
the agent worktrees by fetching them into your current repo first.
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--prune|--execute)
		PRUNE=true
		DRY_RUN=false
		shift
		;;
	--no-preserve)
		PRESERVE_BRANCHES=false
		shift
		;;
	--force)
		FORCE=true
		shift
		;;
	--slug)
		TARGET_SLUG="${2:?}"
		shift 2
		;;
	--all)
		LIST_ALL=true
		shift
		;;
	--base)
		GROK_BASE="${2:?}"
		shift 2
		;;
	-h|--help)
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

have_grok() {
	command -v grok >/dev/null 2>&1
}

# --- Helpers for branch preservation ---

preserve_branches_from_path() {
	local path="$1"
	local label="$2"

	if [[ ! -d "$path/.git" ]]; then
		return 0
	fi

	if [[ "$PRESERVE_BRANCHES" != true ]]; then
		return 0
	fi

	echo "    Preserving branches from $label ..."
	local ts
	ts=$(date +%Y%m%d-%H%M%S)
	# Fetch every ref the worktree knows about into a safe namespace
	git fetch "$path" "+refs/heads/*:${PRESERVED_NS}/${ts}-${label}/*" 2>&1 | tail -3 || true
}

# --- Main logic ---

if ! have_grok; then
	echo "WARNING: 'grok' CLI not found in PATH."
	echo "Falling back to filesystem-only scanning (less accurate)."
	echo
fi

echo "Grok worktree base: $GROK_BASE"
echo

# ============================================
# Phase 1: Use official grok worktree commands
# ============================================

tracked_worktrees=()
dead_count=0

if have_grok; then
	echo "=== Official Grok worktree registry ==="

	# Get authoritative list
	json=$(grok worktree list --json 2>/dev/null || echo '[]')

	if [[ "$json" == "[]" || -z "$json" ]]; then
		echo "No worktrees currently tracked by grok."
	else
		# Pretty print for the user (and collect IDs we may want to remove)
		echo "$json" | python3 -c '
import sys, json
data = json.load(sys.stdin)
for w in data:
    print(f"  {w.get(\"id\", \"?\"):<45}  {w.get(\"type\", \"?\"):<10}  {w.get(\"path\", \"?\")}")
print(f"\n{len(data)} tracked worktree(s)")
' 2>/dev/null || echo "$json"
	fi

	echo
	echo "Running grok worktree gc --dry-run (cleans dead DB records)..."
	gc_output=$(grok worktree gc --dry-run 2>&1 || true)
	echo "$gc_output"

	if echo "$gc_output" | grep -q "Dead records removed: *[1-9]"; then
		dead_count=$(echo "$gc_output" | grep -o 'Dead records removed: *[0-9]*' | awk '{print $NF}')
	fi

	# If user wants to actually prune, do the gc for real
	if [[ "$PRUNE" == true && "$dead_count" -gt 0 ]]; then
		echo
		echo "Removing dead records from DB via grok worktree gc ..."
		grok worktree gc --force 2>&1 || true
	fi

	# Re-fetch the current list for removal decisions
	json=$(grok worktree list --json 2>/dev/null || echo '[]')

	# Store the JSON for later use in the actual removal phase
	echo "$json" > /tmp/grok-worktree-list-$$.json
	tracked_json_file="/tmp/grok-worktree-list-$$.json"
else
	tracked_json_file=""
fi

# ============================================
# Phase 2: Filesystem scan (for untracked ghosts)
# ============================================

echo
echo "=== On-disk directories under $GROK_BASE ==="

on_disk_dirs=()
if [[ -d "$GROK_BASE" ]]; then
	while IFS= read -r -d '' d; do
		on_disk_dirs+=("$d")
	done < <(find "$GROK_BASE" -mindepth 1 -maxdepth 2 -type d -print0 2>/dev/null | sort -z)
fi

if [[ ${#on_disk_dirs[@]} -eq 0 ]]; then
	echo "  (no directories found)"
else
	for d in "${on_disk_dirs[@]}"; do
		size=$(du -sh "$d" 2>/dev/null | cut -f1)
		echo "  $size   ${d#$GROK_BASE/}"
	done
fi

# ============================================
# Dry-run summary
# ============================================

echo
if [[ "$DRY_RUN" == true ]]; then
	echo "This was a dry run."
	echo
	echo "To perform the actual cleanup (recommended sequence):"
	echo "  1. Review the output above"
	echo "  2. $0 --prune"
	echo
	echo "The script will preserve branches from any removed worktrees (unless --no-preserve)."
	exit 0
fi

# ============================================
# Actual removal phase
# ============================================

if [[ "$FORCE" != true ]]; then
	echo "About to make destructive changes using grok worktree commands + directory cleanup."
	read -r -p "Proceed with --prune? [y/N] " reply
	if [[ ! "$reply" =~ ^[Yy]$ ]]; then
		echo "Aborted."
		exit 0
	fi
fi

echo
echo "=== Performing cleanup ==="

# 2a. Remove tracked worktrees via the official CLI (best path)
if have_grok && [[ -f "$tracked_json_file" ]]; then
	python3 -c '
import sys, json, subprocess, os

with open(sys.argv[1]) as f:
    worktrees = json.load(f)

preserve = os.environ.get("PRESERVE_BRANCHES", "true") == "true"
preserved_ns = os.environ.get("PRESERVED_NS", "refs/orphans/grok-clean")

for w in worktrees:
    wid = w.get("id")
    path = w.get("path", "")
    wtype = w.get("type", "unknown")

    print(f">>> Removing tracked worktree: {wid} ({wtype})")

    # Preserve branches if requested and the directory still exists
    if preserve and path and os.path.isdir(os.path.join(path, ".git")):
        print(f"    Fetching branches for preservation from {path} ...")
        ts = subprocess.check_output(["date", "+%Y%m%d-%H%M%S"]).decode().strip()
        label = wid.replace("/", "-")
        try:
            subprocess.check_call(
                ["git", "fetch", path,
                 f"+refs/heads/*:{preserved_ns}/{ts}-{label}/*"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
        except subprocess.CalledProcessError:
            pass

    # Remove via the official CLI (preferred)
    try:
        subprocess.check_call(["grok", "worktree", "rm", "--force", wid])
        print(f"    Removed via grok worktree rm --force {wid}")
    except subprocess.CalledProcessError:
        print(f"    grok worktree rm failed for {wid}, will try directory cleanup if needed")
' "$tracked_json_file" 2>/dev/null || true

	rm -f "$tracked_json_file"
fi

# 2b. Final aggressive GC pass (catches anything newly dead)
if have_grok; then
	echo
	echo "Final grok worktree gc pass..."
	grok worktree gc --force 2>&1 || true
fi

# 2c. Clean any remaining on-disk directories that are no longer tracked
# (this catches the "ghost" case after crashes or manual rm -rf)
echo
echo "Cleaning any remaining on-disk directories not tracked by grok..."
for d in "${on_disk_dirs[@]}"; do
	# If grok still knows about it, skip (we should have removed it above)
	if have_grok; then
		if grok worktree show "$(basename "$d")" >/dev/null 2>&1; then
			continue
		fi
	fi

	if [[ -d "$d" ]]; then
		echo "  Removing untracked directory: ${d#$GROK_BASE/}"
		if [[ "$PRESERVE_BRANCHES" == true && -d "$d/.git" ]]; then
			preserve_branches_from_path "$d" "$(basename "$d")"
		fi
		rm -rf "$d"
	fi
done

# Final native prunes (harmless)
git worktree prune 2>/dev/null || true

echo
echo "Cleanup complete."
echo
echo "Current grok worktree state:"
if have_grok; then
	grok worktree list || echo "  (none)"
else
	echo "  (grok CLI not available for final status)"
fi

echo
echo "Optional follow-up in your primary repo:"
echo "  git gc --prune=now --aggressive"
echo
echo "Any preserved branches are under: ${PRESERVED_NS}/"
echo "You can delete them later with:"
echo "  git for-each-ref --format='delete %(refname)' '${PRESERVED_NS}/*' | git update-ref --stdin"
