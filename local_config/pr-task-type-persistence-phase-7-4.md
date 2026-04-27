# PR: Orchestrator 실행 결과에 task type 저장

## 요약

이 PR은 Phase 7.4 작업으로, Role 2.1에서 생성한 `task.type`이 Orchestrator 실행 결과를 거쳐 session state의 `task_results`에 저장되도록 합니다.

Phase 7.1-7.3에서 schema와 state persistence 계층은 `type` 필드를 수용할 수 있게 준비되어 있었습니다. 이번 변경은 Orchestrator가 성공, 실패, dependency skip 경로에서 실제 `task.type`을 전달하도록 해 Task Type Persistence 흐름을 완성합니다.

```text
task.type -> ExecutionResult/TaskResult -> SessionState -> Session File
```

## 관련 이슈

- Closes #

## 변경 유형

- [x] 기능 추가
- [x] 버그 수정
- [x] 테스트
- [ ] 문서
- [ ] 리팩터링

## 변경 사항

- `src/core/pipeline/orchestrator.ts`
  - `markTaskCompleted()`에 `taskType?: RequestCategory` 파라미터를 추가했습니다.
  - `markTaskFailed()`에 `taskType?: RequestCategory` 파라미터를 추가했습니다.
  - 성공 경로에서 `markTaskCompleted(..., task.type)`을 호출합니다.
  - 실패 경로에서 `markTaskFailed(..., task.type)`을 호출합니다.
  - dependency 실패로 skip되는 경로에서도 `markTaskFailed(..., task.type)`을 호출합니다.
  - `PipelineTracer.trace()`의 `ExecutionResult` data에 `type: task.type`을 포함했습니다.

- `tests/ts/unit/core/pipeline/orchestrator.test.ts`
  - 성공한 task의 `type`이 session state에 저장되는지 검증합니다.
  - 실패한 task의 `type`이 session state에 저장되는지 검증합니다.
  - dependency 실패로 skip된 task의 `type`이 session state에 저장되는지 검증합니다.

## 수정 전

session file의 `task_results`에는 실행 성공 여부와 출력만 저장되고 타입 정보가 빠졌습니다.

```json
{
  "task_results": {
    "t1": {
      "task_id": "t1",
      "success": true,
      "summary": "...",
      "raw_output": "..."
    }
  }
}
```

## 수정 후

각 task result에 Role 2.1에서 분류한 type이 함께 저장됩니다.

```json
{
  "task_results": {
    "t1": {
      "task_id": "t1",
      "success": true,
      "summary": "...",
      "raw_output": "...",
      "type": "analyze"
    }
  }
}
```

실패 또는 skip된 task도 동일하게 `type`을 보존합니다.

## 검증

- [x] `npm run build`
- [x] `npm run test -- tests/ts/unit/core/pipeline/orchestrator.test.ts`
- [x] `npm run test`

전체 테스트 결과:

```text
Test Files  37 passed | 1 skipped (38)
Tests       323 passed | 1 skipped (324)
```

## 리스크 / 참고 사항

- `taskType` 파라미터는 optional로 추가해 기존 호출 형태와 호환되게 했습니다.
- `type` 값은 `RequestCategory`로 제한되며 기존 `TaskSchema.type`과 동일한 enum을 사용합니다.
- 기존 session 파일 중 type이 없는 task result도 schema상 계속 허용됩니다.

## 변경 파일

```text
src/core/pipeline/orchestrator.ts
tests/ts/unit/core/pipeline/orchestrator.test.ts
```

