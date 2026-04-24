#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${TMUX:-}" ]]; then
  echo "This command must be run inside tmux." >&2
  exit 1
fi

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
  MAGENTA_BG=$'\033[45m'
  WHITE=$'\033[97m'
  RESET=$'\033[0m'
  printf '\n%s%s%s\n' "${BOLD}${MAGENTA_BG}${WHITE}" "=== FOCUSED COMPLETION PANE WORKFLOW STARTED ===" "$RESET" >&2
fi

exec "$ROOT_DIR/scripts/codex-task-complete.sh" "$@"
