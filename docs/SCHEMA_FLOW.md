# Schema Flow

이 문서는 "어느 단계에서 어떤 schema를 만들고 넘기는가"를 빠르게 확인하기 위한 매핑 문서입니다.

> 전체 타입 정의는 [SCHEMAS.md](SCHEMAS.md)를 기준으로 합니다.

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

## Artifact Highlights

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

## Ownership Summary

| 산출물 | 역할 |
| --- | --- |
| `CompiledPrompt`, `Role2PromptInput` | Role 1 |
| `AnalyzedRequest`, `TaskGraph` | Role 2.1 |
| `ExecutionContext`, `SessionState` | Role 2.2 |
| `ExecutionResult` | Role 3 |

## Related Docs

- 구조 설명: [PIPELINE.md](PIPELINE.md)
- handoff 원칙: [SHARED_DATA_FLOW.md](SHARED_DATA_FLOW.md)
- 설명형 walkthrough: [DES_DATA_FLOW.md](DES_DATA_FLOW.md)
- 전체 schema 정의: [SCHEMAS.md](SCHEMAS.md)
