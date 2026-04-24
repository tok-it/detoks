#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $(basename "$0") \"<completed work unit prompt>\"" >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex command not found in PATH" >&2
  exit 1
fi

if [[ -t 2 ]]; then
  BOLD=$'\033[1m'
  GREEN_BG=$'\033[42m'
  WHITE=$'\033[97m'
  RESET=$'\033[0m'
  printf '\n%s%s%s\n' "${BOLD}${GREEN_BG}${WHITE}" "=== CODEX TASK COMPLETION OUTPUT STARTS BELOW ===" "$RESET" >&2
fi

{
  bash "$ROOT_DIR/scripts/build-task-completion-prompt.sh" "$@"
} | codex
