# Track A — Cache Safety (P0-1)

> 담당 범위: Cache Validation 강화 + Hash v2 마이그레이션
> 짝 트랙: [TRACK_B_ACCOUNTING_GATE_PRIVACY.md](./TRACK_B_ACCOUNTING_GATE_PRIVACY.md)
> 배경 문서: [DETOKS_EXECUTION_MEMORY_FLOW_AND_GAP.md](./DETOKS_EXECUTION_MEMORY_FLOW_AND_GAP.md)

---

## 목적

현재 F2 task cache는 hit이 거의 나지 않는다. 원인은 hash 키에 `task.id`(실행 순서 식별자 `t1`, `t2`, …)가 들어 있기 때문이다. 앞에 task 하나만 추가/삭제되면 그 뒤 모든 task의 hash가 깨진다.

이 트랙은 두 가지를 한 번에 해결한다:

1. **Hash v2** — `task.id`를 제거하고 작업의 의미(type, normalizedIntent, adapter, 버전 등)만으로 hash를 만들어 F2 hit률 구조적 개선.
2. **3단계 Validity** — 기존 valid/invalid 이진 분기를 `"auto" | "advise" | "skip"` 3단계로 교체해, adapter·git HEAD 불일치를 안전하게 처리.

Track B와의 충돌 방지 경계선: **`orchestrator.ts`의 L547 이하는 절대 건드리지 않는다.** Track A가 손대는 영역은 L464–519(F1 cache)와 L947–988(F2 cache)뿐이다.

---

## 파일별 작업 목록

| 파일 | 작업 유형 |
|------|-----------|
| `src/core/rag/hash.ts` | 함수 추가 |
| `src/core/task-graph/TaskGraphProcessor.ts` | 함수 교체 |
| `src/core/cache/cache-validator.ts` | 타입 추가 + 함수 시그니처 변경 |
| `src/core/state/SessionStateManager.ts` | opts 확장 |
| `src/core/pipeline/orchestrator.ts` L76–89 | stamp 필드 추가 |
| `src/core/pipeline/orchestrator.ts` L464–519 | isSessionCacheValid 호출 갱신 |
| `src/core/pipeline/orchestrator.ts` L947–988 | isTaskCacheValid 호출 갱신 + stamp |

---

## Step 1 — `src/core/rag/hash.ts`에 `hashTaskInputV2` 추가

### 현재 상태

파일 하단에 `computeProjectId` 함수로 끝난다.

### 추가할 코드

파일 맨 아래에 추가:

```ts
// task 캐시 키 v2 — task.id(실행 순서 식별자)를 제외하고
// 작업 의미(type, normalizedIntent, adapter, 버전)로만 hash를 생성한다.
// v1은 id 포함으로 인해 앞 task가 하나만 바뀌어도 이후 모든 hash가 깨지는 구조적 버그가 있었다.
export const hashTaskInputV2 = (params: {
  projectId: string;
  type: string;
  normalizedIntent: string;
  adapter: string;
  adapterModel: string;
  detoksMajorVersion: number;
}): string => {
  const content = JSON.stringify(params);
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
};
```

`normalizedIntent`는 Role1(prompt compiler)이 정규화한 task sentence다. 공백·문장 부호만 정규화하고 **파일 경로, 심볼명, 함수명 같은 식별자는 그대로 유지**한다 — 안 그러면 "run tests on A"와 "run tests on B"가 같은 hash로 충돌한다.

---

## Step 2 — `src/core/task-graph/TaskGraphProcessor.ts` hash 교체

### 현재 상태 (L350–353)

```ts
private static computeInputHash(id: string, type: string, sentence: string): string {
  const content = JSON.stringify({ id, type, sentence });
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
```

### 변경 목표

`hashTaskInputV2`를 호출하도록 교체한다. `TaskGraphProcessor`가 `projectId`, `adapter`, `adapterModel`을 알아야 하므로 이 값들을 어디서 받아야 하는지 파악해야 한다.

`TaskGraphProcessor`가 호출되는 경로를 확인한다:

```bash
grep -n "TaskGraphProcessor" src/core/pipeline/orchestrator.ts
```

`processGraph` 또는 유사 정적 메서드가 orchestrator 안에서 호출될 것이다. 그 호출 시점에 `request.adapter`, `request.env?.ADAPTER_MODEL`, `projectId`가 이미 있으므로 context 객체를 추가 파라미터로 넘겨주는 방식으로 처리한다.

**구체적 변경 방법:**

1. `computeInputHash` 시그니처를 변경한다:

   ```ts
   private static computeInputHash(params: {
     projectId: string;
     type: string;
     normalizedIntent: string;  // 기존 sentence → normalizedIntent로 rename
     adapter: string;
     adapterModel: string;
     detoksMajorVersion: number;
   }): string {
     return hashTaskInputV2(params);
   }
   ```

2. `createHash` import를 `hashTaskInputV2` import로 교체:

   ```ts
   // 기존
   import { createHash } from "node:crypto";

   // 변경 후 (createHash를 더 이상 직접 쓰지 않으면 제거)
   import { hashTaskInputV2 } from "../rag/hash.js";
   ```

3. `computeInputHash`를 호출하는 내부 위치를 모두 찾아 새 시그니처에 맞게 파라미터를 전달한다.

   `id`는 넘기지 않는다. `sentence` → `normalizedIntent`로 rename. `projectId`, `adapter`, `adapterModel`, `detoksMajorVersion`은 orchestrator에서 내려줘야 한다.

4. v1 hash도 별도 필드(`input_hash_v1`)로 같이 저장해 7일 TTL 동안 후방 호환 조회가 가능하게 한다(선택적 구현 — 시간이 허용하면 추가).

**`detoksMajorVersion`은 어디서 가져오나:**

`package.json`의 `version` 필드의 major 번호를 사용한다. 상수로 정의하거나 import해서 쓴다:

```ts
// src/core/pipeline/orchestrator.ts 또는 공통 위치
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const DETOKS_MAJOR_VERSION: number = parseInt(
  (require("../../../package.json") as { version: string }).version.split(".")[0] ?? "0",
  10,
);
```

---

## Step 3 — `src/core/cache/cache-validator.ts` 3단계 Validity 교체

### 현재 상태

```ts
export interface CacheValidationOpts {
  project_id?: string;
  recencyDays?: number;
}

export function isSessionCacheValid(session: SessionState, opts: CacheValidationOpts = {}): boolean
export function isTaskCacheValid(taskResult: Record<string, unknown>, opts: CacheValidationOpts = {}): boolean
```

### 변경 후 전체 파일

```ts
import type { SessionState } from "../../schemas/pipeline.js";
import { CACHE_TTL_DAYS } from "./cache-config.js";

// "auto"   → 모든 조건 통과, 즉시 캐시 반환
// "advise" → recency 경계 근처 / adapter 불일치 등 — 결과 반환 X, 유사 결과 안내만
// "skip"   → 검증 실패, miss 처리
export type CacheValidity = "auto" | "advise" | "skip";

export interface CacheValidationOpts {
  project_id?: string;
  recencyDays?: number;
  expected_adapter?: string;        // NEW
  expected_adapter_model?: string;  // NEW
  expected_git_head?: string;       // NEW
  detoks_major_version?: number;    // NEW
}

export function isSessionCacheValid(
  session: SessionState,
  opts: CacheValidationOpts = {},
): CacheValidity {
  const { project_id, recencyDays = CACHE_TTL_DAYS, expected_adapter, expected_git_head } = opts;

  if (project_id && session.shared_context.project_id !== project_id) return "skip";

  const failedIds = (session.shared_context.failed_task_ids as string[] | undefined) ?? [];
  if (failedIds.length > 0) return "skip";

  if (session.completed_task_ids.length === 0) return "skip";

  if (session.updated_at) {
    const cutoff = Date.now() - recencyDays * 24 * 60 * 60 * 1000;
    if (new Date(session.updated_at).getTime() < cutoff) return "skip";
  }

  // adapter 불일치 → advise (결과를 참고로 보여주지 않음 — 단, 안내 가능)
  const storedAdapter = (session.shared_context as Record<string, unknown>).adapter as string | undefined;
  if (expected_adapter && storedAdapter && storedAdapter !== expected_adapter) return "advise";

  // git HEAD 불일치 → advise
  const storedGitHead = (session.shared_context as Record<string, unknown>).git_head as string | undefined;
  if (expected_git_head && storedGitHead && storedGitHead !== expected_git_head) return "advise";

  return "auto";
}

export function isTaskCacheValid(
  taskResult: Record<string, unknown>,
  opts: CacheValidationOpts = {},
): CacheValidity {
  const { recencyDays = CACHE_TTL_DAYS, expected_adapter, expected_git_head } = opts;

  if (taskResult.success !== true) return "skip";

  if (typeof taskResult.completed_at === "string") {
    const cutoff = Date.now() - recencyDays * 24 * 60 * 60 * 1000;
    if (new Date(taskResult.completed_at).getTime() < cutoff) return "skip";
  }

  // adapter 불일치 → advise
  if (expected_adapter && taskResult.adapter && taskResult.adapter !== expected_adapter) return "advise";

  // git HEAD 불일치 → advise
  if (expected_git_head && taskResult.git_head && taskResult.git_head !== expected_git_head) return "advise";

  return "auto";
}
```

### 주의사항

- 기존 호출자가 `boolean`을 기대하는 경우가 있을 수 있다. 파일을 저장한 뒤 TypeScript 오류가 나는 위치를 전부 `=== "auto"` 또는 `!== "skip"` 패턴으로 교체한다.
- orchestrator 이외의 호출자를 확인하는 명령:

  ```bash
  grep -rn "isSessionCacheValid\|isTaskCacheValid" src/
  ```

---

## Step 4 — `src/core/state/SessionStateManager.ts` opts 확장

### 변경 대상 메서드

`findSuccessfulTaskByHash` (L399–436)의 opts 타입에 `adapter?`, `git_head?`를 추가하고 필터를 적용한다.

```ts
static async findSuccessfulTaskByHash(
  taskHash: string,
  opts: {
    project_id?: string;
    recencyDays?: number;
    adapter?: string;      // NEW
    git_head?: string;     // NEW
  } = {},
): Promise<{ taskResult: Record<string, unknown>; sessionId: string } | null> {
  const { project_id, recencyDays = 7, adapter, git_head } = opts;
  const cutoff = Date.now() - recencyDays * 24 * 60 * 60 * 1000;

  // ... (기존 파일 스캔 로직) ...

  for (const taskResult of Object.values(state.task_results)) {
    const res = taskResult as Record<string, unknown>;
    if (res.input_hash !== taskHash) continue;
    if (res.success !== true) continue;
    if (typeof res.completed_at === "string") {
      if (new Date(res.completed_at).getTime() < cutoff) continue;
    }
    // NEW: adapter 필터 — 저장 시 adapter가 없으면(구 세션) 통과시켜 호환성 유지
    if (adapter && res.adapter && res.adapter !== adapter) continue;
    // NEW: git_head 필터 — 저장 시 git_head가 없으면(구 세션) 통과
    if (git_head && res.git_head && res.git_head !== git_head) continue;
    return { taskResult: res, sessionId: file.slice(0, -".json".length) };
  }
```

구 세션(stamp 필드가 없는 것)은 항상 통과시켜야 한다. `if (adapter && res.adapter && ...)` 패턴이 이를 보장한다 — `res.adapter`가 없으면 두 번째 조건이 false가 되어 continue하지 않는다.

`findSuccessfulSessionByInputHash` (L363–397)에도 동일하게 `adapter?` 필터를 추가한다.

---

## Step 5 — `orchestrator.ts` stamp 필드 추가 (`initSessionState` 영역)

`initSessionState` 함수 (L76–89)에 `adapter`와 `git_head`를 stamp할 수 있도록 파라미터를 추가한다.

현재:

```ts
function initSessionState(sessionId: string, rawInput: string, executionMode: string): SessionState
```

변경 후:

```ts
function initSessionState(
  sessionId: string,
  rawInput: string,
  executionMode: string,
  opts: { adapter?: string; adapterModel?: string; gitHead?: string } = {},
): SessionState {
  return {
    shared_context: {
      session_id: sessionId,
      raw_input: rawInput,
      ...(executionMode !== "stub" ? { raw_input_hash: hashRawInput(rawInput) } : {}),
      ...(opts.adapter ? { adapter: opts.adapter } : {}),
      ...(opts.adapterModel ? { adapter_model: opts.adapterModel } : {}),
      ...(opts.gitHead ? { git_head: opts.gitHead } : {}),
    },
    task_results: {},
    current_task_id: null,
    completed_task_ids: [],
    updated_at: new Date().toISOString(),
  };
}
```

`gitHead`는 `execSync("git rev-parse HEAD")` 결과를 사용한다. try-catch로 감싸 git이 없는 환경을 처리한다:

```ts
function resolveGitHead(cwd: string): string | undefined {
  try {
    return execSync("git rev-parse HEAD", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim().slice(0, 8); // 8자리 단축 SHA
  } catch {
    return undefined;
  }
}
```

orchestrator 안 `initSessionState` 호출 위치 (L818):

```ts
state = initSessionState(sessionId, request.userRequest.raw_input, request.executionMode, {
  adapter: request.adapter,
  adapterModel: request.env?.ADAPTER_MODEL ?? process.env.ADAPTER_MODEL,
  gitHead: resolveGitHead(request.userRequest.cwd ?? process.cwd()),
});
```

---

## Step 6 — `orchestrator.ts` F1 cache 블록 갱신 (L464–519)

### 현재 상태 (L475, L507)

```ts
if (cachedSession && isSessionCacheValid(cachedSession, { project_id: projectId })) {
  // ...
  tokensSaved: 0,
```

### 변경 사항

1. `isSessionCacheValid` 반환값이 `CacheValidity`로 바뀌었으므로 조건문 수정:

   ```ts
   const gitHead = resolveGitHead(request.userRequest.cwd ?? process.cwd());
   const validity = isSessionCacheValid(cachedSession, {
     project_id: projectId,
     expected_adapter: request.adapter,
     expected_git_head: gitHead,
   });

   if (validity === "auto") {
     // 기존 cache hit 처리 — adapter 호출 0회, 즉시 반환
     // ...
   } else if (validity === "advise") {
     // 조용히 miss로 처리 (advise 안내는 P1-1에서)
     // validity === "advise"는 현재 단계에서 miss와 동일하게 처리
   }
   // validity === "skip" → 기존 miss 처리로 그대로 흐름
   ```

2. `tokensSaved: 0` → 실제 값 계산:

   세션 캐시 hit 시 절감 토큰 = 그 세션이 실제로 실행했을 때 소비했을 토큰 추정치. 현재 저장된 세션에는 `token_metrics`가 있을 수 있다. 없으면 0으로 유지한다 (P0-2 Accounting이 이 필드를 채우기 시작한 뒤부터 의미있는 값이 나옴).

   ```ts
   const rawTokensSaved =
     (cachedSession.shared_context as Record<string, unknown>).token_estimate_total as number | undefined;

   return {
     // ...
     cacheHit: {
       kind: "session" as const,
       sourceSessionId: cachedSessionId,
       cacheAge,
       tokensSaved: rawTokensSaved ?? 0,
     },
   };
   ```

---

## Step 7 — `orchestrator.ts` F2 cache 블록 갱신 (L947–988)

### 현재 상태 (L954, L956)

```ts
if (cachedTask && isTaskCacheValid(cachedTask.taskResult, {})) {
  state = markTaskCompleted(state, task.id, cachedOutput, task.type, task);
```

### 변경 사항

1. `isTaskCacheValid` 호출에 adapter, git_head 전달:

   ```ts
   const gitHead = resolveGitHead(request.userRequest.cwd ?? process.cwd());
   const adapterModel = request.env?.ADAPTER_MODEL ?? process.env.ADAPTER_MODEL;
   const validity = isTaskCacheValid(cachedTask.taskResult, {
     expected_adapter: request.adapter,
     expected_adapter_model: adapterModel,
     expected_git_head: gitHead,
   });

   if (validity !== "auto") {
     // "advise" 또는 "skip" → cache miss로 처리
     // "advise"는 현재 단계에서 silent miss (P1-1에서 안내 추가)
     await emitActionTimelineWithLogging(
       createActionTimelineEvent({
         kind: "cache_miss",
         source: "pipeline",
         summary: `F2 캐시 ${validity} — task ${task.id} (adapter/git_head 불일치)`,
         taskId: task.id,
       }),
     );
     // miss로 넘어감 (아래 코드 계속 실행)
   } else {
     // validity === "auto" → 기존 cache hit 처리
     state = markTaskCompleted(state, task.id, cachedOutput, task.type, task);
     // ...
     continue;
   }
   ```

2. `markTaskCompleted` 호출에 stamp 필드 추가:

   `markTaskCompleted` 함수 (L134–160)에서 `task_results[taskId]`에 stamp 필드를 추가한다:

   ```ts
   function markTaskCompleted(
     state: SessionState,
     taskId: string,
     rawOutput: string,
     taskType?: string,
     task?: { title?: string; input_hash?: string; depends_on?: string[] },
     stamp?: { adapter?: string; adapterModel?: string; gitHead?: string },  // NEW
   ): SessionState {
     const now = new Date().toISOString();
     return {
       ...state,
       current_task_id: null,
       completed_task_ids: [...state.completed_task_ids, taskId],
       task_results: {
         ...state.task_results,
         [taskId]: {
           task_id: taskId,
           success: true,
           summary: rawOutput.slice(0, 200),
           raw_output: rawOutput,
           ...(taskType ? { type: taskType } : {}),
           ...extractRagMeta(task),
           completed_at: now,
           // NEW stamp 필드
           ...(stamp?.adapter ? { adapter: stamp.adapter } : {}),
           ...(stamp?.adapterModel ? { adapter_model: stamp.adapterModel } : {}),
           ...(stamp?.gitHead ? { git_head: stamp.gitHead } : {}),
         },
       },
       updated_at: now,
     };
   }
   ```

   orchestrator에서 `markTaskCompleted` 를 호출하는 두 곳 (L956, L1114)에 stamp를 넘긴다:

   ```ts
   const stamp = {
     adapter: request.adapter,
     adapterModel: request.env?.ADAPTER_MODEL ?? process.env.ADAPTER_MODEL,
     gitHead: resolveGitHead(request.userRequest.cwd ?? process.cwd()),
   };
   state = markTaskCompleted(state, task.id, cachedOutput, task.type, task, stamp);
   // ... (L1114도 동일)
   state = markTaskCompleted(state, task.id, execResult.rawOutput, task.type, task, stamp);
   ```

   `resolveGitHead`는 매번 execSync를 호출하지 않도록 orchestrator 함수 진입부에서 한 번만 계산해 변수로 유지한다.

---

## 검증 체크리스트

구현이 끝난 뒤 아래를 확인한다:

- [ ] `tsc --noEmit` 에러 없음 (특히 `isSessionCacheValid`, `isTaskCacheValid` 반환 타입 변경 파급 효과)
- [ ] `hashTaskInputV2` 단위 테스트: 같은 파라미터 → 같은 hash, `id`가 달라도 같은 hash
- [ ] `isTaskCacheValid` 단위 테스트: adapter 불일치 → "advise", 모든 필드 일치 → "auto"
- [ ] F2 cache hit 시나리오: `--execution-mode stub`으로 돌린 결과는 캐시 miss 처리 확인
- [ ] 구 세션(stamp 필드 없음)에서 `findSuccessfulTaskByHash` → 여전히 hit 가능한지 확인

---

## 충돌 방지 체크리스트

Track B와 동시에 작업할 때 지켜야 할 규칙:

- [ ] `orchestrator.ts`에서 **L547 아래는 수정하지 않는다** (Stage B 이후 영역 = Track B 담당)
- [ ] `src/core/utils/tokenAccounting.ts` 파일은 생성하지 않는다 (Track B 담당)
- [ ] `src/cli/commands/memory.ts` 파일은 생성하지 않는다 (Track B 담당)
- [ ] `src/core/utils/tokenMetrics.ts`는 수정하지 않는다 (Track B 담당)

PR 순서: **Track A를 먼저 머지한다.** Track B의 Budget Gate가 `CacheValidity` 타입을 import해서 사용하기 때문에 A가 먼저 들어가야 B에서 타입 충돌이 없다.
