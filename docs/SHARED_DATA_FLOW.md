# 🔄 Shared Data Flow

## Overview

detoks should share data between roles as **structured artifacts**, not as raw prompt strings only.

The recommended flow is:

```text
UserRequest
→ CompiledPrompt
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
- produces `AnalyzedRequest`

### Role 2.1: Task Graph Engineer
- produces `TaskGraph`

### Role 2.2: State & Context Engineer
- produces `ExecutionContext`
- updates `SessionState`

### Role 3: CLI / System Engineer
- consumes `ExecutionContext`
- produces `ExecutionResult`

<!-- 한국어 설명: Role 1은 의미 해석 결과를 만들고, Role 2는 이를 실행 가능한 구조와 상태로 바꾸며, Role 3는 실제 실행 결과를 생성합니다. -->

---

## Recommended Shared Schemas

### 1. UserRequest
Raw user input entering the system.

### 2. CompiledPrompt
Compressed and normalized prompt output from the Prompt Compiler.

### 3. AnalyzedRequest
Classified request with extracted keywords and task candidates.

### 4. TaskGraph
Executable task structure with dependency order.

### 5. ExecutionContext
Filtered context required for the current execution step only.

### 6. ExecutionResult
Normalized result returned from CLI execution.

### 7. SessionState
Reusable state persisted for the next turn.

<!-- 한국어 설명: 공유 스키마는 사용자 입력, 압축 프롬프트, 분석 결과, 작업 그래프, 실행 문맥, 실행 결과, 세션 상태의 7단계로 나누는 것이 가장 적절합니다. -->

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
- `CompiledPrompt`
- `AnalyzedRequest`
- `Task`
- `TaskGraph`
- `ExecutionContext`
- `ExecutionResult`
- `SessionState`

<!-- 한국어 설명: 이 문서의 공유 데이터 흐름은 실제 코드에서 `src/schemas/pipeline.ts`로 매핑되며, 여기에 역할 간에 주고받는 공용 Zod 스키마가 정의됩니다. -->
