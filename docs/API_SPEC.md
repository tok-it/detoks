# 🔌 API Specification

## Overview

This document defines the **internal API contracts** for detoks.

At the current stage, detoks does **not** expose a public HTTP API.  
Instead, its primary APIs are the contracts between:

- CLI layer
- TypeScript core pipeline
- llama.cpp inference client
- llama.cpp inference client
- CLI adapter integrations
- state persistence layer

<!-- 한국어 설명: 이 문서는 detoks의 현재 내부 API 계약을 정의합니다. 아직 외부 공개용 HTTP API는 없고, CLI·코어 파이프라인·llama.cpp 클라이언트·어댑터·상태 저장 계층 간의 인터페이스를 명세하는 문서입니다. -->
<!-- 한국어 설명: 이 문서는 detoks의 현재 내부 API 계약을 정의합니다. 아직 외부 공개용 HTTP API는 없고, CLI·코어 파이프라인·llama.cpp 클라이언트·어댑터·상태 저장 계층 간의 인터페이스를 명세하는 문서입니다. -->

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
2. core prompt, translation, guardrails, request analysis, and LLM client contracts
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

### RequestCategory

```ts
type RequestCategory = "explore" | "create" | "modify" | "analyze" | "validate" | "execute" | "document" | "plan";
```

Semantic meaning is defined in `docs/TYPE_DEFINITION.md`.

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

<!-- 한국어 설명: RequestCategory, Task, TaskGraph, SessionState는 docs/SCHEMAS.md에 정의된 핵심 구조이며, 이후 API 계약의 기본 타입으로 사용됩니다. RequestCategory의 의미 기준은 docs/TYPE_DEFINITION.md를 따릅니다. -->

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

The Prompt Compiler compresses Korean user input into concise English prompts while preserving intent. It is implemented as TypeScript core logic under `src/core/prompt` and `src/core/translate`.
The Prompt Compiler compresses Korean user input into concise English prompts while preserving intent. It is implemented as TypeScript core logic under `src/core/prompt` and `src/core/translate`.

### Request

```ts
type PromptCompileRequest = {
  raw_input: string;
  shared_context?: Record<string, unknown>;
  compression_provider?: PromptCompressionProvider;
  max_translation_attempts?: number;
};
```

### Provider Types

```ts
type PromptCompressionProvider = "nlp_adapter" | "llm" | "small_model";
```

`nlp_adapter` is the only supported v1 provider. `llm` and `small_model` are reserved extension values and must return an unsupported-provider error if selected in v1.

### Response

```ts
type PromptCompileResponse = {
  raw_input: string;
  normalized_input: string;
  raw_input: string;
  normalized_input: string;
  compressed_prompt: string;
  language: "ko" | "en" | "mixed";
  compression_provider: "nlp_adapter";
  validation_errors?: string[];
  repair_actions?: string[];
};
```

### Contract

- input text may be Korean, English, or mixed
- output must remain semantically aligned with the original request
- output must be shorter and cleaner than the source input when possible
- `max_translation_attempts` defaults to `5` and counts the primary request plus fallback requests
- Role 2.1 handoff uses `Role2PromptInput { compiled_prompt: string }`
- task decomposition, `id`, and `depends_on` generation are not part of this API

<!-- 한국어 설명: Prompt Compiler는 한국어 중심 입력을 더 짧고 명확한 영어 프롬프트로 바꾸되, 원래 의도와 제약 조건을 유지해야 합니다. -->

### Prompt Compression Strategy

v1 prompt compression is based on code-unit preservation and an external NLP adapter. It does not use LLM-based prompt engineering or a small language model for compression.

Flow:

1. mask protected segments
2. translate Korean input to English
3. preserve code, paths, commands, JSON keys, API names, model names, and Markdown units
4. analyze translated English text through the NLP adapter
5. remove duplicate sentences, verbose background, and low-information phrases
6. produce `compressed_prompt`
7. validate the compressed output through guardrails

NLP adapter minimum capabilities:

- sentence splitting
- tokenization
- keyword or noun phrase extraction
- sentence importance scoring
- redundancy detection

Compression rules:

- code blocks, inline code, shell commands, paths, URLs, JSON keys, API names, and model names must not be compressed
- Markdown headings, bullets, and numbered lists should be preserved as much as possible
- filenames, paths, commands, options, numeric constraints, error messages, forbidden conditions, completion criteria, and test requirements must be preserved
- if NLP compression fails guardrails validation, the pipeline must fall back to the translated text or a more conservative rule-compressed result
- `llm` and `small_model` providers are extension points only and must not be used by v1 compression

<!-- 한국어 설명: v1 압축은 번역 후 영어 텍스트를 대상으로 하며, 코드 단위 보호와 NLP adapter 기반 분석만 사용합니다. LLM 및 소형 모델 압축은 추후 확장 지점으로만 남깁니다. -->

---

## 3. Translation Guardrails API

Translation Guardrails validate and repair translated prompt output without changing semantic meaning.

### Request

```ts
type TranslationGuardrailsRequest = {
  source_text: string;
  compressed_prompt: string;
  placeholders?: string[];
  protected_terms?: string[];
  required_terms?: string[];
};
```

### Response

```ts
type TranslationGuardrailsResponse = {
  output: string;
  validation_errors: string[];
  repair_actions: string[];
};
```

### Notes

- validation lives under `src/core/guardrails`
- repair must be structural only and must not modify semantic meaning
- failed translation spans may be retried through the current LLM model via `src/core/llm-client`
- Korean source text copied unchanged into translated output is a validation failure and a fallback trigger
- compression validation must provide `source_text` and compare source and compressed output for protected terms, placeholders, numeric constraints, filenames, commands, and completion criteria
- compression validation must not invoke `llm` or `small_model` providers in v1

<!-- 한국어 설명: Translation Guardrails는 번역 결과의 구조와 보호 구간을 검증하고, 의미를 바꾸지 않는 범위에서만 보정합니다. -->

---

## 4. Request Analyzer API

The Request Analyzer classifies the compiled request and extracts candidate executable tasks. It is a Role 2.1 responsibility, not a Role 1 responsibility.

### Handoff Schema

```ts
type Role2PromptInput = {
  compiled_prompt: string;
};
```

`compiled_prompt` must be copied from `CompiledPrompt.compressed_prompt`.

### Request

```ts
type RequestAnalyzeRequest = Role2PromptInput & {
  session_state?: SessionState;
};
```

### Response

```ts
type RequestAnalyzeResponse = {
  category: RequestCategory;
  keywords: string[];
  tasks: Task[];
};
```

### Notes

- category is a routing and orchestration label
- keywords are used for context selection and later retrieval
- tasks must be decomposed into executable units
- Role 2.1 receives `Role2PromptInput`
- task classification, task type assignment, task ID generation, and `depends_on` generation are outside Role 1

<!-- 한국어 설명: Request Analyzer는 요청을 분류하고, 키워드와 작업 목록을 추출해 이후 파이프라인 단계가 실행 가능한 형태로 바꿉니다. 이 책임은 Role 2.1에 속하며 Role 1은 수행하지 않습니다. -->

---

## 5. Task Graph Builder API

The Task Graph Builder converts analyzed tasks into a dependency-aware graph.

### Request

```ts
type TaskGraphBuildRequest = {
  compiled_prompt: string;
  compiled_sentences: string[];
  session_state?: SessionState;
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
- request classification and task extraction happen in this stage
- request classification and task extraction happen in this stage

<!-- 한국어 설명: Task Graph Builder는 작업 간 선후관계를 명확히 정의해 실제 실행 순서를 만들 수 있는 그래프로 변환해야 합니다. -->

---

## 6. Context Optimizer API

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

## 7. LLM Client API

All LLM interaction must go through `src/core/llm-client`.

### Boundary Rule

Core modules must not call llama.cpp or Python server implementation details directly.
They must invoke model inference through `src/core/llm-client`.
Core modules must not call llama.cpp or Python server implementation details directly.
They must invoke model inference through `src/core/llm-client`.

<!-- 한국어 설명: TypeScript core 모듈은 Python 서버 내부 구현을 직접 참조하지 않고, 정해진 llm-client 계층을 통해서만 모델 추론을 호출해야 합니다. -->
<!-- 한국어 설명: TypeScript core 모듈은 Python 서버 내부 구현을 직접 참조하지 않고, 정해진 llm-client 계층을 통해서만 모델 추론을 호출해야 합니다. -->

### LLM Completion Request
### LLM Completion Request

```ts
type LlmCompletionRequest = {
  messages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[];
  temperature?: number;
  timeout_ms?: number;
type LlmCompletionRequest = {
  messages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[];
  temperature?: number;
  timeout_ms?: number;
};
```

### LLM Completion Response
### LLM Completion Response

```ts
type LlmCompletionResponse = {
  content: string;
  raw_response?: Record<string, unknown>;
  inference_time_sec?: number;
type LlmCompletionResponse = {
  content: string;
  raw_response?: Record<string, unknown>;
  inference_time_sec?: number;
};
```

### Transport Expectation

- OpenAI-compatible JSON request/response shape
- explicit timeout handling
- no direct dependency on Python modules from TypeScript
- OpenAI-compatible JSON request/response shape
- explicit timeout handling
- no direct dependency on Python modules from TypeScript

<!-- 한국어 설명: LLM client는 OpenAI-compatible JSON 요청/응답 형태를 사용하고, timeout과 오류를 명시적으로 처리해야 합니다. -->
<!-- 한국어 설명: LLM client는 OpenAI-compatible JSON 요청/응답 형태를 사용하고, timeout과 오류를 명시적으로 처리해야 합니다. -->

---

## 8. Executor API

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

## 9. Output Processor API

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

## 10. State Manager API

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

## 11. Adapter API

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

## 12. Error Codes

Recommended internal error codes:

- `INVALID_INPUT`
- `VALIDATION_FAILED`
- `LLM_CLIENT_FAILED`
- `LLM_CLIENT_FAILED`
- `ADAPTER_EXECUTION_FAILED`
- `TIMEOUT`
- `STATE_LOAD_FAILED`
- `STATE_SAVE_FAILED`
- `UNSUPPORTED_TARGET`

<!-- 한국어 설명: 내부 오류는 가능한 한 고정된 코드 집합으로 관리해 디버깅과 후속 처리 로직을 단순화합니다. -->

---

## 13. Non-Goals

The following are explicitly outside the scope of the current API surface:

- public SaaS API exposure
- authentication / authorization API
- billing API
- remote multi-tenant session service

<!-- 한국어 설명: 현재 detoks는 로컬/내부 실행 중심 구조이므로 공개 SaaS용 인증, 과금, 멀티테넌트 API는 아직 범위 밖입니다. -->

---

## 14. Future Extensions

Potential future API additions:

- REST or local HTTP control API
- WebSocket streaming output API
- checkpoint retrieval API
- document retrieval / RAG support API
- agent coordination API

<!-- 한국어 설명: 향후에는 로컬 HTTP API, 스트리밍 출력, 체크포인트 조회, RAG 지원, 멀티 에이전트 협업 API 등으로 확장될 수 있습니다. -->
