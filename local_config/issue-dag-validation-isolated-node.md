# Issue: 문서화 후속 작업에서 DAG 연결성 검증 실패

## 요약

명시적으로 순서가 있는 긴 다중 작업 요청에서 중간에 `document` 작업이 포함되면 DAG 검증 단계가 `DISCONNECTED_NODE`로 실패할 수 있습니다.

관측된 실패 메시지:

```text
DAG validation failed: DISCONNECTED_NODE - Task "t3" has no dependencies and no dependents - isolated from the graph
```

이 문제는 `DAGValidator` 자체의 오류가 아니라 Role 2.1의 TaskGraph 생성 문제입니다. `DAGValidator`는 부분적으로만 연결된 그래프를 올바르게 거부하고 있습니다. 문제는 `TaskGraphProcessor`가 `document` 타입을 절대적인 종료 노드로 처리해, 명시적 후속 작업까지 그래프에서 끊어 버리는 데 있습니다.

## 재현 방법

다음처럼 순서가 있는 작업 문장으로 분리되는 긴 요청을 사용합니다.

```ts
[
  "Analyze the entire codebase",
  "create a comprehensive documentation with examples",
  "implement all suggested improvements",
  "validate everything",
]
```

기대하는 작업 흐름:

```text
t1 analyze -> t2 document -> t3 create -> t4 validate
```

수정 전 동작:

```text
t1 analyze -> t2 document
t3 create
t4 validate
```

이 상태에서는 `t3`가 연결된 컴포넌트에서 고립될 수 있고, `DAGValidator.validate()`가 `DISCONNECTED_NODE`를 반환합니다.

## 원인

### 1. 문서 산출물 생성 표현의 분류가 부족함

`TaskGraphProcessor.TYPE_PATTERNS`는 `write documentation`, `update docs` 같은 명확한 문서화 동사는 `document`로 분류합니다. 하지만 `create comprehensive documentation` 같은 표현은 일반 `create` 패턴에 걸릴 수 있습니다.

문서 산출물에 대해 분류가 안정적이지 않았습니다.

### 2. `document`가 절대적인 종료 노드로 처리됨

기존 `TaskGraphProcessor.FLOWS_TO.document`는 비어 있습니다.

```ts
document: []
```

따라서 `document` 뒤에 어떤 작업이 오더라도 `depends_on: []`이 됩니다. 이는 splitter가 comma 순서, `and then`, 반복 명령형 문장 같은 명시적 순서 신호를 통해 작업을 만들었을 때도 동일하게 적용됩니다.

## 기대 동작

- 문서 산출물은 동사가 `create`, `generate`, `draft`, `produce`여도 `document`로 분류되어야 합니다.
- `document`는 보통 종료 단계로 남아야 하지만, 명시적인 후속 작업은 순서 있는 workflow로 이어질 수 있어야 합니다.
- 재현 케이스는 하나의 연결된 순차 그래프를 만들어야 합니다.

```text
analyze -> document -> create -> validate
```

## 수정 방향

1. 일반 `create` 패턴보다 앞에서 문서 산출물 패턴을 처리합니다.

```ts
/\b(create|generate|draft|produce)\s+(a\s+|an\s+|the\s+)?(comprehensive\s+)?(documentation|docs|readme|guide|docstring|comment[s]?)\b/
```

2. `document` 뒤의 명시적 후속 작업을 연결할 수 있게 합니다.

```ts
document: ["analyze", "modify", "validate", "execute", "create", "plan"]
```

3. `DAGValidator`는 변경하지 않습니다. 실제로 끊어진 그래프는 계속 거부해야 합니다.

## 완료 조건

- [ ] `Create comprehensive documentation`이 `document`로 분류된다.
- [ ] 순서 있는 작업 문장에서 `document -> validate`가 순차 의존성을 만든다.
- [ ] `analyze -> document -> create -> validate`가 연결된 순차 그래프를 만든다.
- [ ] 기존 disconnected-node 검증 동작은 유지된다.
- [ ] `npm run build`가 통과한다.
- [ ] `npm run test`가 통과한다.

## 관련 파일

- `src/core/task-graph/TaskGraphProcessor.ts`
- `src/core/task-graph/DAGValidator.ts`
- `tests/ts/unit/core/task-graph/TaskGraphProcessor.test.ts`
- `tests/ts/unit/core/task-graph/DAGValidator.test.ts`
- `docs/TYPE_DEFINITION.md`

