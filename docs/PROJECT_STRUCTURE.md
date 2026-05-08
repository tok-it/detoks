# 📁 Project Structure

This scaffold keeps the main application logic in **TypeScript** and uses **Python** only for the Kompress worker plus limited utility fallback paths.

## Tree

```text
detoks/
├── docs/
├── scripts/
├── python/
│   └── llama_server/
│       ├── __init__.py
│       └── kompress_worker.py
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   └── repl/
│   ├── core/
│   │   ├── context/
│   │   ├── executor/
│   │   ├── output/
│   │   ├── pipeline/
│   │   ├── state/
│   │   ├── task-graph/
│   │   ├── translate/
│   │   ├── prompt/
│   │   ├── guardrails/
│   │   └── llm-client/
│   ├── integrations/
│   │   ├── adapters/
│   │   │   ├── codex/
│   │   │   └── gemini/
│   │   └── subprocess/
│   ├── schemas/
│   ├── types/
│   └── utils/
└── tests/
    └── ts/
        ├── integration/
        └── unit/
```

## Ownership

- `python/llama_server/kompress_worker.py`: Python Kompress worker only
- `src/core/translate`, `src/core/prompt`, `src/core/guardrails`: TypeScript implementation for Role 1
- `src/*`: TypeScript implementation for Roles 1, 2.1, 2.2, and 3
- `src/integrations/*`: External tool integrations (Codex, Gemini, subprocess handling)
- `tests/ts/*`: TypeScript tests for application logic, including Role 1 modules

## Mapping

- `python/llama_server`: Kompress worker support code only
- `src/cli`: CLI layer, REPL, and user-facing commands
- `src/core/pipeline`: pipeline orchestration
- `src/core/task-graph`: request analysis, task graph generation, and dependency ordering
- `src/core/context`: context compression and optimization
- `src/core/output`: output summarization and result structuring
- `src/core/state`: session state management
- `src/core/executor`: execution flow coordination
- `src/core/translate`: Korean-to-English translation pipeline
- `src/core/prompt`: prompt compression
- `src/core/guardrails`: validate and repair translated output
- `src/core/llm-client`: handles communication with llama.cpp
- `src/integrations/adapters/*`: target CLI integrations such as Codex and Gemini
- `src/integrations/subprocess`: process spawning and I/O bridging
- `src/schemas`: TypeScript-side runtime schemas and validation definitions
- `src/types`: shared TypeScript types
- `src/utils`: shared TypeScript utilities
- `scripts`: developer automation scripts

## Design Rule

- Core logic must reside under `src/core`
- Translation, prompt processing, and LLM interaction are treated as core pipeline responsibilities
- The local llama.cpp serving path must rely on the external prebuilt `llama-server` binary rather than Python
- Python is limited to worker or utility subprocesses and must not contain application logic
- All LLM interaction must go through `src/core/llm-client`
- TypeScript may integrate Python only through explicit subprocess boundaries
- External integrations must remain isolated under `src/integrations`
