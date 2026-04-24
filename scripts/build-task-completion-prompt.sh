#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROMPT_FILE="$ROOT_DIR/.prompts/codex-task-complete.md"
PR_TEMPLATE_FILE="$ROOT_DIR/.github/pull_request_template.md"
KANBAN_TEMPLATE_FILE="$ROOT_DIR/.prompts/git-kanban-in-progress-template.md"
NEXT_TASK_TEMPLATE_FILE="$ROOT_DIR/.prompts/next-task-harness-template.md"

if [[ $# -lt 1 ]]; then
  echo "Usage: $(basename "$0") \"<completed work unit prompt>\"" >&2
  exit 1
fi

TASK_PROMPT="$*"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Missing prompt file: $PROMPT_FILE" >&2
  exit 1
fi

CURRENT_BRANCH="$(git -C "$ROOT_DIR" branch --show-current 2>/dev/null || true)"
STATUS_OUTPUT="$(git -C "$ROOT_DIR" status --short 2>/dev/null || true)"
DIFF_OUTPUT="$(git -C "$ROOT_DIR" diff --stat 2>/dev/null || true)"
PR_TEMPLATE_OUTPUT="<missing repository PR template>"
KANBAN_TEMPLATE_OUTPUT="<missing Git Kanban template>"
NEXT_TASK_TEMPLATE_OUTPUT="<missing next task template>"

if [[ -f "$PR_TEMPLATE_FILE" ]]; then
  PR_TEMPLATE_OUTPUT="$(cat "$PR_TEMPLATE_FILE")"
fi

if [[ -f "$KANBAN_TEMPLATE_FILE" ]]; then
  KANBAN_TEMPLATE_OUTPUT="$(cat "$KANBAN_TEMPLATE_FILE")"
fi

if [[ -f "$NEXT_TASK_TEMPLATE_FILE" ]]; then
  NEXT_TASK_TEMPLATE_OUTPUT="$(cat "$NEXT_TASK_TEMPLATE_FILE")"
fi

if [[ -t 2 ]]; then
  BOLD=$'\033[1m'
  MAGENTA=$'\033[35m'
  YELLOW=$'\033[33m'
  LIGHT_GRAY_BG=$'\033[48;5;250m'
  DARK_TEXT=$'\033[30m'
  BLUE_BG=$'\033[44m'
  WHITE=$'\033[97m'
  DIM=$'\033[2m'
  RESET=$'\033[0m'
else
  BOLD=""
  MAGENTA=""
  YELLOW=""
  LIGHT_GRAY_BG=""
  DARK_TEXT=""
  BLUE_BG=""
  WHITE=""
  DIM=""
  RESET=""
fi

if [[ -t 2 ]]; then
  {
    printf '\n%s%s%s\n' "${BOLD}${MAGENTA}${WHITE}" "=== CODEX TASK COMPLETION / PR DRAFT ===" "$RESET"
    printf '%s%s%s\n' "$YELLOW" "Completion prompt:" "$RESET"
    printf '%s%s%s\n\n' "${DIM}${BLUE_BG}${WHITE}" "$(cat "$PROMPT_FILE")" "$RESET"

    printf '%s%s%s\n' "$YELLOW" "Current branch:" "$RESET"
    printf '%s%s%s\n\n' "${DIM}${BLUE_BG}${WHITE}" "${CURRENT_BRANCH:-<unknown>}" "$RESET"

    printf '%s%s%s\n' "$YELLOW" "Current git status:" "$RESET"
    printf '%s%s%s\n\n' "${DIM}${BLUE_BG}${WHITE}" "${STATUS_OUTPUT:-<clean>}" "$RESET"

    printf '%s%s%s\n' "$YELLOW" "Current diff summary:" "$RESET"
    printf '%s%s%s\n\n' "${DIM}${BLUE_BG}${WHITE}" "${DIFF_OUTPUT:-<none>}" "$RESET"

    printf '%s%s%s\n' "$YELLOW" "Repository PR template:" "$RESET"
    printf '%s%s%s\n\n' "${DIM}${BLUE_BG}${WHITE}" "$PR_TEMPLATE_OUTPUT" "$RESET"

    printf '%s%s%s\n' "$YELLOW" "Git Kanban template:" "$RESET"
    printf '%s%s%s\n\n' "${DIM}${BLUE_BG}${WHITE}" "$KANBAN_TEMPLATE_OUTPUT" "$RESET"

    printf '%s%s%s\n' "$YELLOW" "Next task template:" "$RESET"
    printf '%s%s%s\n\n' "${DIM}${BLUE_BG}${WHITE}" "$NEXT_TASK_TEMPLATE_OUTPUT" "$RESET"

    printf '%s%s%s\n' "$YELLOW" "Completed work unit:" "$RESET"
    printf '%s%s%s\n\n' "${BOLD}${LIGHT_GRAY_BG}${DARK_TEXT}" "$TASK_PROMPT" "$RESET"
  } >&2
fi

cat <<EOF
$(cat "$PROMPT_FILE")

---

Current branch:
$CURRENT_BRANCH

Current git status:
$STATUS_OUTPUT

Current diff summary:
$DIFF_OUTPUT

Repository PR template:
$PR_TEMPLATE_OUTPUT

Git Kanban template:
$KANBAN_TEMPLATE_OUTPUT

Next task template:
$NEXT_TASK_TEMPLATE_OUTPUT

---

Completed work unit:
$TASK_PROMPT
EOF
