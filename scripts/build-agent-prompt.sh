#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RULES_FILE="$ROOT_DIR/.prompts/common-agent-rules.md"

if [[ $# -lt 1 ]]; then
  echo "Usage: $(basename "$0") \"<task prompt>\"" >&2
  exit 1
fi

TASK_PROMPT="$*"

if [[ ! -f "$RULES_FILE" ]]; then
  echo "Missing rules file: $RULES_FILE" >&2
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

CURRENT_BRANCH="$(git -C "$ROOT_DIR" branch --show-current 2>/dev/null || true)"
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

STATUS_LABEL="Current git status:"
DIFF_LABEL="Current diff summary:"

if [[ ${#SCOPED_FILES[@]} -gt 0 ]]; then
  STATUS_OUTPUT="$(git -C "$ROOT_DIR" status --short -- "${SCOPED_FILES[@]}" 2>/dev/null || true)"
  DIFF_OUTPUT="$(git -C "$ROOT_DIR" diff --stat -- "${SCOPED_FILES[@]}" 2>/dev/null || true)"
  STATUS_LABEL="Current git status (relevant files only):"
  DIFF_LABEL="Current diff summary (relevant files only):"
else
  STATUS_OUTPUT="$(git -C "$ROOT_DIR" status --short 2>/dev/null || true)"
  DIFF_OUTPUT="$(git -C "$ROOT_DIR" diff --stat 2>/dev/null || true)"
fi

if [[ -t 2 ]]; then
  BOLD=$'\033[1m'
  CYAN=$'\033[36m'
  YELLOW=$'\033[33m'
  BLUE_BG=$'\033[44m'
  LIGHT_GRAY_BG=$'\033[48;5;250m'
  DARK_TEXT=$'\033[30m'
  CYAN_BG=$'\033[46m'
  WHITE=$'\033[97m'
  DIM=$'\033[2m'
  RESET=$'\033[0m'
else
  BOLD=""
  CYAN=""
  YELLOW=""
  BLUE_BG=""
  LIGHT_GRAY_BG=""
  DARK_TEXT=""
  CYAN_BG=""
  WHITE=""
  DIM=""
  RESET=""
fi

if [[ -t 2 ]]; then
  {
    printf '\n%s%s%s\n' "${BOLD}${CYAN_BG}${WHITE}" "=== AGENT PROMPT / INSTRUCTIONS ===" "$RESET"
    printf '%s%s%s\n' "$YELLOW" "Rules:" "$RESET"
    printf '%s%s%s\n\n' "${DIM}${BLUE_BG}${WHITE}" "$(cat "$RULES_FILE")" "$RESET"

    printf '%s%s%s\n' "$YELLOW" "Current branch:" "$RESET"
    printf '%s%s%s\n\n' "${DIM}${BLUE_BG}${WHITE}" "$CURRENT_BRANCH" "$RESET"

    printf '%s%s%s\n' "$YELLOW" "$STATUS_LABEL" "$RESET"
    printf '%s%s%s\n\n' "${DIM}${BLUE_BG}${WHITE}" "${STATUS_OUTPUT:-<clean>}" "$RESET"

    printf '%s%s%s\n' "$YELLOW" "$DIFF_LABEL" "$RESET"
    printf '%s%s%s\n\n' "${DIM}${BLUE_BG}${WHITE}" "${DIFF_OUTPUT:-<none>}" "$RESET"

    printf '%s%s%s\n' "$YELLOW" "User task:" "$RESET"
    printf '%s%s%s\n\n' "${BOLD}${LIGHT_GRAY_BG}${DARK_TEXT}" "$TASK_PROMPT" "$RESET"
  } >&2
fi

cat <<EOF
$(cat "$RULES_FILE")

---

Current branch:
$CURRENT_BRANCH

${STATUS_LABEL}
$STATUS_OUTPUT

${DIFF_LABEL}
$DIFF_OUTPUT

---

User task:
$TASK_PROMPT
EOF
