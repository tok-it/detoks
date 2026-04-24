#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TASK_PROMPT="$*"

if [[ $# -lt 1 ]]; then
  echo "Usage: $(basename "$0") \"<task prompt>\"" >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex command not found in PATH" >&2
  exit 1
fi

extract_relevant_files() {
  printf '%s\n' "$TASK_PROMPT" | awk '
    /^##[[:space:]]+Relevant files/ { in_section=1; next }
    /^##[[:space:]]+/ { if (in_section) exit }
    in_section {
      line=$0
      sub(/^[[:space:]]*-[[:space:]]*/, "", line)
      gsub(/`/, "", line)
      sub(/[[:space:]]+$/, "", line)
      if (line ~ /^(src|tests|docs|scripts|\.prompts|\.github|python)\//) {
        print line
      }
    }
  '
}

EXTRACTED_FILES=()
SCOPED_FILES=()

while IFS= read -r path; do
  EXTRACTED_FILES+=("$path")
done < <(extract_relevant_files)

for path in "${EXTRACTED_FILES[@]}"; do
  if [[ -e "$ROOT_DIR/$path" ]]; then
    SCOPED_FILES+=("$path")
  fi
done

collect_status_output() {
  if [[ ${#SCOPED_FILES[@]} -gt 0 ]]; then
    git -C "$ROOT_DIR" status --short -- "${SCOPED_FILES[@]}" 2>/dev/null || true
  else
    git -C "$ROOT_DIR" status --short 2>/dev/null || true
  fi
}

collect_diff_output() {
  if [[ ${#SCOPED_FILES[@]} -gt 0 ]]; then
    git -C "$ROOT_DIR" diff --stat -- "${SCOPED_FILES[@]}" 2>/dev/null || true
  else
    git -C "$ROOT_DIR" diff --stat 2>/dev/null || true
  fi
}

if [[ -t 2 ]]; then
  BOLD=$'\033[1m'
  GREEN_BG=$'\033[42m'
  RED_BG=$'\033[41m'
  YELLOW=$'\033[33m'
  BLUE_BG=$'\033[44m'
  WHITE=$'\033[97m'
  DIM=$'\033[2m'
  RESET=$'\033[0m'
  printf '\n%s%s%s\n' "${BOLD}${GREEN_BG}${WHITE}" "=== CODEX RESPONSE STARTS BELOW ===" "$RESET" >&2
else
  BOLD=""
  GREEN_BG=""
  RED_BG=""
  YELLOW=""
  BLUE_BG=""
  WHITE=""
  DIM=""
  RESET=""
fi

STATUS_OUTPUT_BEFORE="$(collect_status_output)"

if {
  bash "$ROOT_DIR/scripts/build-agent-prompt.sh" "$@"
} | codex exec -; then
  TASK_STATUS="success"
  COMPLETION_BG="$GREEN_BG"
else
  TASK_STATUS="failed"
  COMPLETION_BG="$RED_BG"
fi

STATUS_OUTPUT_AFTER="$(collect_status_output)"
DIFF_OUTPUT_AFTER="$(collect_diff_output)"

if [[ -t 2 ]]; then
  {
    printf '\n%s%s%s\n' "${BOLD}${COMPLETION_BG}${WHITE}" "=== CODEX TASK COMPLETED (${TASK_STATUS^^}) ===" "$RESET"

    printf '%s%s%s\n' "$YELLOW" "Relevant file status:" "$RESET"
    printf '%s%s%s\n\n' "${DIM}${BLUE_BG}${WHITE}" "${STATUS_OUTPUT_AFTER:-<clean>}" "$RESET"

    printf '%s%s%s\n' "$YELLOW" "Relevant diff summary:" "$RESET"
    printf '%s%s%s\n\n' "${DIM}${BLUE_BG}${WHITE}" "${DIFF_OUTPUT_AFTER:-<none>}" "$RESET"
  } >&2
fi

if [[ -n "${TMUX:-}" ]] && command -v tmux >/dev/null 2>&1; then
  if [[ "$TASK_STATUS" == "success" ]]; then
    tmux display-message "Right pane task completed: success" >/dev/null 2>&1 || true
  else
    tmux display-message "Right pane task completed: failed" >/dev/null 2>&1 || true
  fi
fi

if [[ "$TASK_STATUS" != "success" ]]; then
  exit 1
fi
