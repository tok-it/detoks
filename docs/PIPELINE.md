# Pipeline

detoks는 사용자 입력을 구조화된 산출물로 바꾸고, 그 산출물을 다시 실행 가능한 작업과 상태로 연결하는 **stage-based pipeline**입니다.

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

## Important Rules

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

`SessionState`는 전체 로그 복제본이 아니라, 다음 턴에서 재사용할 최소 상태를 보관합니다.

## Recommended Reading

- 구조를 먼저 보려면: [ARCHITECTURE.md](ARCHITECTURE.md)
- handoff 원칙을 보려면: [SHARED_DATA_FLOW.md](SHARED_DATA_FLOW.md)
- 단계별 schema 매핑을 보려면: [SCHEMA_FLOW.md](SCHEMA_FLOW.md)
- 전체 schema 정의를 보려면: [SCHEMAS.md](SCHEMAS.md)
