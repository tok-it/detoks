# 📊 Schema Flow

detoks의 8단계 데이터 변환 흐름과 역할별 책임을 정의합니다.

> **정책**: [SHARED_DATA_FLOW.md](./SHARED_DATA_FLOW.md)에서 역할 간 데이터 공유 원칙을 참조하세요.

---

## 전체 변환 순서

```
사용자 입력
  ↓ (Role 1)
CompiledPrompt
  ↓ (Role 1 → Role 2.1)
Role2PromptInput
  ↓ (Role 2.1)
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
- 입력 정규화
- 한국어 → 영어 변환
- protected segment masking / restore
- span-level translation / clean
- validation / repair / fallback
- 불필요한 정보 제거 (압축)
- `CompiledPrompt`, `Role2PromptInput` 생성
- batch result 기록

**생성 데이터:**

#### 1. CompiledPrompt

```ts
type CompiledPrompt = {
  raw_input: string;
  normalized_input: string;
  compressed_prompt: string;
  language: "ko" | "en" | "mixed";
  compression_provider: "kompress";
  inference_time_sec?: number;
  validation_errors?: string[];
  repair_actions?: string[];
  debug?: {
    masked_text: string;
    placeholders: Array<{
      placeholder: string;
      original: string;
      kind: string;
    }>;
    spans: Array<{
      kind: string;
      text: string;
      translate: boolean;
    }>;
    fallback_span_count: number;
  };
};
```

#### 2. Role2PromptInput

```ts
type Role2PromptInput = {
  compiled_prompt: string;
};
```

**의미:** Role 1은 문장 단위 배열을 만들지 않고, `CompiledPrompt.compressed_prompt`를 `Role2PromptInput.compiled_prompt`로 Role 2.1에 전달한다. task 분해 / id / depends_on 생성은 Role 2.1 전담이다.

**Role 1 내부 흐름:**
1. input normalize
2. protected segment masking
3. span 분리
4. 한국어 span 번역
5. clean
6. validate
7. repair
8. translation fallback
9. Kompress compression on natural-language body
10. compression validate
11. invalid하면 `normalized_input`을 `compressed_prompt`로 사용
12. `CompiledPrompt`
13. `Role2PromptInput`

**Role 1 내부 batch artifact:**
- `run_metadata` + `results[]` 구조를 사용한다.
- `debug` mode에서는 `masked_text`, `placeholders`, `spans`, `fallback_span_count`를 item debug metadata로 남긴다.
- batch result는 Role 1 내부 기록용이며 공식 Role 2.1 handoff는 계속 `Role2PromptInput.compiled_prompt` 하나다.
- `scripts/verify-role1.ts` 검증 산출물은 각 item에 `raw_input` 다음 `ph_masked_input`을 추가로 기록한다.
- `ph_masked_input`은 번역 단계와 동일한 보호 구간 마스킹 결과이며 `debug` 여부와 무관하게 항상 출력된다.

---

### Role 2.1: Task Graph Engineer

**책임:**
- 요청 분류
- 키워드 추출
- Task 세분화
- 의존성 정의
- 실행 순서 결정

**생성 데이터:**

#### 3. AnalyzedRequest

```ts
type AnalyzedRequest = {
  category: "explore" | "create" | "modify" | "analyze" | "validate" | "execute" | "document" | "plan";
  keywords: string[];
  tasks: Task[];
};
```

`category`의 의미 기준은 `docs/TYPE_DEFINITION.md`를 따릅니다.

#### 4. TaskGraph

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

**입력:** `Role2PromptInput`

**의미:** 압축된 영문 프롬프트 전문을 바탕으로 실행 가능한 그래프로 변환

---

### Role 2.2: State & Context Engineer

**책임:**
- 필요한 문맥만 추출
- 상태 관리 및 압축
- 다음 턴 준비

**생성 데이터:**

#### 5. ExecutionContext

```ts
type ExecutionContext = {
  session_id: string;
  active_task_id: string;
  shared_context: Record<string, unknown>;
  selected_context: Record<string, unknown>;
  context_summary?: string;
};
```

#### 6. SessionState

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

#### 7. ExecutionRequest

```ts
type ExecutionRequest = {
  task_id: string;
  prompt: string;
  target: "codex" | "gemini";
  context: ExecutionContext;
  timeout_ms?: number;
};
```

#### 8. ExecutionResult

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
| Role2PromptInput | Role 1 → Role 2.1 | 전달 |
| AnalyzedRequest | Role 2.1 | 생성 |
| TaskGraph | Role 2.1 | 생성 |
| ExecutionContext | Role 2.2 | 생성 |
| ExecutionRequest | Role 3 | 생성 |
| ExecutionResult | Role 3 | 생성 |
| SessionState | Role 2.2 | 관리 |

---

## 왜 이렇게 나눠야 하나

### 1. Role별 책임이 명확

- **Role 1:** 번역/압축만 담당
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
