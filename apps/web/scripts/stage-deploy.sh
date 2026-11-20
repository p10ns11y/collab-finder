#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
SCAN_ONLY=1 POOL_PATH=dist/pool.json node scripts/prepare-pool.ts
out="${STAGE_DIR:?}"
rm -rf "$out" && mkdir -p "$out"
cp -r dist/. "$out/"
cp vercel.json "$out/vercel.json"
cp pool-scan.json "$out.pool-scan.json"
SCAN_ONLY=1 POOL_PATH="$out/pool.json" node scripts/prepare-pool.ts > "$out.bundle-scan.json"
( cd "$out" && find . -type f | sed 's#^\./##' | sort | while read -r f; do printf '%s\t%s\t%s\n' "$f" "$(sha1sum "$f" | cut -d' ' -f1)" "$(stat -c %s "$f")"; done ) > "$out.manifest.tsv"
cat "$out.manifest.tsv"
