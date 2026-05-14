# Track B — Accounting + Budget Gate + Privacy CLI (P0-2 + P0-3 + P0-4)

> 담당 범위: Net Token/Cost Accounting, RAG Budget Gate, Privacy 최소 기능
> 짝 트랙: [TRACK_A_CACHE_SAFETY.md](./TRACK_A_CACHE_SAFETY.md)
> 배경 문서: [DETOKS_EXECUTION_MEMORY_FLOW_AND_GAP.md](./DETOKS_EXECUTION_MEMORY_FLOW_AND_GAP.md)

---

## 목적

현재 RAG(semantic retrieval)가 항상 ON이고 그 결과를 모든 task prompt에 무조건 prepend한다([orchestrator.ts:1046-1047](../src/core/pipeline/orchestrator.ts#L1046)). cache hit이 적을수록 RAG가 추가하는 토큰이 절감 토큰보다 많아질 수 있고, 그 여부를 측정하는 카운터도 없다.

이 트랙은 세 가지를 해결한다:

1. **P0-2 Accounting** — 절감/추가 토큰을 분리 측정하고 USD net을 계산한다. 진짜 절감 여부를 숫자로 본다.
2. **P0-3 Budget Gate** — DAG가 만들어진 뒤 실행 필요 task를 먼저 파악하고, 추가 토큰이 과하면 RAG context를 자동 차단한다.
3. **P0-4 Privacy CLI** — `detoks memory disable`, `detoks memory purge --all` 두 명령과 첫 실행 1회 안내.

Track A와의 충돌 방지 경계선: **`orchestrator.ts`의 L546 위는 절대 건드리지 않는다.** Track B가 손대는 orchestrator 영역은 L547–587(Stage B, 이동 대상)과 L1046–1047(Budget Gate 삽입)이다.

---

## 파일별 작업 목록

| 파일 | 작업 유형 |
|------|-----------|
| `src/core/utils/tokenAccounting.ts` | **신규 생성** |
| `src/core/utils/tokenMetrics.ts` | USD 함수 추가 |
| `src/core/pipeline/orchestrator.ts` L547–587 | Stage B 블록 이동 |
| `src/core/pipeline/orchestrator.ts` L1046–1047 | Budget Gate 래핑 |
| `src/cli/commands/memory.ts` | **신규 생성** |
| `src/cli/types.ts` | command union 확장 |
| `src/cli/parse.ts` | memory 커맨드 파싱 추가 |
| `src/cli/index.ts` | memory 커맨드 라우팅 추가 |

---

## Step 1 — 신규 파일: `src/core/utils/tokenAccounting.ts`

이 파일은 새로 만든다. Track A와 겹치지 않는다.

```ts
import { countTokens } from "./tokenMetrics.js";

// ── 토큰 회계 ────────────────────────────────────────────────────────────────
// Token Safety Rule: net = saved_by_cache - added_by_rag - added_by_hints - added_by_compression
// net이 음수일 수 있다는 사실을 명시적으로 인정하는 구조.

export interface TokenAccounting {
  tokensSavedByCache: number;        // F1/F2 hit으로 생략한 adapter 호출 토큰
  tokensAddedByRagContext: number;   // Budget Gate를 통과해 prepend된 ragContext 토큰
  tokensAddedByPatternHints: number; // (현재 0, 향후 prompt 주입 시 양수)
  tokensAddedByCompression: number;  // compressor가 외부 LLM을 쓸 때만 양수 (현재 로컬→0)
  netTokensSaved: number;            // 위 4개의 net
}

// ── USD 비용 회계 ─────────────────────────────────────────────────────────────
// 1차 사용자 지표. 토큰 카운터는 디버깅 보조.

export interface CostAccounting {
  costSavedUsd: number;              // (saved_in × price_in + saved_out × price_out) / 1e6
  costAddedUsd: number;              // added_in × price_in / 1e6
  compressionCostUsd: number;        // 현재 0
  netCostSavedUsd: number;           // costSavedUsd - costAddedUsd - compressionCostUsd
}

// ── P0-2에 묻어가는 light quality counters ─────────────────────────────────────
// P1-2 Quality Metric 본격 구현의 1차 데이터 기반.

export interface LightQualityCounters {
  ragContextInjected: boolean;       // Budget Gate를 통과해 실제로 prepend됐는지
  cacheHitRate: number;              // (F1 + F2 hit) / 전체 task 수
}

// ── 계산 함수 ─────────────────────────────────────────────────────────────────

export function computeNetTokens(
  saved: number,
  addedRag: number,
  addedHints = 0,
  addedCompression = 0,
): TokenAccounting {
  const netTokensSaved = saved - addedRag - addedHints - addedCompression;
  return {
    tokensSavedByCache: saved,
    tokensAddedByRagContext: addedRag,
    tokensAddedByPatternHints: addedHints,
    tokensAddedByCompression: addedCompression,
    netTokensSaved,
  };
}

export function countRagContextTokens(ragContextText: string): number {
  if (!ragContextText) return 0;
  return countTokens(ragContextText);
}
```

---

## Step 2 — `src/core/utils/tokenMetrics.ts`에 USD 계산 함수 추가

기존 파일 끝에 추가한다. 기존 코드는 건드리지 않는다.

```ts
import type { LLMModelConfig } from "../llm-client/llm-models.js";
import { LLM_MODELS } from "../llm-client/llm-models.js";

export interface CostEstimate {
  costSavedUsd: number;
  costAddedUsd: number;
  netCostSavedUsd: number;
}

// adapter 이름으로 llm-models.ts의 단가를 동적 lookup
// 없으면 0 반환 (단가 미지원 모델은 토큰 카운터만 의미있음)
function resolveModelConfig(adapter: string, adapterModel?: string): LLMModelConfig | undefined {
  const key = adapterModel ?? adapter;
  return LLM_MODELS[key] ?? Object.values(LLM_MODELS).find((m) => m.provider === adapter);
}

export function computeCostUsd(params: {
  savedInTokens: number;
  savedOutTokens: number;
  addedInTokens: number;
  adapter: string;
  adapterModel?: string;
}): CostEstimate {
  const config = resolveModelConfig(params.adapter, params.adapterModel);
  if (!config) {
    return { costSavedUsd: 0, costAddedUsd: 0, netCostSavedUsd: 0 };
  }

  // llm-models.ts에 USD 단가가 없으면 추가하거나 하드코드
  // 현재 LLMModelConfig에 promptCostPerMillion/completionCostPerMillion이 없다면
  // 이 Step에서 LLMModelConfig 인터페이스에 optional 필드를 추가한다.
  const priceIn = (config as Record<string, unknown>).promptCostPerMillion as number | undefined ?? 0;
  const priceOut = (config as Record<string, unknown>).completionCostPerMillion as number | undefined ?? 0;

  const costSavedUsd = (params.savedInTokens * priceIn + params.savedOutTokens * priceOut) / 1_000_000;
  const costAddedUsd = (params.addedInTokens * priceIn) / 1_000_000;
  const netCostSavedUsd = costSavedUsd - costAddedUsd;

  return { costSavedUsd, costAddedUsd, netCostSavedUsd };
}
```

**`LLMModelConfig`에 단가 필드가 없는 경우**: `src/core/llm-client/llm-models.ts`의 `LLMModelConfig` 인터페이스에 다음을 추가한다:

```ts
export interface LLMModelConfig {
  // ... 기존 필드 ...
  promptCostPerMillion?: number;      // USD per 1M input tokens
  completionCostPerMillion?: number;  // USD per 1M output tokens
}
```

그리고 알려진 모델에 값을 채운다(참고 기준, 실제 단가는 최신 공식 단가표로 확인):

```ts
'claude-3.5-sonnet': {
  // ...
  promptCostPerMillion: 3.00,
  completionCostPerMillion: 15.00,
},
'claude-opus': {
  // ...
  promptCostPerMillion: 15.00,
  completionCostPerMillion: 75.00,
},
'claude-haiku': {
  // ...
  promptCostPerMillion: 0.25,
  completionCostPerMillion: 1.25,
},
```

---

## Step 3 — `orchestrator.ts` Stage B 블록 이동 (L547–587 → DAG 이후)

### 현재 구조

```
L464–519  F1 session cache
L521–545  F3 resume hint
L547–587  ← Stage B (Semantic Retrieval) ← 이 블록 전체를 이동
L589–~820 Prompt Compile → DAG 생성/검증 → initSessionState
L820      state.task_graph = graph        ← 이 줄 직후로 이동
```

### 변경 방법

1. L547–587 블록 전체를 **잘라낸다** (delete 아님, 이동).

2. `ragSnippets`, `ragEmbedder`, `ragStore` 변수 선언 위치를 L547 위치에서 `let` 선언만 남기고 값 할당은 이동한 위치에서 한다:

   ```ts
   // L547 위치에 선언만 (값은 DAG 이후에서 할당)
   let semanticContext: SemanticContextResult[] | undefined;
   let ragSnippets: RagSnippet[] = [];
   let ragEmbedder: EmbeddingService | undefined;
   let ragStore: VectorStore | undefined;
   ```

3. L820(`state = applyProjectInfo(state, ...)`) 이후, F8–F14 Pattern Hint 블록(L829) **이전**에 이동한 Stage B 로직을 삽입한다.

   이동한 코드는 기존과 거의 같지만 두 가지를 변경한다:

   **a. 실행 필요 task(R) 먼저 파악 — F2 pre-scan:**

   ```ts
   // [E0] F2 cache pre-scan — 실행 필요 task 목록 R 확정
   const f2Hits = new Map<string, Record<string, unknown>>(); // taskId → cachedTaskResult
   const tasksNeedingExecution: typeof graph.tasks = [];
   if (!request.noCache && !CACHE_DISABLED && request.executionMode !== "stub") {
     const projectId = state.shared_context.project_id as string | undefined;
     for (const task of graph.tasks) {
       if (!task.input_hash) { tasksNeedingExecution.push(task); continue; }
       const cachedTask = await SessionStateManager.findSuccessfulTaskByHash(
         task.input_hash,
         { ...(projectId ? { project_id: projectId } : {}), recencyDays: CACHE_TTL_DAYS },
       );
       if (cachedTask) {
         f2Hits.set(task.id, cachedTask.taskResult);
       } else {
         tasksNeedingExecution.push(task);
       }
     }
   } else {
     tasksNeedingExecution.push(...graph.tasks);
   }
   ```

   **b. per-task semantic search (세션 단위 → task 단위):**

   기존 코드는 `raw_input` 하나로 top5를 검색해 `ragSnippets`에 담고 모든 task에 같은 것을 prepend했다.

   이동한 코드에서는 **`tasksNeedingExecution`의 task별로 검색**한다:

   ```ts
   // [B'] 실행 필요 task에만 per-task semantic search
   const perTaskSnippets = new Map<string, RagSnippet[]>(); // taskId → snippets

   if (isRagEnabled() && request.executionMode !== "stub" && tasksNeedingExecution.length > 0) {
     try {
       const modelPath = getRagModelPath()!;
       const cwd = request.userRequest.cwd ?? process.cwd();
       const dbPath = getRagVectorDbPath(cwd);
       ragEmbedder = new EmbeddingService(modelPath);
       await ragEmbedder.init();
       ragStore = new VectorStore(dbPath, RAG_EMBEDDING_DIMS);
       ragStore.open();
       const retriever = new SemanticRetriever(ragStore, ragEmbedder);
       const sessionsDir = resolveSessionsDir(cwd);
       const loader = new RagContextLoader(sessionsDir);

       for (const task of tasksNeedingExecution) {
         // explore/debug/update/analyze 타입에만 retrieval (execute/validate는 기본 skip)
         if (!RAG_ELIGIBLE_TYPES.has(task.type)) continue;

         const queryText = `${task.type} ${task.title}`;
         const hits = await retriever.hybridSearch(queryText, 5);
         if (hits.length > 0) {
           const snippets = await loader.load(hits.slice(0, 1)); // top1 주입, top2 확장 옵션
           if (snippets.length > 0) perTaskSnippets.set(task.id, snippets);
         }
       }

       const totalHits = Array.from(perTaskSnippets.values()).reduce((s, v) => s + v.length, 0);
       if (totalHits > 0) {
         await emitProgressWithLogging({
           stage: "State Manager",
           status: "info",
           message: `RAG: ${tasksNeedingExecution.length}개 task 중 ${perTaskSnippets.size}개 task에 과거 컨텍스트 발견`,
         });
       }
     } catch (ragErr) {
       logger.warn(`RAG retrieval 실패 (non-fatal): ${toErrorMessage(ragErr)}`);
       await ragEmbedder?.dispose().catch(() => {});
       ragStore?.close();
       ragEmbedder = undefined;
       ragStore = undefined;
     }
   }
   ```

   `RAG_ELIGIBLE_TYPES`는 파일 상단에 상수로 정의한다:

   ```ts
   const RAG_ELIGIBLE_TYPES = new Set(["explore", "analyze", "debug", "update", "create"]);
   ```

---

## Step 4 — `orchestrator.ts` Budget Gate 삽입 (L1046–1047)

### 현재 상태 (L1046–1047)

```ts
const ragContext = formatRagSnippetsForPrompt(ragSnippets);
const prompt = `${responseLanguageInstruction}${ragContext ? `${ragContext}\n\n` : ""}[${task.type.toUpperCase()}] ...`;
```

### 변경 후

1. Budget Gate 상수를 orchestrator 파일 상단(import 직후)에 추가:

   ```ts
   const COLD_START_THRESHOLD = parseInt(process.env.DETOKS_COLD_START_THRESHOLD ?? "5", 10);
   const RAG_BREAK_EVEN_RATIO = parseFloat(process.env.DETOKS_RAG_BREAK_EVEN ?? "0.5");
   const PER_TASK_TOKEN_CAP = parseInt(process.env.DETOKS_RAG_PER_TASK_CAP ?? "250", 10);
   const PER_SESSION_TOKEN_CAP = parseInt(process.env.DETOKS_RAG_PER_SESSION_CAP ?? "500", 10);
   ```

2. per-task ragContext 결정 로직 — 실행 루프 내부(기존 L1046 위치)를 아래로 교체:

   ```ts
   // Budget Gate — per-task ragContext 결정
   const taskSnippets = perTaskSnippets.get(task.id) ?? [];
   const ragContextRaw = formatRagSnippetsForPrompt(taskSnippets);
   const ragTokensForTask = countRagContextTokens(ragContextRaw);
   const sessionRagTokensSoFar = tokensAddedByRagContext; // 누적값 (아래 Step에서 선언)

   let ragContext = "";
   if (ragContextRaw && ragTokensForTask > 0) {
     const projectedAdded = sessionRagTokensSoFar + ragTokensForTask;
     const projectedSaved = sumCachedTaskTokens(f2Hits);    // f2Hits는 Step 3에서 만든 Map
     const sessionCount = await countPriorSessions(
       state.shared_context.project_id as string | undefined,
     );
     const inColdStart = sessionCount < COLD_START_THRESHOLD;

     const block =
       projectedAdded > PER_SESSION_TOKEN_CAP ||
       ragTokensForTask > PER_TASK_TOKEN_CAP ||
       (!inColdStart && projectedAdded > projectedSaved * RAG_BREAK_EVEN_RATIO);

     if (!block || request.forceRagContext) {
       ragContext = ragContextRaw;
       tokensAddedByRagContext += ragTokensForTask;
       ragContextInjected = true;
     }
   }

   const prompt = `${responseLanguageInstruction}${ragContext ? `${ragContext}\n\n` : ""}[${task.type.toUpperCase()}] ${task.title}\n\nContext: ${executionContext.context_summary}`;
   ```

3. 실행 루프 진입 전(for 루프 앞)에 Accounting 누적 변수를 선언한다:

   ```ts
   let tokensAddedByRagContext = 0;
   let tokensSavedByCache = 0;
   let cacheHitCount = 0;
   let ragContextInjected = false;
   ```

4. F2 cache hit 시 `tokensSavedByCache` 누적:

   F2 hit 처리 블록(기존 L956 근처) 안에서:

   ```ts
   const taskTokenEstimate =
     (f2CachedResult.token_estimate_total as number | undefined) ?? 0;
   tokensSavedByCache += taskTokenEstimate;
   cacheHitCount += 1;
   ```

5. 실행 루프 종료 후, 최종 반환 직전에 `TokenAccounting`, `CostAccounting` 계산:

   ```ts
   const tokenAccounting = computeNetTokens(
     tokensSavedByCache,
     tokensAddedByRagContext,
   );
   const costAccounting = computeCostUsd({
     savedInTokens: tokensSavedByCache,
     savedOutTokens: 0, // output 토큰 estimate는 추후
     addedInTokens: tokensAddedByRagContext,
     adapter: request.adapter,
     adapterModel: request.env?.ADAPTER_MODEL ?? process.env.ADAPTER_MODEL,
   });
   const lightQuality: LightQualityCounters = {
     ragContextInjected,
     cacheHitRate: graph.tasks.length > 0 ? cacheHitCount / graph.tasks.length : 0,
   };
   ```

6. `return` 객체에 추가:

   ```ts
   return {
     // ... 기존 필드 ...
     tokenAccounting,
     costAccounting,
     lightQuality,
   };
   ```

### 헬퍼 함수

실행 루프 **위에서** 접근 가능한 위치(orchestrator.ts 상단 또는 별도 유틸)에 추가:

```ts
function sumCachedTaskTokens(f2Hits: Map<string, Record<string, unknown>>): number {
  let total = 0;
  for (const result of f2Hits.values()) {
    const est = result.token_estimate_total as number | undefined;
    if (est) total += est;
  }
  return total;
}

async function countPriorSessions(projectId: string | undefined): Promise<number> {
  try {
    const sessions = await SessionStateManager.listSessions();
    if (!projectId) return sessions.length;
    // project_id 필터는 listSessions가 지원하지 않으면 모든 세션 수로 근사
    return sessions.length;
  } catch {
    return 0;
  }
}
```

`--force-rag-context` 플래그는 `request` 타입에 optional boolean을 추가한다:

```ts
// src/core/pipeline/types.ts 의 PipelineExecutionRequest 에 추가
forceRagContext?: boolean;   // Budget Gate 무시, RAG context 강제 주입
noRagContext?: boolean;      // RAG context 강제 OFF
```

---

## Step 5 — 신규 파일: `src/cli/commands/memory.ts`

```ts
import { promises as fs } from "node:fs";
import { join, homedir } from "node:path";
import { SESSIONS_DIR } from "../../core/cache/cache-config.js";
import { getRagVectorDbPath } from "../../core/rag/rag-config.js";

const DISABLED_FLAG_FILE = join(homedir(), ".detoks", "disabled");

export interface MemoryCommandResult {
  ok: boolean;
  action: "disable" | "purge-all";
  message: string;
}

// detoks memory disable
// ~/.detoks/disabled 파일을 생성. 다음 실행부터 저장/조회/인덱싱 모두 OFF.
export async function runMemoryDisableCommand(): Promise<MemoryCommandResult> {
  try {
    await fs.mkdir(join(homedir(), ".detoks"), { recursive: true });
    await fs.writeFile(DISABLED_FLAG_FILE, "", { flag: "w" });
    return {
      ok: true,
      action: "disable",
      message: `DeToks 메모리 기능이 비활성화되었습니다.\n파일: ${DISABLED_FLAG_FILE}\n재활성화: 파일을 삭제하거나 DETOKS_MEMORY=on 환경 변수를 설정하세요.`,
    };
  } catch (err) {
    return {
      ok: false,
      action: "disable",
      message: `비활성화 파일 생성 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// detoks memory purge --all
// .state/sessions/*.json + .state/rag/vectors.db 일괄 삭제 (확인 프롬프트 포함).
export async function runMemoryPurgeAllCommand(opts: {
  skipConfirm?: boolean; // 테스트 환경 등에서 확인 생략용
} = {}): Promise<MemoryCommandResult> {
  if (!opts.skipConfirm) {
    // Node.js에서 stdin 한 줄 읽기
    const confirmed = await promptConfirm(
      "⚠️  .state/sessions/ 전체와 벡터 DB를 영구 삭제합니다. 계속하시겠습니까? (yes/N): ",
    );
    if (!confirmed) {
      return { ok: true, action: "purge-all", message: "취소되었습니다." };
    }
  }

  const errors: string[] = [];
  let deletedCount = 0;

  // 1. session 파일 삭제
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        await fs.unlink(join(SESSIONS_DIR, file));
        deletedCount++;
      } catch (e) {
        errors.push(`${file}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch {
    // SESSIONS_DIR이 없으면 그냥 통과
  }

  // 2. 벡터 DB 삭제
  try {
    const dbPath = getRagVectorDbPath(process.cwd());
    await fs.unlink(dbPath);
    deletedCount++;
  } catch {
    // 벡터 DB가 없으면 통과
  }

  if (errors.length > 0) {
    return {
      ok: false,
      action: "purge-all",
      message: `일부 파일 삭제 실패:\n${errors.join("\n")}`,
    };
  }

  return {
    ok: true,
    action: "purge-all",
    message: `${deletedCount}개 파일을 삭제했습니다. DeToks 메모리가 초기화되었습니다.`,
  };
}

async function promptConfirm(question: string): Promise<boolean> {
  process.stdout.write(question);
  return new Promise((resolve) => {
    let answer = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.resume();
    process.stdin.once("data", (chunk) => {
      answer = String(chunk).trim().toLowerCase();
      process.stdin.pause();
      resolve(answer === "yes" || answer === "y");
    });
  });
}
```

**`SESSIONS_DIR`이 `cache-config.ts`에 export되어 있는지 확인**:

```bash
grep -n "SESSIONS_DIR\|export" src/core/cache/cache-config.ts
```

없으면 `cache-config.ts`에 추가한다:

```ts
export const SESSIONS_DIR = join(process.cwd(), ".state", "sessions");
```

`getRagVectorDbPath`는 `src/core/rag/rag-config.ts`에 이미 있다:

```bash
grep -n "getRagVectorDbPath" src/core/rag/rag-config.ts
```

---

## Step 6 — `src/cli/types.ts` command union 확장

### 현재 (L20–29)

```ts
command?:
  | "session-list"
  // ... 기존 ...
  | "checkpoint-restore";
```

### 변경 후

```ts
command?:
  | "session-list"
  // ... 기존 항목 유지 ...
  | "checkpoint-restore"
  | "memory-disable"    // NEW
  | "memory-purge-all"; // NEW
```

`memoryPurgeAll?: boolean` 필드도 `CliArgs`에 추가(parse에서 `--all` 플래그 처리용):

```ts
export interface CliArgs {
  // ... 기존 필드 ...
  memoryPurgeAll?: boolean;   // NEW: detoks memory purge --all 플래그
  skipConfirm?: boolean;      // NEW: 테스트용 확인 생략
}
```

---

## Step 7 — `src/cli/parse.ts` memory 커맨드 파싱 추가

`parseCliArgs` 함수 내부, `first === "session"` 블록 근처에 아래를 추가한다:

```ts
if (first === "memory") {
  const sub = positionals[1];
  if (sub === "disable") {
    return {
      mode: "run",
      adapter,
      executionMode,
      verbose,
      trace,
      showHelp: false,
      command: "memory-disable",
    };
  }
  if (sub === "purge") {
    const allFlag = positionals.includes("--all") || argv.includes("--all");
    return {
      mode: "run",
      adapter,
      executionMode,
      verbose,
      trace,
      showHelp: false,
      command: "memory-purge-all",
      memoryPurgeAll: allFlag,
      skipConfirm: argv.includes("--yes"),
    };
  }
  throw new Error(`알 수 없는 memory 하위 명령: ${sub ?? "(없음)"}. detoks memory disable|purge --all`);
}
```

`--all`은 positionals 배열에 들어가지 않도록 처리 흐름을 확인한다. `parseCliArgs` 안에서 `--all`이 positionals에 들어가지 않게 하려면 `--`로 시작하는 플래그 파싱 로직에서 `--all`을 처리하거나, 위처럼 `argv.includes("--all")`을 직접 확인한다.

CLI usage 문자열(`CLI_USAGE_MAIN`)에도 두 줄을 추가한다:

```ts
"  detoks memory disable                DeToks 메모리 기능 전체 비활성화",
"  detoks memory purge --all            세션 파일 및 벡터 DB 일괄 삭제",
```

---

## Step 8 — `src/cli/index.ts` memory 커맨드 라우팅 추가

import 블록에 추가:

```ts
import { runMemoryDisableCommand, runMemoryPurgeAllCommand } from "./commands/memory.js";
```

`main` 함수 안, 기존 `if (args.command === "checkpoint-restore")` 블록 이후에 추가:

```ts
if (args.command === "memory-disable") {
  const result = await runMemoryDisableCommand();
  console.log(args.human ? result.message : JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
  return;
}

if (args.command === "memory-purge-all") {
  const result = await runMemoryPurgeAllCommand({ skipConfirm: args.skipConfirm });
  console.log(args.human ? result.message : JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
  return;
}
```

---

## Step 9 — 첫 실행 1회 안내

`orchestrator.ts` 진입부(F1 cache 이전, L464 앞)에 삽입한다. **이 코드는 L464 위에 들어가므로 Track A 담당 영역과 순서상 겹치지 않도록 주의한다. 한 줄만 추가하고 로직은 별도 함수로 분리한다.**

```ts
// 첫 실행 안내 (L464 직전에 삽입)
await maybeShowFirstRunNotice(request.userRequest.cwd ?? process.cwd());
```

`maybeShowFirstRunNotice` 함수는 orchestrator 파일 상단에 정의:

```ts
const NOTICE_SHOWN_FILE = ".state/.detoks-notice-shown";

async function maybeShowFirstRunNotice(cwd: string): Promise<void> {
  const flagPath = join(cwd, NOTICE_SHOWN_FILE);
  try {
    await fs.access(flagPath);
    return; // 이미 표시했음
  } catch { /* 파일 없음 → 안내 필요 */ }

  const notice = [
    "[detoks] DeToks는 실행 메모리를 .state/sessions에 저장합니다.",
    "[detoks] cross-project store에는 generalize 단계를 거친 익명 패턴만 들어갑니다.",
    "[detoks] 비활성화: detoks memory disable / 일괄 삭제: detoks memory purge --all",
  ].join("\n");

  process.stderr.write(`${notice}\n`);

  try {
    await fs.mkdir(join(cwd, ".state"), { recursive: true });
    await fs.writeFile(flagPath, new Date().toISOString(), "utf-8");
  } catch { /* 쓰기 실패는 non-fatal */ }
}
```

`fs` import가 orchestrator 상단에 없으면 추가한다:

```ts
import { promises as fs } from "node:fs";
```

---

## 검증 체크리스트

- [ ] `tsc --noEmit` 에러 없음
- [ ] `detoks memory disable` 실행 → `~/.detoks/disabled` 파일 생성 확인
- [ ] `detoks memory purge --all --yes` 실행(확인 생략) → `.state/sessions/*.json` 삭제 확인
- [ ] `tokenAccounting.netTokensSaved`가 `PipelineExecutionResult`에 포함되는지 확인
- [ ] Budget Gate: `DETOKS_RAG_PER_TASK_CAP=1 detoks run "..."` → ragContext가 빈 문자열로 차단되는지 확인
- [ ] 벡터 DB 없는 환경에서도 Gate가 예외 없이 통과되는지 확인 (non-fatal 처리)
- [ ] 첫 실행 시 안내 문구가 stderr에 출력되고, 두 번째 실행에서는 나오지 않는지 확인

---

## 충돌 방지 체크리스트

Track A와 동시에 작업할 때 지켜야 할 규칙:

- [ ] `orchestrator.ts` **L546 위는 건드리지 않는다** (F1, F3 블록 = Track A 담당)
- [ ] `src/core/cache/cache-validator.ts`는 수정하지 않는다 (Track A 담당)
- [ ] `src/core/rag/hash.ts`는 수정하지 않는다 (Track A 담당)
- [ ] `src/core/task-graph/TaskGraphProcessor.ts`는 수정하지 않는다 (Track A 담당)
- [ ] `markTaskCompleted` 함수 시그니처 변경은 Track A가 한다 — Track B는 **해당 함수를 호출만 한다**

PR 순서: **Track A를 먼저 머지한다.** Track B의 Budget Gate에서 `CacheValidity` 타입을 참조하거나 Track A가 변경하는 `isTaskCacheValid` 반환값에 의존하는 부분이 있기 때문이다. Track A PR이 없으면 Track B 빌드가 깨질 수 있다.
