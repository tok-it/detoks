# Wrapper CLI Pipeline

이 문서는 detoks CLI가 파이프라인을 **어떻게 호출하고 연결해야 하는지**를 설명합니다.

> 전체 단계 설명은 [PIPELINE.md](PIPELINE.md), 역할 간 handoff는 [SHARED_DATA_FLOW.md](SHARED_DATA_FLOW.md)를 기준으로 봅니다.

## CLI의 역할

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

## End-To-End Flow

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

## Stage Boundaries

| 구간 | CLI가 하는 일 | 실제 소유 |
| --- | --- | --- |
| Input | raw text / flags 수집 | CLI |
| Session | continue / reset / fork 결정 | CLI + state layer |
| Prompt Compiler | 호출만 수행 | Role 1 |
| Request Analyzer / TaskGraph | 호출만 수행 | Role 2.1 |
| Context Optimizer | 호출만 수행 | Role 2.2 |
| Executor | adapter / subprocess 연결 | Role 3 |
| Output / State | 사용자 출력 포맷과 상태 저장 연결 | CLI + Role 2.2 |

## What The CLI Must Preserve

### 1. 역할 경계

- Prompt Compiler 로직은 `src/core/prompt`, `src/core/translate`, `src/core/guardrails`
- task graph 로직은 `src/core/task-graph`
- 상태 로직은 `src/core/context`, `src/core/state`

CLI는 이 모듈들을 호출해야지, 의미를 다시 계산하면 안 됩니다.

### 2. schema contract

CLI는 경계마다 공유 Zod schema를 신뢰해야 합니다.

특히 아래를 임의로 바꾸면 안 됩니다.

- `Role2PromptInput.compiled_prompt`
- `Task.depends_on`
- `ExecutionResult.raw_output`
- `SessionState.current_task_id`

### 3. 출력 기본값

- 기본 출력은 짧고 요약 중심
- verbose는 명시적으로만 확장
- raw execution output은 필요한 경우에만 노출

## Primary File Mapping

- `src/cli/*`
  - CLI entrypoint, REPL, TUI, command parsing
- `src/core/pipeline/*`
  - pipeline orchestration support
- `src/integrations/adapters/*`
  - 대상 CLI adapter
- `src/integrations/subprocess/*`
  - subprocess / PTY 실행 경계

## Recommended Reading

1. [PIPELINE.md](PIPELINE.md)
2. [SCHEMAS.md](SCHEMAS.md)
3. [SHARED_DATA_FLOW.md](SHARED_DATA_FLOW.md)
4. 이 문서
