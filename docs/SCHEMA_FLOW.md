# 📊 Schema Flow

detoks의 7단계 데이터 변환 흐름과 역할별 책임을 정의합니다.

---

## 전체 변환 순서

```
사용자 입력
  ↓ (Role 1)
CompiledPrompt
  ↓ (Role 1)
AnalyzedRequest
  ↓ (Role 2.1)
TaskGraph
  ↓ (Role 2.2)
ExecutionContext
  ↓ (Role 3)
ExecutionResult
  ↓ (Role 2.2)
SessionState
```

---

## Role별 책임과 데이터

### Role 1: AI Prompt Engineer

**책임:**
- 자연어 입력 정규화
- 요청 분류 및 키워드 추출
- Task 후보 추출

**생성 데이터:**

#### 1. CompiledPrompt

```ts
type CompiledPrompt = {
  raw_input: string;
  normalized_input: string;
  compressed_prompt: string;
  language: "ko" | "en" | "mixed";
};
```

#### 2. AnalyzedRequest

```ts
type AnalyzedRequest = {
  category: string;
  keywords: string[];
  tasks: Task[];
};
```

**의미:** 단순 문자열이 아닌 구조화된 요청으로 변환

---

### Role 2.1: Task Graph Engineer

**책임:**
- Task 세분화
- 의존성 정의
- 실행 순서 결정

**생성 데이터:**

#### 3. TaskGraph

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

**의미:** 실행 가능한 그래프로 변환

---

### Role 2.2: State & Context Engineer

**책임:**
- 필요한 문맥만 추출
- 상태 관리 및 압축
- 다음 턴 준비

**생성 데이터:**

#### 4. ExecutionContext

```ts
type ExecutionContext = {
  session_id: string;
  active_task_id: string;
  shared_context: Record<string, unknown>;
  selected_context: Record<string, unknown>;
  context_summary?: string;
};
```

#### 5. SessionState

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

**의미:** 전체 세션을 들고 다니지 않고 필요한 것만 압축

---

### Role 3: CLI / System Engineer

**책임:**
- 입력을 실행기로 전달
- 결과 수신 및 구조화
- 오류 처리

**생성 데이터:**

#### 6. ExecutionRequest

```ts
type ExecutionRequest = {
  task_id: string;
  prompt: string;
  target: "codex" | "gemini";
  context: ExecutionContext;
  timeout_ms?: number;
};
```

#### 7. ExecutionResult

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

**의미:** 의미 해석 최소화, 실행 결과 구조화만 담당

---

## 역할별 데이터 Ownership

| 데이터 | 역할 | 책임 |
|--------|------|------|
| UserRequest | User | 입력 |
| CompiledPrompt | Role 1 | 생성 |
| AnalyzedRequest | Role 1 | 생성 |
| TaskGraph | Role 2.1 | 생성 |
| ExecutionContext | Role 2.2 | 생성 |
| ExecutionRequest | Role 3 | 생성 |
| ExecutionResult | Role 3 | 생성 |
| SessionState | Role 2.2 | 관리 |

---

## 왜 이렇게 나눠야 하나

### 1. Role별 책임이 명확

- **Role 1:** 해석만 담당
- **Role 2.1:** 작업화만 담당
- **Role 2.2:** 상태/문맥 관리
- **Role 3:** 실행만 담당

### 2. 중간 결과 재사용 가능

한 번 분석한 결과를:
- 다시 실행
- 다른 모델에 전달
- 디버깅에 활용

### 3. 실패 지점 추적 용이

- Prompt compile 문제
- Task graph 문제
- Context 문제
- Executor 문제

분리되어야 원인 파악이 빠름

---

## Zod 스키마 최소 구성

```ts
UserRequestSchema
CompiledPromptSchema
AnalyzedRequestSchema
TaskSchema
TaskGraphSchema
ExecutionContextSchema
ExecutionRequestSchema
ExecutionResultSchema
SessionStateSchema
```
