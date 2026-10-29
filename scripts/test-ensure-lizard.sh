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

cat >"$scratch/.ci-venv-lizard/bin/lizard" <<'EOF'
#!/bin/sh
echo "lizard failed" >&2
exit 7
EOF
chmod +x "$scratch/.ci-venv-lizard/bin/lizard"

set +e
bash "$scratch/scripts/ci-complexity.sh"
ci_status=$?
bash "$scratch/scripts/ensure-lizard.sh"
ensure_status=$?
set -e

if [[ "$ci_status" -ne 7 || "$ensure_status" -ne 7 ]]; then
  echo "FAIL: expected status 7 from ci-complexity.sh (${ci_status}) and ensure-lizard.sh (${ensure_status})" >&2
  exit 1
fi

echo "OK: ci-complexity.sh exited ${ci_status}; ensure-lizard.sh exited ${ensure_status}"
