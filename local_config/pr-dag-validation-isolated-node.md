# PR: 문서화 후속 작업의 DAG 연결성 수정

## 요약

이 PR은 순서가 있는 다중 작업 요청에서 `document` 작업 이후 DAG 검증이 `DISCONNECTED_NODE`로 실패할 수 있는 TaskGraph 생성 회귀를 수정합니다.

실패 원인은 두 가지입니다.

- `create comprehensive documentation` 같은 문서 산출물이 `document`가 아니라 `create`로 분류될 수 있었습니다.
- `document`가 절대적인 종료 타입으로 처리되어, 명시적 후속 작업이 이전 workflow에서 끊겼습니다.

`DAGValidator`는 변경하지 않았습니다. disconnected-node 검사는 올바른 동작이며, 이번 수정은 graph builder가 명시적으로 순서가 있는 후속 작업에 대해 끊어진 그래프를 만들지 않도록 하는 것입니다.

## 관련 이슈

- Closes #

## 변경 유형

- [x] 버그 수정
- [ ] 기능 추가
- [x] 테스트
- [x] 문서
- [ ] 리팩터링

## 변경 사항

- `src/core/task-graph/TaskGraphProcessor.ts`
  - `create/generate/draft/produce documentation/docs/readme/guide/docstring/comments` 표현을 `document`로 분류하는 패턴을 추가했습니다.
  - `FLOWS_TO.document`를 업데이트해 명시적 후속 작업이 `analyze`, `modify`, `validate`, `execute`, `create`, `plan`으로 이어질 수 있게 했습니다.

- `tests/ts/unit/core/task-graph/TaskGraphProcessor.test.ts`
  - `Create comprehensive documentation -> document` 분류 테스트를 추가했습니다.
  - `document -> validate` 기대값을 순차 의존성으로 갱신했습니다.
  - `analyze -> document -> create -> validate` 회귀 테스트를 추가했습니다.

- `docs/TYPE_DEFINITION.md`
  - `document`는 보통 종료 단계지만, 명시적으로 순서가 있는 후속 작업은 workflow를 이어갈 수 있다고 설명을 보강했습니다.

## 수정 전

```text
Analyze the entire codebase
create a comprehensive documentation with examples
implement all suggested improvements
validate everything
```

부분적으로만 연결된 그래프가 만들어질 수 있었습니다.

```text
t1 analyze -> t2 document
t3 create
t4 validate
```

이후 `DAGValidator`가 `t3`를 고립 노드로 판단해 거부했습니다.

## 수정 후

같은 순서 있는 workflow가 하나의 연결된 그래프로 생성됩니다.

```text
t1 analyze -> t2 document -> t3 create -> t4 validate
```

## 검증

- [x] `npm run build`
- [x] `npm run test -- tests/ts/unit/core/task-graph/TaskGraphProcessor.test.ts tests/ts/unit/core/task-graph/TaskSentenceSplitter.test.ts tests/ts/unit/core/task-graph/DAGValidator.test.ts`
- [x] `npm run test`

전체 테스트 결과:

```text
Test Files  37 passed | 1 skipped (38)
Tests       321 passed | 1 skipped (322)
```

## 리스크 / 참고 사항

- 기존의 `document`는 항상 dependency flow를 종료한다는 가정이 바뀝니다.
- 변경된 동작은 순서 있는 작업 문장으로부터 그래프를 생성하는 경우에 초점을 둡니다.
- 실제로 끊어진 그래프는 여전히 `DAGValidator`가 거부합니다.

## 변경 파일

```text
docs/TYPE_DEFINITION.md
src/core/task-graph/TaskGraphProcessor.ts
tests/ts/unit/core/task-graph/TaskGraphProcessor.test.ts
```

