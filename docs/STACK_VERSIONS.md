# Stack Versions

This file defines the runtime and tooling baseline for detoks.

## Version Matrix

| Area | Tool / Library | Version | Why this version |
| --- | --- | --- | --- |
| Runtime | Node.js | `24.15.0` | Current LTS line and the production baseline for the CLI/runtime layer. |
| Language | TypeScript | `5.8.3` | Stable baseline for strict mode, NodeNext modules, and the current Node runtime. |
| TS execution | tsx | `4.20.5` | Lightweight TypeScript runner for local execution without a separate build step. |
| Validation | zod | `4.3.6` | Runtime schema validation with full `z.record()` and `z.nullable()` support for complex schemas. |
| Testing | vitest | `3.2.4` | Fast unit and integration testing for the TypeScript layers. |
| Node types | `@types/node` | `24.3.1` | Matches the Node 24 runtime family used by this project. |
| Local LLM runtime | `node-llama-cpp` | `3.18.1` | Loads GGUF models in-process behind the TypeScript LLM client boundary. |

## Runtime Boundary Rules

- detoks application code runs on Node.js and TypeScript.
- Local model inference uses the in-process `node-llama-cpp` runtime.
- Roles 1, 2.1, 2.2, and 3 use TypeScript under `src`.
- Translation, prompt processing, guardrails, and LLM client access live under `src/core`.
- The TypeScript application must talk to llama.cpp through `src/core/llm-client`.

## Standard Library Usage

Node standard library modules such as `child_process`, `fs`, and `readline/promises` are used where they are sufficient. Additional packages must be pinned in `package.json`.

## Deliberate Non-Choice

No external prompt UI package is pinned yet.

Reason:

- the current project docs mention `readline / prompts` for REPL work,
- the initial scaffold can safely start with the Node standard library,
- this reduces dependency surface and avoids locking into an old prompt package too early.

If the REPL later needs richer interactive flows, choose and pin that package in a dedicated follow-up change.

## Files That Enforce This Baseline

- `.nvmrc`
- `package.json`
- `tsconfig.json`
