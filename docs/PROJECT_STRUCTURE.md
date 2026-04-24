# 📁 Project Structure

This scaffold limits **Python** to the llama.cpp inference server and keeps application logic in **TypeScript**.

## Tree

```text
detoks/
├── docs/
├── scripts/
├── python/
│   └── llama-server/
│       ├── models/
│       ├── config/
│       └── run.py
│   └── llama-server/
│       ├── models/
│       ├── config/
│       └── run.py
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

- `python/llama-server/*`: LLM inference server (llama.cpp runtime only)
- `src/core/translate`, `src/core/prompt`, `src/core/guardrails`: TypeScript implementation for Role 1
- `src/*`: TypeScript implementation for Roles 1, 2.1, 2.2, and 3
- `src/integrations/*`: External tool integrations (Codex, Gemini, subprocess handling)
- `tests/python/*`: Python tests for llama-server only
- `tests/ts/*`: TypeScript tests for application logic, including Role 1 modules

## Mapping

- `python/llama-server`: Model loading, inference endpoint, server configuration
- `python/llama-server`: Model loading, inference endpoint, server configuration
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

- Core logic must reside under src/core
- Translation, prompt processing, and LLM interaction are treated as core pipeline responsibilities
- Python is limited to running the LLM server and must not contain application logic
- All LLM interaction must go through src/core/llm-client
- No direct dependency on Python modules from TypeScript
- External integrations must remain isolated under src/integrations
- Core logic must reside under src/core
- Translation, prompt processing, and LLM interaction are treated as core pipeline responsibilities
- Python is limited to running the LLM server and must not contain application logic
- All LLM interaction must go through src/core/llm-client
- No direct dependency on Python modules from TypeScript
- External integrations must remain isolated under src/integrations
