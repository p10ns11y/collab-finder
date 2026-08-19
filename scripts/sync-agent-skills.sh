#!/usr/bin/env bash
# Sync portable agent skills for collab-finder.
# - --lock    refresh skills-lock.json via npx skills (copied trees)
# - --pull    symlink from local SKILLS_ROOT (fast dev; skips in-repo dirs)
# - --verify  verify-pack + skills-lock presence
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:---help}"
SKILLS_ROOT="${SKILLS_ROOT:-$HOME/Work/personal/skills}"

LOCK_SKILLS=(
  ai-optimization architecture-synthesis agent-orchestrator control-graph
  git-worktrees concurrent-cli-agents split-to-prs fix-dependency-security
  subagent-delegation react-client-expert finder-reactor fusion-sage looper
  tauri-agentic
)

usage() {
  cat <<'EOF'
Usage: scripts/sync-agent-skills.sh [--lock | --pull | --verify]

  --lock    npx skills add p10ns11y/skills (copies + skills-lock.json)
  --pull    pull-skills.sh --pack agentic-desktop from SKILLS_ROOT (symlinks)
  --verify  check skills-lock.json + verify-pack.sh

Env: SKILLS_ROOT (default ~/Work/personal/skills)
EOF
}

cmd_lock() {
  local args=()
  for skill in "${LOCK_SKILLS[@]}"; do
    args+=(-s "$skill")
  done
  npx --yes skills add p10ns11y/skills "${args[@]}" -y --copy
  echo "OK   skills-lock.json updated ($(wc -l < skills-lock.json | tr -d ' ') lines)"
}

cmd_pull() {
  local pull="$SKILLS_ROOT/master-planner/scripts/pull-skills.sh"
  [[ -x "$pull" || -f "$pull" ]] || { echo "FAIL missing $pull" >&2; exit 1; }
  bash "$pull" --project "$ROOT" --pack agentic-desktop
  # multi-agent extras not in agentic-desktop pack:
  bash "$pull" --project "$ROOT" --skills ai-optimization,architecture-synthesis,concurrent-cli-agents,split-to-prs,fix-dependency-security,subagent-delegation,react-client-expert
}

cmd_verify() {
  [[ -f skills-lock.json ]] || { echo "FAIL missing skills-lock.json"; exit 1; }
  echo "OK   skills-lock.json present"
  if [[ -f "$SKILLS_ROOT/master-planner/scripts/verify-pack.sh" ]]; then
    bash "$SKILLS_ROOT/master-planner/scripts/verify-pack.sh" --project "$ROOT"
  else
    echo "NOTE verify-pack.sh not found at SKILLS_ROOT — skip"
    ls -la .agents/skills | head -20
  fi
}

case "$MODE" in
  --lock) cmd_lock ;;
  --pull) cmd_pull ;;
  --verify) cmd_verify ;;
  -h|--help|*) usage ;;
esac
