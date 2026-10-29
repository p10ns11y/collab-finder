#!/usr/bin/env bash
# With a venv present, a failing lizard stub must make the local check non-zero.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

mkdir -p "$scratch/scripts" "$scratch/.ci-venv-lizard/bin"
cp "$REPO/scripts/ci-complexity.sh" "$REPO/scripts/ensure-lizard.sh" "$scratch/scripts/"

cat >"$scratch/.ci-venv-lizard/bin/python" <<'EOF'
#!/bin/sh
exit 0
EOF
cat >"$scratch/.ci-venv-lizard/bin/lizard" <<'EOF'
#!/bin/sh
echo "lizard failed" >&2
exit 1
EOF
chmod +x "$scratch/.ci-venv-lizard/bin/python" "$scratch/.ci-venv-lizard/bin/lizard"

set +e
bash "$scratch/scripts/ci-complexity.sh"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  echo "FAIL: ci-complexity.sh exited 0 while the venv lizard stub failed" >&2
  exit 1
fi

echo "OK: ci-complexity.sh exited ${status}"
