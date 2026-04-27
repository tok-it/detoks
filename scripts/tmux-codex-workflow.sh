#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${TMUX:-}" ]]; then
  echo "This command must be run inside tmux." >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: $(basename "$0") \"<task prompt>\"" >&2
  exit 1
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux command not found in PATH" >&2
  exit 1
fi

TASK_PROMPT="$*"
QUOTED_PROMPT="$(printf '%q' "$TASK_PROMPT")"
RIGHT_PANE_CMD="cd \"$ROOT_DIR\" && ./scripts/codex-task.sh $QUOTED_PROMPT; TASK_EXIT=\$?; echo; echo \"[tmux-codex-workflow] task exit code: \$TASK_EXIT\"; echo \"[tmux-codex-workflow] pane left open for result review\"; exec \"\$SHELL\""

tmux split-window -h -c "$ROOT_DIR" bash -lc "$RIGHT_PANE_CMD"
tmux select-pane -L
tmux display-message "Left pane: planning/completion | Right pane: codex-task.sh started (pane stays open after completion)"
