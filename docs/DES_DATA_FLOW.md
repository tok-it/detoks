> Role 1이 입력을 “번역/압축된 프롬프트”로 만들고, Role 2.1이 그것을 “실행 가능한 작업 그래프”로 바꾸고, Role 3이 “실제 실행”으로 연결한다는 흐름입니다.

## 가장 먼저 결론

공유 데이터는 최소한 아래 순서로 바뀌어가야 합니다.

1. UserRequest
2. CompiledPrompt
3. CompiledSentences
4. TaskGraph
5. ExecutionContext
6. ExecutionResult
7. SessionState

즉,
자연어 입력 → 번역/압축된 프롬프트 → 문장 단위 실행 재료 → 작업 그래프 → 실행 컨텍스트 → 실행 결과 → 상태 저장
순서입니다.

---

# 역할 기준으로 보면

## Role 1: AI Prompt Engineer

역할:

- Prompt compiler
- Korean-to-English translation
- Sentence-level output

즉 Role 1은 아래 데이터를 만듭니다.

### 공유해야 하는 데이터 1: CompiledPrompt

사용자 자연어를 압축/정제한 결과

```ts
type CompiledPrompt = {
	raw_input: string;
	normalized_input: string;
	compressed_prompt: string;
	language: "ko" | "en" | "mixed";
};
```

### 공유해야 하는 데이터 2: CompiledSentences

영어로 정리된 프롬프트를 실행 단위 문장으로 나눈 결과

```ts
type CompiledSentences = {
	sentences: string[];
};
```

### 의미

Role 1은 task 분해, id 생성, type 지정, depends_on 생성을 하지 않습니다.

- 입력을 보존하고
- 한국어를 영어로 변환하고
- 필요한 의미를 압축하고
- 문장 단위 결과를 넘깁니다.

---

## Role 2.1: Task Graph Engineer

역할:

- Request classification
- Task decomposition
- Dependency management
- Execution order definition

Role 2.1은 `CompiledPrompt`와 `CompiledSentences`를 받아서 실행 가능한 그래프로 바꿉니다.

### 공유해야 하는 데이터 3: TaskGraph

```ts
type Task = {
	id: string;
	type: string;
	title: string;
	description?: string;
	depends_on: string[];
	priority?: number;
	owner_role?: "role1" | "role2.1" | "role2.2" | "role3";
};

type TaskGraph = {
	tasks: Task[];
};
```

### 의미

Role 2.1의 책임은:

- 요청을 작업 유형으로 분류하고
- 작업을 실행 단위로 쪼개고
- 순서를 정하고
- 선행 작업을 명확히 하는 것

입니다.

---

## Role 2.2: State & Context Engineer

역할:

- State management
- Context compression
- Result structuring

Role 2.2는 TaskGraph와 이전 결과를 받아서 지금 실행에 필요한 문맥만 남깁니다.

### 공유해야 하는 데이터 4: ExecutionContext

```ts
type ExecutionContext = {
	session_id: string;
	active_task_id: string;
	shared_context: Record<string, unknown>;
	selected_context: Record<string, unknown>;
	context_summary?: string;
};
```

### 공유해야 하는 데이터 5: SessionState

```ts
type SessionState = {
	shared_context: Record<string, unknown>;
	task_results: Record<string, unknown>;
	current_task_id?: string;
	completed_task_ids: string[];
	last_summary?: string;
	next_action?: string;
};
```

### 의미

Role 2.2는:

- 전체 세션을 계속 다 들고 가지 않고
- 현재 필요한 문맥만 압축해서
- 다음 턴에서도 재사용 가능하게 정리해야 합니다.

---

## Role 3: CLI / System Engineer

역할:

- CLI implementation
- Subprocess execution
- Adapter management

Role 3는 앞 단계에서 정리된 구조를 받아 실제 Codex/Gemini/subprocess 실행으로 연결합니다.

### 공유해야 하는 데이터 6: ExecutionRequest

```ts
type ExecutionRequest = {
	task_id: string;
	prompt: string;
	target: "codex" | "gemini";
	context: ExecutionContext;
	timeout_ms?: number;
};
```

### 공유해야 하는 데이터 7: ExecutionResult

```ts
type ExecutionResult = {
	task_id: string;
	success: boolean;
	raw_output: string;
	structured_output?: Record<string, unknown>;
	error?: {
		code: string;
		message: string;
	};
};
```

### 의미

Role 3는 의미 해석을 거의 하지 않고:

- 입력을 실행기로 넘기고
- 결과를 받아서
- 다시 구조화된 결과로 반환하는 역할입니다.

---

# 결국 어떤 순서로 바뀌어야 하나

## 전체 변환 순서

### 1. 사용자 입력

```ts
type UserRequest = {
	raw_input: string;
	session_id?: string;
};
```

### 2. Prompt Compiler 결과

UserRequest → CompiledPrompt

### 3. Sentence Compiler 결과

CompiledPrompt → CompiledSentences

### 4. Task Graph Builder 결과

CompiledPrompt + CompiledSentences → TaskGraph

### 5. Context Optimizer 결과

TaskGraph + SessionState → ExecutionContext

### 6. Executor 결과

ExecutionContext + CompiledPrompt → ExecutionResult

### 7. Output Processor / State Manager 결과

ExecutionResult → SessionState

---

# 가장 추천하는 Zod 구조 묶음

정리하면 최소 공용 스키마는 이 8개입니다.

- UserRequestSchema
- CompiledPromptSchema
- CompiledSentencesSchema
- TaskSchema
- TaskGraphSchema
- ExecutionContextSchema
- ExecutionResultSchema
- SessionStateSchema

---

# 왜 이렇게 나눠야 하나

## 1. Role별 책임이 다름

- Role 1: 번역/압축
- Role 2.1: 작업화
- Role 2.2: 상태/문맥화
- Role 3: 실행

## 2. 중간 결과를 재사용 가능

한 번 분석한 결과를:

- 다시 실행할 수도 있고
- 다른 모델에 넘길 수도 있고
- 디버깅에도 쓸 수 있음

## 3. 실패 지점 추적이 쉬움

- Prompt compile 문제인지
- Translation guardrails 문제인지
- Task graph 문제인지
- Context 문제인지
- Executor 문제인지

분리되어야 바로 보입니다.

---

# 최종 추천

이 프로젝트에서는 공유 구조를 아래처럼 가져가면 됩니다.

```text
UserRequest
  -> CompiledPrompt
  -> AnalyzedRequest
  -> TaskGraph
  -> ExecutionContext
  -> ExecutionResult
  -> SessionState
```

그리고 역할별 ownership은:

- Role 1: CompiledPrompt, AnalyzedRequest
- Role 2.1: TaskGraph
- Role 2.2: ExecutionContext, SessionState
- Role 3: ExecutionRequest, ExecutionResult
