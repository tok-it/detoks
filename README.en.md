# detoks

<p align="right">
  <a href="./README.md">Language</a> | <a href="./README.ko.md">한국어</a>
</p>

detoks is an **interactive wrapper CLI** that sits in front of LLM CLIs such as `codex`, `gemini`, and `claude`.
Its goal is to make LLM CLI workflows more stable and reproducible by organizing input, context, state, and execution boundaries.

<p align="center">
  <img src="./content.png" alt="detoks preview" width="720" />
</p>

## At a glance

- One-shot execution and REPL mode (text or full-screen TUI)
- Task graph / context / state management
- Separated adapter / subprocess boundaries: `codex` / `gemini` / `claude`
- `stub` / `real` execution modes
- Session save and resume workflow (checkpoint support)
- **RAG system**: cross-session context reuse, semantic search, failure pattern recognition
- **Cache system**: cross-session cache, hash-based validity checks, `/cache` REPL command
- **TUI mode** (full screen):
  - Live pipeline status / cache stream / RAG context summary
  - Theme system: `dark` / `light` / `colorblind` built-in palettes
  - Runtime resizable split view: `/layout` command + Alt+↑/↓
  - Inline cursor editing: Ctrl+A/E, ←/→, Home/End
  - Input history: ↑/↓ to recall previous prompts + disk persistence
  - Nerd Font icon support

## Requirements

- Node.js `>=24.15.0 <26`
- `codex`, `gemini`, or `claude` CLI when using the corresponding adapter
- GGUF model loadable by `node-llama-cpp` when using local model inference

See [STACK_VERSIONS.md](./docs/STACK_VERSIONS.md) and [LLAMA_CPP_SERVER_SPEC.md](./docs/LLAMA_CPP_SERVER_SPEC.md) for version details.

## Install

### 1) Local install

Install into the current folder. You can run this from any path, but the package is placed in the current directory's `node_modules`.

```bash
npm install @sorlros/detoks
```

To run the CLI inside that project:

```bash
npx detoks --help
```

### 2) Global install

```bash
npm install -g @sorlros/detoks
```

Then run it from anywhere:

```bash
detoks --help
```

### 3) Run without installing

```bash
npx @sorlros/detoks --help
```

## Quick start

```bash
detoks --help
detoks repl
detoks "summarize the current repo status"
```

REPL examples:

```bash
# Text REPL (default)
detoks repl --adapter codex --execution-mode stub

# TUI REPL (full-screen UI)
detoks repl --adapter codex --execution-mode stub --tui

# TUI — light theme
DETOKS_THEME=light detoks repl --adapter gemini --tui

# TUI — Nerd Font icons
DETOKS_NERD_FONT=1 detoks repl --adapter claude --tui
```

## TUI REPL commands

Slash commands available during TUI / Text REPL:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/adapter` | Switch adapter (codex / gemini / claude) |
| `/model` | Change model |
| `/cache [stats\|clear\|disable\|enable]` | Manage RAG cache state |
| `/layout [reset\|transcript=N\|result=N\|+\|-]` | Resize TUI split at runtime |
| `/nerd [on\|off]` | Toggle Nerd Font icons |
| `/verbose` | Toggle verbose output |
| `/exit` | Exit REPL |

TUI keyboard shortcuts:

| Shortcut | Action |
|----------|--------|
| ↑ / ↓ | Navigate input history |
| ←/→, Home/End | Move cursor |
| Ctrl+A / Ctrl+E | Jump to line start / end |
| Alt+↑ / Alt+↓ | Resize split view |

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DETOKS_THEME` | TUI theme: `dark` / `light` / `colorblind` | `dark` |
| `DETOKS_NERD_FONT` | Enable Nerd Font icons (`1` = on) | `0` |

## What detoks does

1. Organizes input into work units
2. Builds task graphs and dependencies
3. Injects only the context needed for the current step (with cross-session RAG retrieval)
4. Executes through adapter / subprocess boundaries
5. Saves results to session state for later reuse (cache + pattern learning)

## Changelog

### Development version (dev — next release)

**TUI improvements**
- Theme system: `dark` / `light` / `colorblind` built-in palettes + `DETOKS_THEME` env var
- Runtime resizable split view: `/layout` REPL command + Alt+↑/↓ shortcut
- Inline cursor editing: Ctrl+A/E, ←/→, Home/End, position-aware backspace
- Input history: ↑/↓ recall + disk persistence across sessions
- Nerd Font icon support: `DETOKS_NERD_FONT=1` or `/nerd on`
- Adapter transcript auto-save + result panel file path display
- Result panel: Resume hint / Task grid / Verbose cost always visible
- Live cache stream + RAG context summary always visible
- Embedded PTY rendering optimization (contiguous wide-char rendering)
- Design tokens + event router + declarative layout schema

**RAG system (Phase 1–2)**
- Cross-session cache: reuse context from previous sessions in current prompt
- Semantic search: vector search via sqlite-vec + BGE-M3 embeddings
- Pattern learning: task sequence extraction, failure pattern recognition, workflow template generation
- ProjectMemory project_id isolation (separate cache per project)
- `/cache [stats|clear|disable|enable]` REPL command
- KURE-v1 embedding model + automatic first-run download
- RAG indexing progress displayed in TUI

**Translation and other**
- Translation preamble automatic removal + fallback stability improvements
- Translation model visualization benchmark script (`npm run benchmark:translate-report`)

---

### 0.1.2 (2026-05-06)

- Improved install documentation: local / global / npx flows clarified
- First-run model setup persistence stabilized

### 0.1.1 (2026-05-04) — First public npm release

- `@sorlros/detoks` published to npm
- `claude` adapter added (third official adapter alongside `codex` and `gemini`)
- Task type persisted in session results (survives restart)
- Codex reasoning flow improvements
- Local model execution via `node-llama-cpp` (GGUF)
- TUI foundation: embedded PTY, real-time streaming, Korean IME input handling
- Session checkpoint: save, list, continue, fork, restore
- Role 1 translation pipeline + Guardrails output validation

## Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [PIPELINE.md](./docs/PIPELINE.md)
- [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)
- [STACK_VERSIONS.md](./docs/STACK_VERSIONS.md)
- [DEPENDENCY_WORKFLOW.md](./docs/DEPENDENCY_WORKFLOW.md)
- [TESTING_GUIDE.md](./docs/TESTING_GUIDE.md)
- [ROLES.md](./docs/ROLES.md)
- [ENGINEERING_GUIDELINES.md](./docs/ENGINEERING_GUIDELINES.md)
- [SCHEMAS.md](./docs/SCHEMAS.md)

## Windows usage

Windows native execution is not supported; use WSL Ubuntu instead.
See [LLAMA_CPP_SERVER_SPEC.md](./docs/LLAMA_CPP_SERVER_SPEC.md) for installation and execution details.
