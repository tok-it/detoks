# 🔌 API Specification

## Overview

This document defines the **internal API contracts** for detoks.

At the current stage, detoks does **not** expose a public HTTP API.  
Instead, its primary APIs are the contracts between:

- CLI layer
- TypeScript core pipeline
- Python Role 1 modules
- CLI adapter integrations
- state persistence layer

<!-- 한국어 설명: 이 문서는 detoks의 현재 내부 API 계약을 정의합니다. 아직 외부 공개용 HTTP API는 없고, CLI·코어 파이프라인·Python Role 1·어댑터·상태 저장 계층 간의 인터페이스를 명세하는 문서입니다. -->

---

## API Style

- Contract-first
- JSON-serializable payloads
- Explicit validation at boundaries
- Clear separation between model work and orchestration work

<!-- 한국어 설명: detoks의 API는 계약 우선 방식으로 정의되며, 경계에서는 JSON 직렬화 가능 데이터와 명시적 검증을 사용하고, 모델 로직과 코드 오케스트레이션을 분리하는 것을 원칙으로 합니다. -->

---

## Scope

This specification covers:

1. CLI input and output contracts
2. Role 1 Python integration contracts
3. pipeline stage input/output contracts
4. adapter execution contracts
5. state persistence contracts

This specification does **not** yet define:

- public REST endpoints
- WebSocket APIs
- external SDK bindings

<!-- 한국어 설명: 현재 문서는 내부 실행 흐름에 필요한 API만 다루며, REST나 WebSocket 같은 외부 공개 인터페이스는 아직 포함하지 않습니다. -->

---

## Canonical Data Types

### Task

```ts
type Task = {
  id: string;
  type: string;
  depends_on: string[];
};
```

### TaskGraph

```ts
type TaskGraph = {
  tasks: Task[];
};
```

### SessionState

```ts
type SessionState = {
  shared_context: Record<string, unknown>;
  task_results: Record<string, unknown>;
};
```

<!-- 한국어 설명: Task, TaskGraph, SessionState는 docs/SCHEMAS.md에 정의된 핵심 구조이며, 이후 API 계약의 기본 타입으로 사용됩니다. -->

---

## Common Request / Response Envelopes

### Success Envelope

```ts
type ApiSuccess<T> = {
  ok: true;
  data: T;
};
```

### Error Envelope

```ts
type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
```

### Union

```ts
type ApiResult<T> = ApiSuccess<T> | ApiError;
```

<!-- 한국어 설명: 내부 API는 성공/실패 응답 형태를 통일해 후속 단계에서 일관되게 처리할 수 있도록 합니다. -->

---

## 1. CLI Layer API

The CLI layer must behave as an **orchestrator**, not as a business-logic holder.

### Input Contract

```ts
type CliInput = {
  raw: string;
  session_id?: string;
  cwd?: string;
  timestamp?: string;
};
```

### Output Contract

```ts
type CliOutput = {
  summary: string;
  content?: string;
  structured?: Record<string, unknown>;
  next_action?: string;
};
```

### Routing Rules

- `/...` -> internal command route
- `!...` -> shell execution route
- default text -> LLM pipeline route

<!-- 한국어 설명: CLI는 사용자의 입력을 세 가지 경로(내부 명령, 셸 실행, 일반 LLM 처리)로 분기하며, 자체적으로 비즈니스 로직을 많이 가지지 않습니다. -->

---

## 2. Prompt Compiler API

The Prompt Compiler compresses Korean user input into concise English prompts while preserving intent.

### Request

```ts
type PromptCompileRequest = {
  raw_input: string;
  shared_context?: Record<string, unknown>;
};
```

### Response

```ts
type PromptCompileResponse = {
  compressed_prompt: string;
  language: "ko" | "en" | "mixed";
  preserved_constraints?: string[];
};
```

### Contract

- input text may be Korean, English, or mixed
- output must remain semantically aligned with the original request
- output must be shorter and cleaner than the source input when possible

<!-- 한국어 설명: Prompt Compiler는 한국어 중심 입력을 더 짧고 명확한 영어 프롬프트로 바꾸되, 원래 의도와 제약 조건을 유지해야 합니다. -->

---

## 3. Request Analyzer API

The Request Analyzer classifies the request and extracts executable tasks.

### Request

```ts
type RequestAnalyzeRequest = {
  compressed_prompt: string;
  session_state?: SessionState;
};
```

### Response

```ts
type RequestAnalyzeResponse = {
  category: string;
  keywords: string[];
  tasks: Task[];
};
```

### Notes

- category is a routing and orchestration label
- semantic meaning of the eight task categories is defined in `docs/TYPE_DEFINITION.md`
- keywords are used for context selection and later retrieval
- tasks must be decomposed into executable units

<!-- 한국어 설명: Request Analyzer는 요청을 분류하고, 키워드와 작업 목록을 추출해 이후 파이프라인 단계가 실행 가능한 형태로 바꾸는 역할을 합니다. -->

---

## 4. Task Graph Builder API

The Task Graph Builder converts extracted tasks into a dependency-aware graph.

### Request

```ts
type TaskGraphBuildRequest = {
  tasks: Task[];
};
```

### Response

```ts
type TaskGraphBuildResponse = {
  graph: TaskGraph;
};
```

### Rules

- each task must have a unique `id`
- `depends_on` must always exist
- graph must be topologically executable

<!-- 한국어 설명: Task Graph Builder는 작업 간 선후관계를 명확히 정의해 실제 실행 순서를 만들 수 있는 그래프로 변환해야 합니다. -->

---

## 5. Context Optimizer API

The Context Optimizer selects only the context needed for the current execution step.

### Request

```ts
type ContextOptimizeRequest = {
  category: string;
  keywords: string[];
  graph: TaskGraph;
  session_state?: SessionState;
  available_context?: Record<string, unknown>;
};
```

### Response

```ts
type ContextOptimizeResponse = {
  optimized_context: Record<string, unknown>;
  removed_keys?: string[];
  summary?: string;
};
```

### Rules

- avoid duplicate context
- keep only execution-relevant information
- preserve critical decisions and active state

<!-- 한국어 설명: Context Optimizer는 현재 요청에 필요한 정보만 남기고 중복과 불필요한 문맥은 제거해야 합니다. -->

---

## 6. Role 1 Python Integration API

Role 1 Python modules are consumed through an explicit integration boundary.

### Boundary Rule

TypeScript must not import Python implementation details directly.  
It must invoke Role 1 functionality through `src/integrations/role1-python`.

<!-- 한국어 설명: TypeScript는 Python 내부 구현을 직접 참조하지 않고, 정해진 integration 계층을 통해서만 Role 1 기능을 호출해야 합니다. -->

### Python Invocation Request

```ts
type Role1InvocationRequest = {
  action: "prompt_compile" | "request_analyze";
  payload: Record<string, unknown>;
};
```

### Python Invocation Response

```ts
type Role1InvocationResponse = {
  action: string;
  result: Record<string, unknown>;
};
```

### Transport Expectation

- JSON in
- JSON out
- explicit exit code handling
- separate stdout / stderr handling

<!-- 한국어 설명: Role 1 통합은 JSON 입력/출력과 명확한 exit code, stdout/stderr 분리 처리를 기본으로 해야 합니다. -->

---

## 7. Executor API

The Executor triggers the target LLM CLI or a system adapter.

### Request

```ts
type ExecuteRequest = {
  prompt: string;
  context?: Record<string, unknown>;
  target: "codex" | "gemini";
  cwd?: string;
  timeout_ms?: number;
};
```

### Response

```ts
type ExecuteResponse = {
  raw_output: string;
  exit_code: number;
  stderr?: string;
};
```

### Rules

- subprocesses must be timeout-aware
- stdout and stderr must be separable
- non-zero exit codes must be handled explicitly

<!-- 한국어 설명: Executor는 외부 CLI 실행을 담당하며, timeout·stderr 분리·종료 코드 검사를 반드시 수행해야 합니다. -->

---

## 8. Output Processor API

The Output Processor converts raw execution output into a compact reusable result.

### Request

```ts
type OutputProcessRequest = {
  raw_output: string;
  category?: string;
};
```

### Response

```ts
type OutputProcessResponse = {
  summary: string;
  structured?: Record<string, unknown>;
  next_action?: string;
};
```

### Rules

- preserve key results
- remove redundant explanation
- emit data that can be reused in the next turn

<!-- 한국어 설명: Output Processor는 긴 출력에서 핵심 결과만 남기고, 다음 턴에서 재사용 가능한 형태로 압축해야 합니다. -->

---

## 9. State Manager API

The State Manager persists reusable session state between turns.

### Save Request

```ts
type StateSaveRequest = {
  session_id: string;
  state: SessionState;
};
```

### Load Request

```ts
type StateLoadRequest = {
  session_id: string;
};
```

### Load Response

```ts
type StateLoadResponse = {
  session_id: string;
  state: SessionState | null;
};
```

### Rules

- state must be JSON-serializable
- state updates must be explicit
- persistence format must remain deterministic

<!-- 한국어 설명: State Manager는 세션 상태를 일관된 방식으로 저장·복원해야 하며, 상태 데이터는 항상 JSON 직렬화 가능해야 합니다. -->

---

## 10. Adapter API

Adapters abstract differences between target CLIs.

### Adapter Interface

```ts
type CliAdapter = {
  name: "codex" | "gemini";
  buildCommand(input: ExecuteRequest): {
    command: string;
    args: string[];
  };
  parseResult(result: ExecuteResponse): OutputProcessResponse;
};
```

### Required Behaviors

- convert a normalized request into target-specific command execution
- normalize target-specific output back into a common response shape

<!-- 한국어 설명: 어댑터는 Codex와 Gemini처럼 서로 다른 CLI를 동일한 실행 계약으로 감싸는 역할을 합니다. -->

---

## 11. Error Codes

Recommended internal error codes:

- `INVALID_INPUT`
- `VALIDATION_FAILED`
- `ROLE1_EXECUTION_FAILED`
- `ADAPTER_EXECUTION_FAILED`
- `TIMEOUT`
- `STATE_LOAD_FAILED`
- `STATE_SAVE_FAILED`
- `UNSUPPORTED_TARGET`

<!-- 한국어 설명: 내부 오류는 가능한 한 고정된 코드 집합으로 관리해 디버깅과 후속 처리 로직을 단순화합니다. -->

---

## 12. Non-Goals

The following are explicitly outside the scope of the current API surface:

- public SaaS API exposure
- authentication / authorization API
- billing API
- remote multi-tenant session service

<!-- 한국어 설명: 현재 detoks는 로컬/내부 실행 중심 구조이므로 공개 SaaS용 인증, 과금, 멀티테넌트 API는 아직 범위 밖입니다. -->

---

## 13. Future Extensions

Potential future API additions:

- REST or local HTTP control API
- WebSocket streaming output API
- checkpoint retrieval API
- document retrieval / RAG support API
- agent coordination API

<!-- 한국어 설명: 향후에는 로컬 HTTP API, 스트리밍 출력, 체크포인트 조회, RAG 지원, 멀티 에이전트 협업 API 등으로 확장될 수 있습니다. -->
