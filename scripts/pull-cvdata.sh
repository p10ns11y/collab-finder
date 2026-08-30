#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec bash "$HERE/../vendor/kanithanj-cv/scripts/pull-cvdata.sh" "$@"
