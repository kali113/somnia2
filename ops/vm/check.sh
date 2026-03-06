#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -d "$SCRIPT_DIR/src" && -f "$SCRIPT_DIR/tsconfig.scripts.json" ]]; then
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  pnpm --dir "$PROJECT_ROOT" exec tsc -p "$SCRIPT_DIR/tsconfig.scripts.json"
fi

node "$SCRIPT_DIR/dist/check.js" "$@"
