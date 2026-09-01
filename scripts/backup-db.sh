#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_JSON="$(node "$ROOT/scripts/load-pipeline-config.mjs")"
DB="$(printf '%s' "$CONFIG_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).dbPath))")"
BACKUP_DIR="$(printf '%s' "$CONFIG_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.backupDir||'')})")"

if [[ -z "$BACKUP_DIR" ]]; then
  echo "pipeline config: set backup_dir in data/pipeline/config.local.json" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_DIR/collab-finder-$STAMP.db"

mkdir -p "$BACKUP_DIR"
sqlite3 "$DB" ".backup '$DEST'"
echo "backup complete (kept last 7)"
ls -1t "$BACKUP_DIR"/collab-finder-*.db 2>/dev/null | tail -n +8 | xargs -r rm -f
