#!/usr/bin/env bash
set -euo pipefail
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/collab-finder"
DB="$DATA_DIR/collab-finder.db"
BACKUP_DIR="$DATA_DIR/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_DIR/collab-finder-$STAMP.db"

if [[ ! -f "$DB" ]]; then
  echo "No database at $DB" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
sqlite3 "$DB" ".backup '$DEST'"
echo "backup: $DEST"
ls -1t "$BACKUP_DIR"/collab-finder-*.db 2>/dev/null | tail -n +8 | xargs -r rm -f
echo "kept last 7 backups in $BACKUP_DIR"
