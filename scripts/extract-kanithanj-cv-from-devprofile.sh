#!/usr/bin/env bash
# Copy CV PDF maker subset from devprofile into vendor/kanithanj-cv/ (ship with collab-finder).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV="${DEVPROFILE_SRC:-${HOME}/Work/personal/devprofile}"
DEST="$ROOT/vendor/kanithanj-cv"

if [[ ! -d "$DEV/scripts/generate-apply-cv.tsx" && ! -f "$DEV/scripts/generate-apply-cv.tsx" ]]; then
  echo "devprofile not found at $DEV — set DEVPROFILE_SRC" >&2
  exit 1
fi

mkdir -p "$DEST/scripts" "$DEST/src/components" "$DEST/src/lib" "$DEST/src/data"

copy() {
  local rel="$1"
  local src="$DEV/$rel"
  local out="$DEST/$rel"
  mkdir -p "$(dirname "$out")"
  cp "$src" "$out"
}

for rel in \
  scripts/generate-apply-cv.tsx \
  scripts/link-application-packs.mjs \
  src/components/cv-document.tsx \
  src/lib/cv-overlay.ts \
  src/lib/cv-layout-policy.ts \
  src/lib/cv-featured-projects.ts \
  src/lib/apply-cv-filename.ts; do
  copy "$rel"
done

# Placeholder cvdata — install symlinks real master at setup
if [[ ! -f "$DEST/src/data/cvdata.json" ]]; then
  cp "$DEV/src/data/cvdata.json" "$DEST/src/data/cvdata.example.json"
  cat >"$DEST/src/data/cvdata.json" <<'EOF'
{"name":"Configure cvdata","title":"Run Install kanithanj.cv in Preferences","email":"","phone":"","location":"","profile":"Symlink your master cvdata.json during install.","experience":[],"projects":[],"education":[],"skills":[]}
EOF
fi

cat >"$DEST/package.json" <<'EOF'
{
  "name": "kanithanj-cv",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "generate-apply-cv": "bun scripts/generate-apply-cv.tsx",
    "link-application-packs": "node scripts/link-application-packs.mjs"
  },
  "dependencies": {
    "@react-pdf/renderer": "^4.3.0",
    "react": "^19.0.0"
  }
}
EOF

cat >"$DEST/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["scripts/**/*.tsx", "scripts/**/*.mjs", "src/**/*.ts", "src/**/*.tsx"]
}
EOF

cat >"$DEST/README.md" <<'EOF'
# kanithanj.cv

Extracted apply-CV PDF maker (from devprofile). Installed to `~/.local/share/kanithanj.cv` by collab-finder.

Do not edit vendor copy by hand — re-run `scripts/extract-kanithanj-cv-from-devprofile.sh`.
EOF

echo "Extracted kanithanj-cv → $DEST"
