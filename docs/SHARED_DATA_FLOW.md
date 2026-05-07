# Shared Data Flow

이 문서는 역할 간 handoff에서 지켜야 할 **공유 원칙**만 짧게 정리합니다.

> 전체 schema 정의는 [SCHEMAS.md](SCHEMAS.md), 단계별 매핑은 [SCHEMA_FLOW.md](SCHEMA_FLOW.md)가 기준입니다.

## Shared Artifact Chain

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

## Handoff Principles

### 1. 역할 간에는 문자열이 아니라 검증 가능한 산출물을 넘긴다

- 각 단계는 가능한 한 schema-valid artifact를 출력해야 합니다.
- 다음 단계는 자유 텍스트 해석보다 명시적 필드에 의존해야 합니다.

### 2. `Role2PromptInput`은 `normalized_input` 기준이다

- `CompiledPrompt`는 `normalized_input`과 `compressed_prompt`를 함께 가질 수 있습니다.
- 그러나 Role 2.1 분류는 action signal 보존이 더 중요하므로 `Role2PromptInput.compiled_prompt`는 `CompiledPrompt.normalized_input`을 사용합니다.

### 3. 스키마의 semantic meaning은 문서 하나에만 고정한다

- `RequestCategory` 의미 기준: [TYPE_DEFINITION.md](TYPE_DEFINITION.md)
- 전체 schema 정의: [SCHEMAS.md](SCHEMAS.md)

### 4. 상태는 누적 복사본이 아니라 재사용 가능한 요약본이다

- `SessionState`는 전체 transcript 저장소가 아닙니다.
- 다음 실행에서 필요한 결과, 현재 작업 포인터, 후속 액션 중심으로 유지합니다.

## Producer / Consumer Map

| 산출물 | 생산자 | 소비자 | 목적 |
| --- | --- | --- | --- |
| `CompiledPrompt` | Role 1 | Role 1 내부, 디버깅, batch artifact | 번역/압축 결과 보존 |
| `Role2PromptInput` | Role 1 | Role 2.1 | 분류와 작업화 시작점 |
| `AnalyzedRequest` | Role 2.1 | Role 2.1 내부 / 이후 단계 | 요청 의미 구조화 |
| `TaskGraph` | Role 2.1 | Role 2.2, Role 3 | 실행 순서와 의존성 제공 |
| `ExecutionContext` | Role 2.2 | Role 3 | 현재 실행에 필요한 문맥만 전달 |
| `ExecutionResult` | Role 3 | Role 2.2 | 실행 결과 정규화 |
| `SessionState` | Role 2.2 | 다음 턴 전체 | 재시작 가능한 상태 유지 |

## When To Open Another Doc

- 구조를 보고 싶을 때: [PIPELINE.md](PIPELINE.md)
- 필드 목록이 필요할 때: [SCHEMAS.md](SCHEMAS.md)
- 단계별 책임과 흐름을 보고 싶을 때: [DES_DATA_FLOW.md](DES_DATA_FLOW.md)
