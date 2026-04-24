# 🔄 Shared Data Flow

## Overview

detoks should share data between roles as **validated artifacts and explicitly defined handoff fields**.

The recommended flow is:

```text
UserRequest
→ CompiledPrompt
→ Role2PromptInput
→ AnalyzedRequest
→ TaskGraph
→ ExecutionContext
→ ExecutionResult
→ SessionState
```

<!-- 한국어 설명: detoks에서는 역할 간에 단순 문자열이 아니라 구조화된 데이터 산출물을 공유해야 하며, 위 순서대로 데이터가 점진적으로 변환되어야 합니다. -->

---

## Role Ownership

### Role 1: AI Prompt Engineer


- produces `CompiledPrompt`
- produces `Role2PromptInput`

### Role 2.1: Task Graph Engineer

- produces `AnalyzedRequest`
- produces `TaskGraph`

### Role 2.2: State & Context Engineer


- produces `ExecutionContext`
- updates `SessionState`

### Role 3: CLI / System Engineer


- consumes `ExecutionContext`
- produces `ExecutionResult`

<!-- 한국어 설명: Role 1은 번역/압축 결과를 만들고, Role 2.1은 이를 요청 분석 결과와 실행 가능한 작업 구조로 바꾸며, Role 3는 실제 실행 결과를 생성합니다. -->

---

## Recommended Shared Schemas

### 1. UserRequest


Raw user input entering the system.

### 2. CompiledPrompt


Compressed and normalized prompt output from the Prompt Compiler.

### 3. Role2PromptInput

The handoff schema from Role 1 to Role 2.1.
`Role2PromptInput.compiled_prompt` must contain the same full compressed English prompt as `CompiledPrompt.compressed_prompt`.
Task decomposition, id generation, and depends_on assignment are handled by Role 2.1.

### 4. AnalyzedRequest

Request category, keywords, and candidate tasks produced by Request Analyzer.
Task category semantics are defined in `docs/TYPE_DEFINITION.md`.

### 5. TaskGraph

Executable task structure with dependency order.

### 6. ExecutionContext

Filtered context required for the current execution step only.

### 7. ExecutionResult

Normalized result returned from CLI execution.

### 8. SessionState

Reusable state persisted for the next turn.

<!-- 한국어 설명: 공유 스키마는 사용자 입력, 압축 프롬프트, Role 2 전달용 문자열, 분석 결과, 작업 그래프, 실행 문맥, 실행 결과, 세션 상태의 8단계로 나누는 것이 가장 적절합니다. -->

---

## Why This Structure

- keeps role boundaries clear
- makes failures easier to debug
- allows reuse of intermediate results
- supports state compression and deterministic orchestration

<!-- 한국어 설명: 이 구조를 쓰면 역할 경계가 명확해지고, 중간 결과를 재사용할 수 있으며, 어느 단계에서 문제가 생겼는지도 추적하기 쉬워집니다. -->

---

## Design Principle

The model interprets meaning, but the system must exchange **validated structured data** between stages.

<!-- 한국어 설명: 모델은 의미를 해석하더라도, 실제 시스템 단계 간 공유는 항상 검증 가능한 구조화 데이터로 이뤄져야 합니다. -->

---

## Code Mapping

The current TypeScript schema implementation for this document lives in:

```text
src/schemas/pipeline.ts
```

This file contains the shared Zod schemas for:

- `UserRequest`
- `RequestCategory`
- `CompiledPrompt`
- `AnalyzedRequest`
- `Task`
- `TaskGraph`
- `ExecutionContext`
- `ExecutionResult`
- `SessionState`

The semantic meaning of `RequestCategory` is defined canonically in `docs/TYPE_DEFINITION.md`.

<!-- 한국어 설명: 이 문서의 공유 데이터 흐름은 실제 코드에서 `src/schemas/pipeline.ts`로 매핑되며, 여기에 역할 간에 주고받는 공용 Zod 스키마가 정의됩니다. -->
