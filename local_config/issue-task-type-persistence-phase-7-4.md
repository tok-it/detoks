# Issue: Orchestrator 실행 결과에 task type이 저장되지 않음

## 요약

Phase 7.1-7.3에서 `ExecutionResult`와 session state 계층은 `type` 필드를 받을 수 있게 준비되었지만, Orchestrator가 실제 task 실행 결과를 저장할 때 `task.type`을 넘기지 않아 `.state/sessions/*.json`의 `task_results`에 type 정보가 남지 않습니다.

이로 인해 Role 2.1에서 분류한 작업 타입이 Role 2.2의 session persistence까지 이어지지 않습니다.

## 현재 동작

`src/core/pipeline/orchestrator.ts`의 상태 갱신 함수는 실행 결과를 저장하지만 `type`을 포함하지 않습니다.

```ts
function markTaskCompleted(
  state: SessionState,
  taskId: string,
  rawOutput: string,
): SessionState
```

```ts
function markTaskFailed(
  state: SessionState,
  taskId: string,
  rawOutput: string,
): SessionState
```

저장되는 `task_results` 예시:

```json
{
  "t1": {
    "task_id": "t1",
    "success": true,
    "summary": "...",
    "raw_output": "..."
  }
}
```

## 문제점

- `TaskGraphProcessor`가 만든 `task.type`이 실행 결과에 반영되지 않습니다.
- 실패한 task와 dependency 실패로 skip된 task도 타입 정보를 잃습니다.
- Session file만 보면 각 task가 `analyze`, `create`, `validate` 중 어떤 타입이었는지 알 수 없습니다.
- Phase 7.1-7.3에서 준비된 `ExecutionResultSchema.type`과 normalizer 흐름이 실제 Orchestrator 경로에서 완성되지 않습니다.

## 기대 동작

성공, 실패, dependency skip 모든 경로에서 `task_results[*].type`이 저장되어야 합니다.

```json
{
  "t1": {
    "task_id": "t1",
    "success": true,
    "summary": "Analyzed the codebase",
    "raw_output": "...",
    "type": "analyze"
  }
}
```

## 수정 방향

1. `markTaskCompleted()`에 선택적 `taskType` 파라미터를 추가합니다.
2. `markTaskFailed()`에 선택적 `taskType` 파라미터를 추가합니다.
3. 다음 세 경로에서 `task.type`을 전달합니다.
   - task 성공
   - task 실패
   - dependency 실패로 인한 skip
4. `PipelineTracer`의 `ExecutionResult` trace에도 `type`을 포함합니다.
5. 성공/실패/skip 경로에 대한 단위 테스트를 추가합니다.

## 완료 조건

- [ ] 성공한 task의 session `task_results[*].type`이 저장된다.
- [ ] 실패한 task의 session `task_results[*].type`이 저장된다.
- [ ] dependency 실패로 skip된 task의 session `task_results[*].type`이 저장된다.
- [ ] `PipelineTracer`의 `ExecutionResult` 출력에 `type`이 포함된다.
- [ ] `npm run build`가 통과한다.
- [ ] `npm run test`가 통과한다.

## 관련 파일

- `src/core/pipeline/orchestrator.ts`
- `tests/ts/unit/core/pipeline/orchestrator.test.ts`
- `src/schemas/pipeline.ts`
- `src/core/state/SessionStateManager.ts`

