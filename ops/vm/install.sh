#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"

pnpm --dir "$PROJECT_ROOT" exec tsc -p "$ROOT_DIR/tsconfig.scripts.json"

node "$ROOT_DIR/dist/install.js" "$@"
