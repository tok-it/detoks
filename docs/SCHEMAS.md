# 📦 Schemas

## Task Schema

```ts
type Task = {
  id: string;
  type: string;
  depends_on: string[];
};

type TaskGraph = {
  tasks: Task[];
};

type SessionState = {
  shared_context: Record<string, unknown>;
  task_results: Record<string, unknown>;
};
```
<!-- 한국어 설명: Task, TaskGraph, SessionState는 작업 실행과 세션 상태 관리를 위한 핵심 데이터 구조입니다. -->

## Rules

- Every task must have an `id`.
- `depends_on` must always be present.
- State must be JSON-serializable.
<!-- 한국어 설명: 각 작업은 고유 id를 가져야 하고, 의존성 필드는 항상 존재해야 하며, 상태 데이터는 JSON으로 직렬화 가능해야 합니다. -->
