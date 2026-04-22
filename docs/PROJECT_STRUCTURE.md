# 📁 Project Structure

This scaffold separates **Role 1 (Python)** from the rest of the system, which is implemented in **TypeScript**.

## Tree

```text
detoks/
├── docs/
├── scripts/
├── python/
│   └── role1/
│       ├── prompt_compiler/
│       ├── request_analyzer/
│       └── schemas/
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
│   │   └── task-graph/
│   ├── integrations/
│   │   ├── adapters/
│   │   │   ├── codex/
│   │   │   └── gemini/
│   │   ├── role1-python/
│   │   └── subprocess/
│   ├── schemas/
│   ├── types/
│   └── utils/
└── tests/
    ├── python/
    │   ├── integration/
    │   └── unit/
    └── ts/
        ├── integration/
        └── unit/
```

## Ownership

- `python/role1/*`: Role 1 (AI Prompt Engineer) Python implementation
- `src/*`: TypeScript implementation for Roles 2.1, 2.2, and 3
- `src/integrations/role1-python`: TS ↔ Python boundary layer
- `tests/python/*`: Python tests for Role 1 modules
- `tests/ts/*`: TypeScript tests for the rest of the system

## Mapping

- `python/role1/prompt_compiler`: Korean-to-English prompt compression
- `python/role1/request_analyzer`: request classification and task extraction
- `python/role1/schemas`: Python-side schemas and validation helpers for Role 1
- `src/cli`: CLI layer, REPL, and user-facing commands
- `src/core/pipeline`: pipeline orchestration
- `src/core/task-graph`: task graph generation and dependency ordering
- `src/core/context`: context compression and optimization
- `src/core/output`: output summarization and result structuring
- `src/core/state`: session state management
- `src/core/executor`: execution flow coordination
- `src/integrations/adapters/*`: target CLI integrations such as Codex and Gemini
- `src/integrations/role1-python`: invocation and I/O contracts for Python Role 1 modules
- `src/integrations/subprocess`: process spawning and I/O bridging
- `src/schemas`: TypeScript-side runtime schemas and validation definitions
- `src/types`: shared TypeScript types
- `src/utils`: shared TypeScript utilities
- `scripts`: developer automation scripts

## Design Rule

Role 1 logic must stay in `python/role1`, and the rest of the product must consume it through explicit integration boundaries rather than importing Python implementation details into TypeScript modules directly.
