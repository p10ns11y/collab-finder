#!/usr/bin/env bash
# Install lizard into a repo-local venv (Ubuntu 22.04 CI has old pip — no --break-system-packages).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="${ROOT}/.ci-venv-lizard"

if "${VENV}/bin/python" -c "import lizard" 2>/dev/null; then
  export PATH="${VENV}/bin:${PATH}"
  exit 0
fi

echo "== ensure-lizard: creating venv at .ci-venv-lizard"
python3 -m venv "${VENV}"
"${VENV}/bin/pip" install -q "lizard==1.17.19"
export PATH="${VENV}/bin:${PATH}"
