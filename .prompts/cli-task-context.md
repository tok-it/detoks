# CLI Task Context

## Purpose

This file contains the repeated shared context for Role 3 CLI / System Engineer tasks in detoks.

Use this file as the default common context, and then read only the task-relevant TypeScript files by path.

<!-- 한국어 설명: 이 파일은 Role 3 CLI / System Engineer 작업에서 반복해서 들어가는 공통 문맥을 모아둔 로컬 전용 컨텍스트 파일입니다. -->

---

## Project Summary

detoks is an interactive wrapper shell in front of LLM CLIs such as Codex and Gemini.

Its goal is to:
- reduce repeated context
- optimize prompt / output flow
- structure execution as a pipeline
- improve development efficiency

<!-- 한국어 설명: detoks는 Codex, Gemini 같은 LLM CLI 앞단에서 입력/출력/상태를 정리하는 wrapper CLI 시스템입니다. -->

---

## Role Boundary

### Role 1: AI Prompt Engineer
- Prompt compiler
- Request analyzer
- Prompt/task schema design

### Role 2.1: Task Graph Engineer
- Task decomposition
- Dependency management
- Execution order definition

### Role 2.2: State & Context Engineer
- State management
- Context compression
- Result structuring

### Role 3: CLI / System Engineer
- CLI entrypoint
- REPL
- adapter invocation boundary
- subprocess execution boundary
- pipeline orchestration wiring

<!-- 한국어 설명: 이 컨텍스트 파일은 Role 3 작업을 위한 것이므로, Role 1/2의 내부 구현 책임을 침범하지 않는 것이 중요합니다. -->

---

## Architecture Rules

- Keep the CLI layer thin
- Do not move business logic into `src/cli/*`
- Put orchestration in `src/core/*`
- Put integration boundaries in `src/integrations/*`
- Keep shared contracts explicit

<!-- 한국어 설명: CLI는 입출력과 라우팅에 집중하고, 실제 실행 흐름과 통합 경계는 core / integrations 계층에 둬야 합니다. -->

---

## Pipeline Rules

The expected end-to-end flow is:

```text
CLI Input
→ Command Parsing
→ Session / Mode Resolution
→ Prompt Compiler
→ Request Analyzer
→ Task Graph Builder
→ Context Optimizer
→ Executor
→ Output Processor
→ State Manager
→ CLI Output
```

Important:
- Role 3 may orchestrate these stages
- Role 3 does not own all stage internals
- Stub boundaries are acceptable before real implementations are ready

<!-- 한국어 설명: Role 3는 전체 파이프라인을 연결할 수 있지만, 각 단계의 세부 구현까지 모두 담당하는 것은 아닙니다. -->

---

## Implementation Rules for Role 3

- Respect `docs/ROLES.md`
- Respect `docs/PROJECT_STRUCTURE.md`
- Keep changes small and reviewable
- Prefer interfaces/contracts before concrete implementations
- Preserve current behavior while moving logic behind clean boundaries
- Do not touch unrelated local files

<!-- 한국어 설명: Role 3 작업은 작은 단위로 진행하고, 먼저 계약/경계를 세운 뒤 실제 구현을 붙이는 방식이 좋습니다. -->

---

## Preferred Ownership by Directory

- `src/cli/*`
  - CLI entrypoint, REPL, commands, formatting
- `src/core/pipeline/*`
  - orchestration boundary
- `src/core/executor/*`
  - execution coordination
- `src/integrations/adapters/*`
  - target CLI adapter boundaries
- `src/integrations/subprocess/*`
  - subprocess runner boundary
- `python/llama-server/*`
  - out of Role 3 scope

<!-- 한국어 설명: 폴더 책임을 유지해야 팀원 작업이 섞이지 않고, 구조도 확장 가능하게 유지됩니다. -->

---

## Request Category Reference

Shared top-level categories:

- `explore`
- `create`
- `modify`
- `analyze`
- `validate`
- `execute`
- `document`
- `plan`

These categories are already standardized in shared schemas.

<!-- 한국어 설명: 요청 분류는 이미 공용 enum 기준으로 정리되어 있으므로, 새로운 문자열 분류를 임의로 만들지 않는 것이 좋습니다. -->

---

## Validation Rules

When making Role 3 changes:

- run `npm run typecheck`
- run only relevant tests
- preserve existing stub behavior unless intentionally changing the boundary

<!-- 한국어 설명: 전체 테스트를 무조건 돌리기보다, 현재 작업 범위와 직접 관련된 검증만 최소 단위로 돌리는 것이 좋습니다. -->

---

## Prompt Usage Pattern

Recommended prompt structure:

1. Read this file first
2. Read only the task-relevant TypeScript files by path
3. Keep scope limited to the current work unit
4. Report:
   - summary
   - files changed
   - validation
   - next steps

<!-- 한국어 설명: 앞으로는 이 파일을 공통 컨텍스트로 사용하고, 실제 구현과 관련된 ts 파일만 추가로 읽도록 하면 프롬프트 길이를 줄일 수 있습니다. -->
