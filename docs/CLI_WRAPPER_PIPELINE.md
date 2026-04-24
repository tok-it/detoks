# 🧭 Wrapper CLI Pipeline

## Overview

The detoks wrapper CLI should be implemented as a **thin orchestration layer** in front of the existing pipeline.

Its main responsibility is to accept user input, resolve execution mode, call the correct internal stages, and return structured output.

It should **not** absorb the implementation ownership of every stage.

<!-- 한국어 설명: detoks의 wrapper CLI는 전체 파이프라인을 연결하는 얇은 오케스트레이션 계층이어야 하며, 모든 단계의 실제 구현 책임을 직접 가져가면 안 됩니다. -->

---

## Recommended End-to-End Flow

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

<!-- 한국어 설명: wrapper CLI는 입력을 받은 뒤 명령 파싱, 세션 판단, 프롬프트 정제, 요청 분석, 작업 그래프 구성, 문맥 최적화, 실행, 결과 후처리, 상태 저장 순서로 연결되어야 합니다. -->

---

## Ownership Boundary

The wrapper CLI may call all stages, but each stage still has its own owner.

### Role 1: AI Prompt Engineer
- Prompt Compiler
- Request Analyzer

### Role 2.1: Task Graph Engineer
- Task Graph Builder
- Dependency ordering

### Role 2.2: State & Context Engineer
- Context Optimizer
- Output structuring support
- State Manager logic

### Role 3: CLI / System Engineer
- CLI entrypoint
- REPL
- command parsing
- adapter invocation
- subprocess execution
- pipeline orchestration
- user-facing output routing

<!-- 한국어 설명: Role 3는 전체 흐름을 연결하는 역할이지, Prompt Compiler / Request Analyzer / Task Graph / Context Optimizer의 세부 구현 소유권까지 가져가는 역할은 아닙니다. -->

---

## Step-by-Step Responsibilities

### 1. CLI Input
- receive raw text or command arguments
- support interactive REPL and one-shot mode

<!-- 한국어 설명: CLI는 대화형 REPL과 단발성 명령 실행을 모두 지원할 수 있어야 합니다. -->

### 2. Command Parsing
- detect natural language input vs direct command mode
- parse flags, adapter target, and output mode

<!-- 한국어 설명: 입력이 자연어 요청인지 명령 실행인지 먼저 구분하고, 옵션도 함께 해석해야 합니다. -->

### 3. Session / Mode Resolution
- resolve current session
- decide continue / reset / fork behavior

<!-- 한국어 설명: 세션을 이어갈지, 초기화할지, 분기할지를 명확히 판단해야 합니다. -->

### 4. Prompt Compiler
- normalize and compress intent
- preserve constraints

<!-- 한국어 설명: 이 단계의 실제 로직 소유는 Role 1이며, CLI는 이를 호출하는 진입점 역할을 합니다. -->

### 5. Request Analyzer
- classify request category
- extract keywords and candidate tasks
- use `docs/TYPE_DEFINITION.md` as the semantic source of truth for the eight top-level task types

<!-- 한국어 설명: 상위 분류(explore/create/modify/analyze/validate/execute/document/plan)는 여기서 결정됩니다. -->

### 6. Task Graph Builder
- split multi-step requests
- define execution order

<!-- 한국어 설명: 여러 단계가 필요한 요청은 작업 그래프로 변환되어야 합니다. -->

### 7. Context Optimizer
- select only relevant state and files
- remove duplicate context

<!-- 한국어 설명: wrapper CLI의 핵심 가치는 불필요한 문맥을 줄이고 필요한 문맥만 전달하는 데 있습니다. -->

### 8. Executor
- invoke target adapter
- run subprocess safely
- capture stdout / stderr / exit status

<!-- 한국어 설명: 실제 실행 계층은 adapter와 subprocess 경계 안에서 처리되어야 합니다. -->

### 9. Output Processor
- summarize long outputs
- normalize result payloads

<!-- 한국어 설명: 긴 결과를 그대로 출력하지 말고 구조화와 요약을 거쳐야 합니다. -->

### 10. State Manager
- persist reusable state
- update summaries, tasks, checkpoints

<!-- 한국어 설명: 전체 로그를 무조건 저장하기보다 다음 턴에 재사용 가능한 상태를 저장하는 것이 중요합니다. -->

---

## Key Considerations

### Keep the CLI Thin
- do not duplicate core logic inside `src/cli`
- call `src/core/*` and `src/integrations/*` through explicit boundaries

### Do Not Collapse Ownership
- Role 3 should orchestrate, not re-implement Role 1 / Role 2 responsibilities

### Preserve Stable Schema Contracts
- use shared Zod schemas between layers
- validate data at boundaries

### Design for Multi-Turn Sessions
- support continue, reset, and fork clearly

### Keep Default Output Short
- default to summarized output
- allow verbose mode explicitly

### Handle Cross-Platform Execution
- consider macOS / Windows path handling
- consider shell quoting and subprocess behavior

<!-- 한국어 설명: CLI 설계 시 가장 중요한 점은 얇은 계층 유지, 역할 소유권 분리, 스키마 계약 고정, 멀티턴 세션 대응, 기본 출력 축약, OS 차이 흡수입니다. -->

---

## Recommended Implementation Order

### Phase 1
- CLI entrypoint
- REPL shell
- one-shot command mode

### Phase 2
- pipeline invocation wiring
- structured request / response handling

### Phase 3
- adapter execution
- subprocess wrapper

### Phase 4
- session persistence
- checkpoint management

### Phase 5
- error handling
- verbose mode
- UX polishing

### Phase 6
- unit tests
- integration tests

<!-- 한국어 설명: CLI는 진입점부터 만들고, 그 다음 파이프라인 연결, 실행 계층, 상태 관리, UX, 테스트 순서로 점진적으로 확장하는 것이 좋습니다. -->

---

## File Ownership Mapping

- `src/cli/*`
  - Role 3
- `src/core/pipeline/*`
  - orchestration support for Role 2 / Role 3 boundary
- `src/core/task-graph/*`
  - Role 2.1
- `src/core/context/*`
  - Role 2.2
- `src/core/state/*`
  - Role 2.2
- `src/core/output/*`
  - Role 2.2
- `src/integrations/adapters/*`
  - Role 3
- `src/integrations/subprocess/*`
  - Role 3
- `python/role1/*`
  - Role 1

<!-- 한국어 설명: 각 폴더의 책임을 유지해야 팀원 작업 영역이 겹치지 않고, CLI 계층이 다른 역할의 구현을 흡수하는 문제를 막을 수 있습니다. -->
