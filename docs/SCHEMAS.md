# 📦 Schemas

8단계 변환 흐름에서 사용하는 모든 데이터 스키마를 정의합니다.

---

## 1. UserRequest

```ts
type UserRequest = {
	raw_input: string;
	session_id?: string;
};
```

**설명:** 사용자의 자연어 입력

---

## 2. CompiledPrompt

```ts
type CompiledPrompt = {
	raw_input: string;
	normalized_input: string;
	compressed_prompt: string;
	language: "ko" | "en" | "mixed";
};
```

**책임:** Role 1 (AI Prompt Engineer)  
**설명:** 자연어를 정규화하고 압축한 결과

---

## 3. Role2PromptInput

```ts
type Role2PromptInput = {
	compiled_prompt: string;
};
```

**책임:** Role 1 (AI Prompt Engineer)  
**설명:** Role 1이 Role 2.1로 넘기는 handoff schema. 값은 `CompiledPrompt.compressed_prompt`와 동일한 압축 영문 프롬프트 전문이다. task 분해 / id / depends_on 생성은 Role 2.1 담당.

---

## 4. AnalyzedRequest

```ts
type RequestCategory =
	| "explore"
	| "create"
	| "modify"
	| "analyze"
	| "validate"
	| "execute"
	| "document"
	| "plan";

type AnalyzedRequest = {
	category: RequestCategory;
	keywords: string[];
	tasks: Task[];
};
```

**책임:** Role 2.1 (Task Graph Engineer)
**설명:** 요청을 분류하고 키워드와 후보 task를 추출한 결과. `RequestCategory`의 의미 기준은 `docs/TYPE_DEFINITION.md`를 따른다.

---

## 5. Task & TaskGraph

```ts
type TaskStatus = "pending" | "running" | "completed" | "failed";
type TaskType = RequestCategory;

type Task = {
	id: string;
	type: TaskType;
	status: TaskStatus;
	title: string;
	description?: string;
	input_hash: string;
	output_summary?: string;
	depends_on: string[];
	priority?: number;
	owner_role?: "role1" | "role2.1" | "role2.2" | "role3";
};

type TaskGraph = {
	tasks: Task[];
};
```
Semantic meaning of `TaskType` is defined canonically in `docs/TYPE_DEFINITION.md`.

**책임:** Role 2.1 (Task Graph Engineer)  
**설명:** Task를 세분화하고 의존성을 정의한 그래프

---

## 6. ExecutionContext

```ts
type ExecutionContext = {
	session_id: string;
	active_task_id: string;
	shared_context: Record<string, unknown>;
	selected_context: Record<string, unknown>;
	context_summary?: string;
};
```

**책임:** Role 2.2 (State & Context Engineer)  
**설명:** 현재 Task 실행에 필요한 압축된 문맥

---

## 7. ExecutionRequest & ExecutionResult

```ts
type ExecutionRequest = {
	task_id: string;
	prompt: string;
	target: "codex" | "gemini";
	context: ExecutionContext;
	timeout_ms?: number;
};

type ExecutionError = {
	code: string;
	message: string;
};

type ExecutionResult = {
	task_id: string;
	success: boolean;
	raw_output: string;
	structured_output?: Record<string, unknown>;
	error?: ExecutionError;
};
```

**책임:** Role 3 (CLI / System Engineer)  
**설명:** 실제 실행 요청과 결과

---

## 8. SessionState & Checkpoint

```ts
type Checkpoint = {
	id: string;
	title: string;
	task_id: string;
	summary: string;
	changed_files: string[];
	next_action: string;
	created_at: string;
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
	last_summary?: string;
	next_action?: string;
	updated_at: string;
};
```

**책임:** Role 2.2 (State & Context Engineer)  
**설명:** 세션 전체 상태 및 체크포인트

---

## Rules

- Every task must have an `id` and `title`.
- `depends_on` must always be present.
- All field names follow `snake_case` convention.
- All timestamps are ISO 8601 format.
- State must be JSON-serializable.
- `owner_role` indicates which role is responsible for the task.
<!-- 한국어 설명: 모든 필드는 snake_case를 따르고, Task는 id와 title을 필수로 가지며, 모든 상태는 JSON 직렬화 가능해야 합니다. -->
