#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: ./scripts/add-py-dep.sh <package> [more packages...]"
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "Error: uv is required. Install uv first, then retry."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"
uv add "$@"
