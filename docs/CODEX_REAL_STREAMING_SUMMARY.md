# Codex real-streaming update

## Problem
- `detoks repl --execution-mode real` could look frozen after prompt entry.
- Live output from Codex was not surfacing clearly in the TUI.

## What changed
### 1) Codex execution path
- Codex real mode now adds:
  - `--json`
  - `--output-last-message <tmpfile>`
- The last message file is used as the final raw output after the stream completes.

### 2) Streaming transport
- Codex JSON output is now treated as a native line stream.
- The runner emits chunk events directly from stdout JSONL instead of waiting for a pseudo-PTY wrapper.

### 3) TUI transcript rendering
- Codex lifecycle JSON events are summarized into short human-readable status lines so the transcript panel shows progress, not debug noise.
- Example:
  - `[Codex] 작업 시작`
  - `[Codex] 응답 생성 중…`
  - `Hello`
  - `[ERR] ...`
- If the live stream stays empty, the final `--output-last-message` text is surfaced in the transcript pane as a fallback.

### 4) Verification
- Added/updated unit coverage for:
  - Codex real-path subprocess args
  - transcript JSON formatting
  - Codex JSON stream runner path

## Result
- Real mode now shows incremental Codex progress/content in the transcript area without exposing raw lifecycle event names.
- The final assistant message is still recoverable even when the live JSON stream is sparse.

## Follow-up ideas
- Tune the JSON event formatter for richer Codex event types.
- If Codex changes its JSON schema, update the transcript parser in one place.
