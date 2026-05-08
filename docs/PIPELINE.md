# Pipeline

detoks의 실행 흐름, 역할 간 handoff, 단계별 schema 매핑, CLI orchestration 경계를 한곳에서 보려면 이 문서를 기준으로 보면 됩니다.

> 필드 단위 schema 전문은 [SCHEMAS.md](SCHEMAS.md), 타입 의미 기준은 [TYPE_DEFINITION.md](TYPE_DEFINITION.md)를 기준으로 합니다.

## Canonical Flow

```text
User Input
→ Prompt Compiler
→ Request Analyzer
→ Task Graph Builder
→ Context Optimizer
→ Executor
→ Output Processor
→ State Manager
→ User Output
```

## Stage Summary

| 단계 | 주요 책임 | 대표 산출물 | 소유 역할 |
| --- | --- | --- | --- |
| Prompt Compiler | 정규화, 번역, guardrails, Kompress 압축 | `CompiledPrompt`, `Role2PromptInput` | Role 1 |
| Request Analyzer | 요청 분류, 키워드 추출, 작업 후보 생성 | `AnalyzedRequest` | Role 2.1 |
| Task Graph Builder | 작업 분해, 의존성 구성 | `TaskGraph` | Role 2.1 |
| Context Optimizer | 현재 실행에 필요한 문맥 선택 | `ExecutionContext` | Role 2.2 |
| Executor | 대상 CLI / adapter 실행 | `ExecutionResult.raw_output` | Role 3 |
| Output Processor | 결과 요약과 후속 액션 정리 | `ExecutionResult.summary`, `next_action` | Role 2.2 / Role 3 경계 |
| State Manager | 다음 턴용 상태 저장 | `SessionState` | Role 2.2 |

## Core Contracts

### 1. Role 1은 두 종류의 출력을 만든다

- `normalized_input`: 번역/정규화 결과
- `compressed_prompt`: Kompress 적용 결과

둘 다 `CompiledPrompt` 안에 들어가지만, **Role 2.1 handoff는 `normalized_input` 기준**입니다.

### 2. Kompress는 Role 1 단계에서 수행한다

- 압축은 Context Optimizer 단계가 아니라 Prompt Compiler 단계에서 수행됩니다.
- 다만 압축 결과가 안전하지 않으면 `normalized_input`을 그대로 `compressed_prompt`로 사용합니다.

### 3. Role 1은 task graph를 만들지 않는다

Role 1의 책임은 아래까지입니다.

- 입력 보존
- 번역/정규화
- guardrails / repair / fallback
- Kompress 압축
- `Role2PromptInput` 생성

아래 책임은 Role 2.1로 넘어갑니다.

- task classification
- task decomposition
- `depends_on` 생성
- 실행 순서 결정

### 4. 상태는 실행 뒤에만 누적한다

`SessionState`는 전체 transcript 복제본이 아니라, 다음 턴에서 재사용할 최소 상태를 보관합니다.

## Handoff Principles

### 1. 역할 간에는 자유 텍스트보다 검증 가능한 산출물을 넘긴다

- 각 단계는 가능한 한 schema-valid artifact를 출력해야 합니다.
- 다음 단계는 긴 자연어 해석보다 명시적 필드에 의존해야 합니다.

### 2. `Role2PromptInput`은 `normalized_input` 기준이다

- `CompiledPrompt`는 `normalized_input`과 `compressed_prompt`를 함께 가질 수 있습니다.
- 그러나 Role 2.1 분류는 action signal 보존이 더 중요하므로 `Role2PromptInput.compiled_prompt`는 `CompiledPrompt.normalized_input`을 사용합니다.

### 3. semantic meaning은 문서 하나에만 고정한다

- `RequestCategory` 의미 기준: [TYPE_DEFINITION.md](TYPE_DEFINITION.md)
- 필드 정의 기준: [SCHEMAS.md](SCHEMAS.md)

### 4. `SessionState`는 재사용 가능한 요약본이다

- 전체 실행 로그를 그대로 저장하는 구조가 아닙니다.
- 다음 실행에 필요한 결과, 현재 작업 포인터, 후속 액션 중심으로 유지합니다.

## Stage To Schema Map

| 순서 | 단계 | 입력 | 출력 | 핵심 제약 |
| --- | --- | --- | --- | --- |
| 1 | Prompt Compiler | `UserRequest` | `CompiledPrompt` | 번역/정규화 + Kompress 결과를 함께 보관 |
| 2 | Role 1 handoff | `CompiledPrompt` | `Role2PromptInput` | `compiled_prompt === normalized_input` |
| 3 | Request Analyzer | `Role2PromptInput` | `AnalyzedRequest` | `RequestCategory` 의미는 `TYPE_DEFINITION.md` 기준 |
| 4 | Task Graph Builder | `AnalyzedRequest` | `TaskGraph` | `depends_on`은 항상 명시 |
| 5 | Context Optimizer | `TaskGraph + SessionState` | `ExecutionContext` | 현재 실행에 필요한 문맥만 선택 |
| 6 | Executor | `ExecutionContext + prompt` | `ExecutionResult` | `raw_output`은 항상 보존 |
| 7 | State Manager | `ExecutionResult + prior state` | `SessionState` | 다음 턴 재사용 가능한 상태만 유지 |

## Key Artifacts

### `CompiledPrompt`

- Role 1의 canonical output
- 주요 필드:
  - `normalized_input`
  - `compressed_prompt`
  - `validation_errors?`
  - `repair_actions?`
  - `debug?`

### `Role2PromptInput`

- Role 2.1의 시작점
- 핵심 규칙:
  - sentence array를 handoff로 쓰지 않음
  - `compiled_prompt`는 `compressed_prompt`가 아니라 `normalized_input`

### `Task`

- `TaskGraph`의 기본 노드
- 핵심 필드:
  - `id`
  - `type`
  - `status`
  - `title`
  - `input_hash`
  - `depends_on`

### `ExecutionResult`

- 실행 계층의 정규화 결과
- 핵심 필드:
  - `raw_output`
  - `summary?`
  - `structured_output?`
  - `next_action?`

## Example Walkthrough

예시 요청:

```text
"src/core/prompt/compiler.ts를 확인하고 Role 1 handoff 계약이 현재 문서와 맞는지 정리해줘"
```

### 1. UserRequest

원문 입력은 `UserRequest.raw_input`으로 보관합니다.

### 2. CompiledPrompt

Role 1이 입력 정규화, 한국어 → 영어 변환, placeholder 보호, validation / repair / fallback, Kompress 압축을 수행한 결과입니다.

- `normalized_input`: 분류에 쓰일 번역/정규화 결과
- `compressed_prompt`: Kompress 결과

### 3. Role2PromptInput

Role 2.1 handoff는 `compressed_prompt`가 아니라 `normalized_input`을 씁니다.

```text
Role2PromptInput.compiled_prompt === CompiledPrompt.normalized_input
```

### 4. AnalyzedRequest

Role 2.1이 요청 분류, 키워드 추출, 작업 후보 생성을 수행합니다.

### 5. TaskGraph

Role 2.1이 후보 작업을 실행 가능한 순서로 정리하면서 `Task.id`, `Task.type`, `Task.depends_on`을 포함한 `TaskGraph`를 만듭니다.

### 6. ExecutionContext

Role 2.2가 전체 그래프와 이전 상태를 보고 현재 실행에 필요한 문맥만 뽑습니다.

### 7. ExecutionResult

Role 3가 실제 CLI / adapter를 실행하고 결과를 `ExecutionResult`로 정리합니다.

### 8. SessionState

Role 2.2가 결과를 다음 턴에서 이어 쓸 수 있는 최소 상태로 저장합니다.

## CLI Orchestration Notes

CLI는 아래를 담당하는 **thin orchestration layer**입니다.

- 사용자 입력 수집
- command / mode 해석
- 세션 continue / reset / fork 판단
- core pipeline 호출
- adapter 실행 연결
- 사용자에게 보여 줄 출력 형태 정리

CLI가 직접 가져가면 안 되는 책임:

- 번역 로직 재구현
- task graph 로직 재구현
- context selection 로직 재구현

### CLI가 반드시 지켜야 할 것

#### 역할 경계

- Prompt Compiler 로직은 `src/core/prompt`, `src/core/translate`, `src/core/guardrails`
- task graph 로직은 `src/core/task-graph`
- 상태 로직은 `src/core/context`, `src/core/state`

#### schema contract

특히 아래를 CLI가 임의로 바꾸면 안 됩니다.

- `Role2PromptInput.compiled_prompt`
- `Task.depends_on`
- `ExecutionResult.raw_output`
- `SessionState.current_task_id`

#### 출력 기본값

- 기본 출력은 짧고 요약 중심
- verbose는 명시적으로만 확장
- raw execution output은 필요한 경우에만 노출

## Related Docs

- 구조를 먼저 보려면: [ARCHITECTURE.md](ARCHITECTURE.md)
- 런타임 경계를 보려면: [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
- 역할 정의를 보려면: [ROLES.md](ROLES.md)
- 전체 schema 정의를 보려면: [SCHEMAS.md](SCHEMAS.md)
- 내부 API 계약을 보려면: [API_SPEC.md](API_SPEC.md)
