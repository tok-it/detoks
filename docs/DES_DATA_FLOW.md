# Detailed Data Flow

이 문서는 detoks의 데이터 흐름을 **설명형 walkthrough**로 풀어쓴 문서입니다.

> schema 전문은 [SCHEMAS.md](SCHEMAS.md), 단계-스키마 매핑은 [SCHEMA_FLOW.md](SCHEMA_FLOW.md)를 보세요.

## 한 줄 요약

Role 1이 입력을 번역/정규화하고 Kompress 결과를 함께 만든 뒤, Role 2.1은 `normalized_input` 기준 handoff를 받아 요청을 작업 그래프로 바꾸고, Role 2.2와 Role 3이 그 그래프를 실제 실행과 상태로 연결합니다.

## Example Walkthrough

예시 요청:

```text
"src/core/prompt/compiler.ts를 확인하고 Role 1 handoff 계약이 현재 문서와 맞는지 정리해줘"
```

### 1. UserRequest

시스템은 우선 원문 입력을 `UserRequest.raw_input`으로 보관합니다.

여기서는 아직 작업 분해를 하지 않습니다.

### 2. CompiledPrompt

Role 1이 아래 일을 수행합니다.

- 입력 정규화
- 한국어 → 영어 변환
- placeholder / protected segment 보존
- validation / repair / fallback
- Kompress 압축

이 결과가 `CompiledPrompt`입니다.

중요 포인트:

- `normalized_input`: 분류에 쓰일 번역/정규화 결과
- `compressed_prompt`: Kompress 결과

### 3. Role2PromptInput

Role 2.1에 넘길 때는 `compressed_prompt`가 아니라 `normalized_input`을 씁니다.

이유:

- task classification은 action signal 보존이 중요합니다.
- 과도한 압축은 분류 단서를 약화시킬 수 있습니다.

즉 handoff는 아래 의미를 가집니다.

```text
Role2PromptInput.compiled_prompt === CompiledPrompt.normalized_input
```

### 4. AnalyzedRequest

Role 2.1은 handoff 문자열을 받아:

- 요청 분류
- 키워드 추출
- 작업 후보 생성

을 수행합니다.

이 결과가 `AnalyzedRequest`입니다.

### 5. TaskGraph

그다음 Role 2.1은 후보 작업들을 실행 가능한 순서로 정리합니다.

여기서 생기는 것이:

- `Task.id`
- `Task.type`
- `Task.depends_on`

을 포함한 `TaskGraph`입니다.

즉 **task graph는 Role 1 결과가 아니라 Role 2.1 결과**입니다.

### 6. ExecutionContext

Role 2.2는 전체 그래프와 이전 상태를 보고, 지금 실행할 task에 필요한 문맥만 뽑아 `ExecutionContext`를 만듭니다.

핵심은:

- 전체 상태를 그대로 넘기지 않음
- 현재 task와 관련된 결과만 선택

입니다.

### 7. ExecutionResult

Role 3는 `ExecutionContext`와 실행 prompt를 받아 실제 CLI / adapter를 실행하고 결과를 `ExecutionResult`로 정리합니다.

이때 중요한 필드는:

- `raw_output`
- `summary?`
- `structured_output?`
- `next_action?`

입니다.

### 8. SessionState

마지막으로 Role 2.2가 결과를 다음 턴에서 이어 쓸 수 있는 형태로 저장합니다.

이 상태는:

- `task_results`
- `current_task_id`
- `completed_task_ids`
- `next_action`

같은 필드를 중심으로 유지됩니다.

## 자주 헷갈리는 지점

### `compressed_prompt`가 곧 handoff는 아니다

`CompiledPrompt` 안에는 압축 결과가 있지만, Role 2.1 handoff는 계속 `normalized_input`입니다.

### Role 1은 task를 만들지 않는다

Role 1은 번역/압축/검증까지만 담당합니다.

아래는 Role 2.1 책임입니다.

- 작업 분류
- 작업 분해
- 의존성 연결

### SessionState는 전체 로그 저장소가 아니다

`SessionState`는 transcript 전체를 무한정 쌓는 구조가 아니라, 다음 턴에 필요한 최소 상태를 유지하는 구조입니다.

## 문서 선택 가이드

- 필드 정의를 보고 싶을 때: [SCHEMAS.md](SCHEMAS.md)
- 단계별 매핑을 보고 싶을 때: [SCHEMA_FLOW.md](SCHEMA_FLOW.md)
- 전체 구조를 짧게 보고 싶을 때: [PIPELINE.md](PIPELINE.md)
