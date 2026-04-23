# 📦 Schemas

## Task Schema

```ts
type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';
type TaskType = 'explore' | 'create' | 'modify' | 'analyze' | 'validate' | 'execute' | 'document' | 'plan';

type Task = {
  id: string;
  type: TaskType;
  status: TaskStatus;
  input_hash: string;
  output_summary?: string;
  depends_on: string[];
};

type Checkpoint = {
  id: string;
  title: string;
  task_id: string;
  summary: string;
  changed_files: string[];
  next_action: string;
  created_at: string;
};

type TaskGraph = {
  tasks: Task[];
};

type SessionState = {
  session_id: string;
  version: string;
  goal: string;
  current_task: string | null;
  completed_tasks: string[];
  key_decisions: string[];
  active_files: string[];
  tasks: Task[];
  summaries: {
    rolling: string;
    latest_checkpoint: string | null;
  };
  artifacts: {
    task_results: Record<string, unknown>;
    errors: string[];
  };
  metadata: Record<string, unknown>;
  updated_at: string;
};
```
<!-- 한국어 설명: Task, Checkpoint, SessionState는 작업 실행과 세션 상태 관리를 위한 핵심 데이터 구조이며, 모든 필드는 snake_case를 따릅니다. -->

## Rules

- Every task must have an `id`.
- `depends_on` must always be present.
- `task_id`, `input_hash`, `output_summary`, `created_at`, `updated_at` follow snake_case convention.
- State must be JSON-serializable.
<!-- 한국어 설명: 각 작업은 고유 id를 가져야 하고, 의존성 필드는 항상 존재해야 하며, 모든 필드는 snake_case를 따르고, 상태 데이터는 JSON으로 직렬화 가능해야 합니다. -->
