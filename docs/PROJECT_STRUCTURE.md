# Project Structure

This scaffold keeps the application runtime in Node.js and TypeScript. Local model inference is handled in-process through `node-llama-cpp` behind the TypeScript client boundary.

## Tree

```text
detoks/
├── docs/
├── scripts/
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

- `src/core/translate`, `src/core/prompt`, `src/core/guardrails`: TypeScript implementation for Role 1
- `src/*`: TypeScript implementation for Roles 1, 2.1, 2.2, and 3
- `src/integrations/*`: external tool integrations such as Codex, Gemini, and subprocess handling
- `tests/ts/*`: TypeScript tests for application logic, including Role 1 modules

## Mapping

- `src/cli`: CLI layer, REPL, and user-facing commands
- `src/core/pipeline`: pipeline orchestration
- `src/core/task-graph`: request analysis, task graph generation, and dependency ordering
- `src/core/context`: context compression and optimization
- `src/core/output`: output summarization and result structuring
- `src/core/state`: session state management
- `src/core/executor`: execution flow coordination
- `src/core/translate`: Korean-to-English translation pipeline
- `src/core/prompt`: prompt normalization and reusable Kompress helpers
- `src/core/guardrails`: translated output validation and repair
- `src/core/llm-client`: local `node-llama-cpp` runtime lifecycle and chat completion boundary
- `src/integrations/adapters/*`: target CLI integrations such as Codex and Gemini
- `src/integrations/subprocess`: process spawning and I/O bridging
- `src/schemas`: runtime schemas and validation definitions
- `src/types`: shared TypeScript types
- `src/utils`: shared TypeScript utilities
- `scripts`: developer automation scripts

## Design Rules

- Core logic must reside under `src/core`.
- Translation, prompt processing, and LLM interaction are core pipeline responsibilities.
- The local LLM path must use the in-process `node-llama-cpp` runtime.
- All LLM interaction must go through `src/core/llm-client`.
- External integrations must remain isolated under `src/integrations`.
