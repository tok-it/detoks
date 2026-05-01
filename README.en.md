# detoks

<p align="right">
  <a href="./README.md">Language</a> | <a href="./README.ko.md">한국어</a>
</p>

detoks is an **interactive wrapper CLI** that sits in front of LLM CLIs such as `codex` and `gemini`.
Its goal is to make LLM CLI workflows more stable and reproducible by organizing input, context, state, and execution boundaries.

<p align="center">
  <img src="./content.png" alt="detoks preview" width="720" />
</p>

## At a glance

- one-shot execution and REPL mode
- task graph / context / state management
- separated adapter / subprocess boundaries
- `stub` / `real` execution modes
- session save and resume workflow

## Requirements

- Node.js `>=24.15.0 <26`
- `codex` or `gemini` CLI when using the corresponding adapter
- Python `3.13.x` when using the local `llama-server`

See [STACK_VERSIONS.md](./docs/STACK_VERSIONS.md) and [LLAMA_CPP_SERVER_SPEC.md](./docs/LLAMA_CPP_SERVER_SPEC.md) for version details.

## Install

```bash
npm install -g detoks
```

To try it without a global install:

```bash
npx detoks --help
```

## Quick start

```bash
detoks --help
detoks repl
detoks "summarize the current repo status"
```

REPL example:

```bash
detoks repl --adapter codex --execution-mode stub
```

## What detoks does

1. Organizes input into work units
2. Builds task graphs and dependencies
3. Injects only the context needed for the current step
4. Executes through adapter / subprocess boundaries
5. Saves results to session state for later reuse

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
