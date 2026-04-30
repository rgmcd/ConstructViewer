#!/usr/bin/env sh
set -eu

PORT="${1:-8181}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

cd "$SCRIPT_DIR"
printf 'Starting Construct Viewer at http://127.0.0.1:%s/\n' "$PORT"
exec node serve-local.js "$PORT"
