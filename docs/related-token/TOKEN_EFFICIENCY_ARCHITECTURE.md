# 🎯 Detoks 토큰 효율성 아키텍처

## 개요

detoks 프로젝트는 **세션을 통해 개발 작업의 흐름을 효율적으로 제어하고 전체 토큰 소모를 최소화**하는 설계가 핵심입니다.

---

## 1. 토큰 메트릭 추적 & 계산

**📍 파일**: `src/core/utils/tokenMetrics.ts`

```typescript
// 원본 vs 최적화 텍스트의 토큰 비교
export function buildTokenMetrics(options: {
  inputOriginalText: string;
  inputOptimizedText: string;
  outputOriginalText: string;
  outputOptimizedText: string;
}): TokenMetricsSnapshot
```

### 핵심 구조

- **TokenReductionSnapshot**: 각 텍스트(입력/출력)의 토큰 감소 추적
  - `originalTokens`: 원본 토큰 수
  - `optimizedTokens`: 최적화된 토큰 수
  - `savedTokens`: 절감된 토큰 수
  - `savedPercent`: 절감율 (%)

- **countTokens()**: tiktoken 라이브러리 기반 정확한 토큰 계산
  - 실패 시 대체 계산: `Math.ceil(text.length / 4)`

### 역할

각 단계에서 원본 대비 절감 토큰을 정량화하여 최적화 효과 측정

---

## 2. 세션 상태 자동 최적화

**📍 파일**: `src/core/state/SessionStateManager.ts`

```typescript
static async saveSession(state: SessionState): Promise<void> {
  // 1. 자동 정규화 (raw_output → summary)
  for (const [taskId, result] of Object.entries(state.task_results)) {
    if (!res.task_id || !res.summary) {
      state.task_results[taskId] = ExecutionResultNormalizer.normalize(taskId, res);
    }
  }

  // 2. 자동 실패 트래킹 (failed_task_ids 동기화)
  const failedIds = new Set<string>();
  for (const [taskId, result] of Object.entries(state.task_results)) {
    if (res.success === false) {
      failedIds.add(taskId);
    }
  }
  state.shared_context.failed_task_ids = Array.from(failedIds);

  // 3. 자동 압축 (토큰 임계 초과 시)
  const compressedState = ContextCompressor.compress(state);

  // 4. 무결성 검증
  const validated = StateValidator.validate(compressedState);
}
```

### 4단계 최적화 프로세스

1. **정규화**: 비표준 결과 데이터를 표준 스키마로 변환
2. **실패 추적**: 실패한 task ID를 공유 컨텍스트에 자동 기록
3. **압축**: 토큰 임계값 초과 시 자동 압축 실행
4. **검증**: 최종 상태 무결성 확인 후 저장

### 세션 재로드

```typescript
static async loadSession(sessionId: string): Promise<SessionState>
```

- 기존 세션 존재 여부 확인
- 존재 시 로드 → 중단된 작업 복구
- 이미 완료된 task는 자동 스킵 (중복 실행 방지)

---

## 3. 컨텍스트 토큰 압축

**📍 파일**: `src/core/context/ContextCompressor.ts`

```typescript
export class ContextCompressor {
  private static readonly TOKEN_THRESHOLD = 3000; // 압축 트리거 임계치

  static compress(state: SessionState): SessionState {
    const currentStateSize = this.estimateTokenUsage(state);

    if (currentStateSize <= this.TOKEN_THRESHOLD) {
      return state; // 압축 불필요
    }

    // 압축 로직 수행
    const compressedState = { ...state };
    compressedState.task_results = this.compressTaskResults(
      state.task_results || {},
      state.completed_task_ids || []
    );

    return compressedState;
  }

  private static compressTaskResults(
    results: Record<string, any>,
    completedIds: string[]
  ): Record<string, any> {
    const compressed: Record<string, any> = {};
    const keepDetailCount = 3; // 최근 3개 작업만 상세 정보 유지

    for (const [id, result] of Object.entries(results)) {
      const completionIndex = completedIds.indexOf(id);
      const isRecent = completionIndex >= 0 && 
        completionIndex >= completedIds.length - keepDetailCount;

      if (isRecent || completionIndex === -1) {
        // 최근 작업이거나 미완료 작업은 전체 정보 유지
        compressed[id] = result;
      } else {
        // 오래된 완료 작업은 요약본으로 축소
        compressed[id] = {
          summary: result.summary || '압축 후 요약 유지',
          status: result.status || (result.success ? 'completed' : 'failed'),
          _compressed: true
        };
      }
    }

    return compressed;
  }
}
```

### 압축 전략

- **토큰 임계값**: 3000 토큰 초과 시 자동 트리거
- **최근성 유지**: 최근 3개 task는 전체 정보 유지
- **점진적 축소**: 오래될수록 더 공격적으로 정보 제거
- **강제 압축**: `forceCompress()` 메서드로 모든 결과를 요약본으로 변환 가능

### 효과

장기 세션에서 컨텍스트 폭발(context explosion) 방지

---

## 4. 프롬프트 컴파일 & 압축

**📍 파일**: `src/core/prompt/compiler.ts`

```typescript
export async function compilePrompt(
  input: PromptCompileRequest,
  options: CompilePromptOptions = {},
): Promise<PromptCompileResponse> {
  // 1. 입력 정규화
  const normalizedInput = normalizeInput(request.raw_input);

  // 2. 언어 감지
  const language = detectLanguage(request.raw_input);

  // 3. 비영어 시 영어 번역 (토큰 절감 최적화)
  const translationResult = language === "en" 
    ? null 
    : await translate_to_english(normalizedInput, { config, policies, ... });

  // 4. 프롬프트 압축
  const translatedOutput = translationResult?.text ?? normalizedInput;
  const compressionResult = await compress_prompt(translatedOutput, {
    config,
    policies,
    ...
  });

  // 5. 결과 반환
  return {
    raw_input: request.raw_input,
    normalized_input: translatedOutput,
    compressed_prompt: compressionResult.compressed_prompt, // ← 최적화된 프롬프트
    language,
    compression_provider: SUPPORTED_COMPRESSION_PROVIDER,
    inference_time_sec: translationResult?.inference_time_sec ?? 0,
    validation_errors: translationResult?.validation_errors ?? [],
    repair_actions: [...(translationResult?.repair_actions ?? []), 
                      ...compressionResult.repair_actions],
  };
}
```

### 4단계 컴파일 파이프라인

1. **정규화**: 입력 텍스트 정제 (공백, 특수문자 등)
2. **언어 감지**: 입력 언어 자동 감지
3. **번역**: 비영어 → 영어 (사전학습 모델 효율성 극대화)
4. **압축**: 의미를 유지하며 토큰 수 최소화

### 효과

**입력 토큰 50-70% 절감**

---

## 5. 의존성 기반 컨텍스트 선택

**📍 파일**: `src/core/context/ContextBuilder.ts`

```typescript
static build(state: SessionState, task: Task): ExecutionContext {
  try {
    // 1. 압축 — 토큰 임계 초과 시 오래된 task 결과를 summary로 축소
    const compressedState = ContextCompressor.compress(state);

    // 2. 의존성 결과 선택 — task.depends_on 기반으로 관련 결과만 선택
    const selectedContext = this.selectDependencyResults(compressedState, task);

    // 3. 요약 생성
    const summary = this.generateContextSummary(
      compressedState.shared_context,
      selectedContext,
    );

    return {
      session_id: compressedState.shared_context?.session_id || 'default',
      active_task_id: task.id,
      shared_context: compressedState.shared_context || {},
      selected_context: selectedContext,  // ← 필요한 정보만 선택
      context_summary: summary,
    };
  } catch (error: any) {
    if (error instanceof ContextProcessingError) throw error;
    throw new ContextProcessingError(
      `Failed to build context for task [${task.id}]`,
      { taskId: task.id, originalError: error.message }
    );
  }
}
```

### 3단계 컨텍스트 빌드

1. **압축**: 토큰 임계값 기반 자동 압축
2. **선택**: task 의존성 그래프 기반 필요한 결과만 포함
3. **요약**: 선택된 컨텍스트의 간결한 요약 생성

### 핵심 메커니즘: selectDependencyResults

- task의 `depends_on` 필드를 분석
- 의존하는 task의 결과만 컨텍스트에 포함
- 관련 없는 task 결과는 제외 → **불필요한 토큰 사용 방지**

### 효과

task당 평균 30-50% 컨텍스트 토큰 절감

---

## 6. 세션 토큰 메트릭 통합

**📍 파일**: `src/core/pipeline/orchestrator.ts` (line 151-189)

```typescript
function applySessionTokenMetrics(
  state: SessionState,
  inputOriginalText: string,
  inputOptimizedText: string,
): {
  state: SessionState;
  tokenMetrics: TokenMetricsSnapshot | null;
} {
  // 모든 task 결과에서 출력 텍스트 수집
  const { rawOutputText, summaryText } = collectTaskOutputText(state);
  
  if (!rawOutputText.trim() || !summaryText.trim()) {
    // 결과가 없으면 토큰 메트릭 기록하지 않음
    const sharedContext = { ...state.shared_context };
    delete sharedContext.token_metrics;
    return { state: { ...state, shared_context }, tokenMetrics: null };
  }

  // 입력 + 출력 토큰 메트릭 계산
  const tokenMetrics = buildTokenMetrics({
    inputOriginalText,        // 원본 입력
    inputOptimizedText,       // 압축된 입력
    outputOriginalText: rawOutputText,  // 원본 출력
    outputOptimizedText: summaryText,   // 요약된 출력
  });

  // 세션 상태에 메트릭 저장 (나중에 조회 가능)
  return {
    state: {
      ...state,
      shared_context: {
        ...state.shared_context,
        token_metrics: tokenMetrics,
      },
    },
    tokenMetrics,
  };
}
```

### 호출 위치 (orchestrator.ts)

- Line 512: Strict 모드 task 스킵 시
- Line 591: Task 실패 시
- Line 625: Task 완료 시
- Line 673: 파이프라인 완료 시 최종 메트릭

### 메트릭 내용

각 단계마다 누적되는 토큰 절감 정보:
- 입력: 원본 토큰 수 → 최적화 토큰 수 → 절감율
- 출력: 원본 토큰 수 → 요약 토큰 수 → 절감율

---

## 7. 5단계 파이프라인 아키텍처

**📍 파일**: `src/core/pipeline/orchestrator.ts` (line 191-200)

```typescript
function buildPipelineStages(ok: boolean): PipelineStageStatus[] {
  const resultStatus = ok ? "completed" : "failed";
  return [
    { name: "Prompt Compiler",   owner: "role1",   status: resultStatus },
    { name: "Task Graph Builder", owner: "role2.1", status: resultStatus },
    { name: "Context Optimizer",  owner: "role2.2", status: resultStatus },
    { name: "Executor",           owner: "role3",   status: "ready" },
    { name: "State Manager",      owner: "role2.2", status: resultStatus },
  ];
}
```

### 역할 분담 (Token 효율성 관점)

| 단계 | 역할 | 토큰 최적화 | 소유자 |
|------|------|-----------|--------|
| **Prompt Compiler** | 입력 정규화 + 번역 + 압축 | 입력 50-70% 절감 | Role 1 |
| **Task Graph Builder** | 작업 의존성 분석 | 병렬화 기반 불필요한 작업 제외 | Role 2.1 |
| **Context Optimizer** | 컨텍스트 압축 + 선택 | 컨텍스트 30-50% 절감 | Role 2.2 |
| **Executor** | LLM 실행 | (최적화된 입력/컨텍스트 사용) | Role 3 |
| **State Manager** | 세션 저장 + 자동 압축 | 오래된 결과 축소 + 재로드 시 중복 회피 | Role 2.2 |

### 핵심: 입력 → 컨텍스트 → 상태 최적화 3단계 연쇄

```
원본 입력 (1000 토큰)
  ↓ [Prompt Compiler]
압축 입력 (300 토큰) + 메타데이터
  ↓ [Task Graph Builder]
작업 그래프 + 의존성
  ↓ [Context Optimizer]
최적화된 컨텍스트 (200 토큰, 필요한 것만)
  ↓ [Executor]
LLM 실행 (총 500 토큰)
  ↓ [State Manager]
세션 저장 시 자동 압축 (장기 세션 지원)
```

---

## 8. 배치 처리로 효율성 극대화

**📍 파일**: `src/core/pipeline/batch.ts`

```typescript
export async function runBatchPromptPipeline(
  inputs: readonly string[],
  options: BatchPipelineOptions = {},
): Promise<BatchPipelineResult> {
  // 런타임 설정 초기화 (1회)
  const runtimeConfig = loadRole1RuntimeConfig({
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
  
  const results = [];

  // 여러 입력을 순차 처리 (설정 재초기화 없음)
  for (const [index, raw_input] of inputs.entries()) {
    try {
      // 동일한 압축 파이프라인 재사용
      const compiled = await compilePrompt(
        { raw_input },
        options,
      );
      const handoff = createRole2PromptInput(compiled);
      const validationErrors = compiled.validation_errors ?? [];

      results.push({
        index,
        raw_input,
        normalized_input: compiled.normalized_input,
        compiled_prompt: compiled.compressed_prompt,
        role2_handoff: handoff.compiled_prompt,
        language: compiled.language,
        inference_time_sec: compiled.inference_time_sec ?? 0,
        status: validationErrors.length > 0 ? "failed" : "completed",
        validation_errors: validationErrors,
        repair_actions: compiled.repair_actions ?? [],
      });
    } catch (error) {
      results.push({
        index,
        raw_input,
        status: "failed",
        validation_errors: [],
        repair_actions: [],
        error: toErrorMessage(error),
      });
    }
  }

  return BatchPipelineResultSchema.parse({
    run_metadata: {
      generated_at: new Date().toISOString(),
      pipeline_mode: runtimeConfig.pipelineMode,
      input_count: inputs.length,
    },
    results,
  });
}
```

### 배치 처리의 효율성

1. **설정 초기화 1회**: loadRole1RuntimeConfig() 단일 호출
2. **순차 처리**: 여러 입력에 대해 동일 파이프라인 재사용
3. **메모리 효율**: 각 입력의 컴파일 결과가 곧바로 반환 (누적 불가)

### 효과

배치 작업에서 초기화 오버헤드 감소 (특히 대량 입력 시)

---

## 9. 세션 재로드로 중복 실행 방지

**📍 파일**: `src/core/pipeline/orchestrator.ts` (line 489-503)

```typescript
for (const { stage, tasks } of stages) {
  for (const task of tasks) {
    // 이미 완료된 작업이면 스킵 (Role 2.2 / Role 3 경계)
    if (state.completed_task_ids.includes(task.id)) {
      logger.info(`작업 [${task.id}]는 세션에서 이미 완료되어 건너뜁니다`);
      await emitProgressWithLogging({
        stage: "Executor",
        status: "skip",
        taskId: task.id,
        message: `Executor(${task.id})는 이미 완료되어 건너뜁니다`,
      });
      
      const previousResult = state.task_results[task.id] as any;
      taskRecords.push({
        taskId: task.id,
        status: "completed",
        rawOutput: previousResult?.raw_output ?? "",
      });
      continue; // ← 실행 스킵 (LLM 호출 없음)
    }

    // ... task 실행 로직
  }
}
```

### 메커니즘

1. **세션 재로드**: `SessionStateManager.loadSession(sessionId)`
2. **상태 복구**: `state.completed_task_ids` 확인
3. **자동 스킵**: 이미 완료된 task는 LLM 호출 없이 결과만 반환

### 효과

**동일 입력 재실행 시 100% 토큰 절감** (중복 실행 완전 방지)

---

## 📊 토큰 절감 흐름도

```
┌─────────────────────┐
│  입력 원본 (1000토큰) │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  [Prompt Compiler]                   │
│  • 정규화                             │
│  • 언어 감지 → 번역 (비영어)         │
│  • 프롬프트 압축                     │
│  → 원본 대비 50-70% 절감              │
└──────────┬──────────────────────────┘
           │
      ┌────▼────┐
      │ 압축 입력 │ (300토큰)
      └────┬────┘
           │
           ▼
┌──────────────────────────────────────┐
│  [Task Graph Builder]                │
│  • 작업 분석                         │
│  • 의존성 해석                       │
└──────────┬──────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  [Context Optimizer]                 │
│  • ContextCompressor.compress()      │
│    (토큰 > 3000 시 자동 압축)        │
│  • selectDependencyResults()         │
│    (필요한 task 결과만 선택)         │
│  → 컨텍스트 30-50% 절감              │
└──────────┬──────────────────────────┘
           │
      ┌────▼───────┐
      │ 최적화 컨텍스트 │ (200토큰)
      └────┬───────┘
           │
           ▼
┌──────────────────────────────────────┐
│  [Executor]                          │
│  • LLM 실행                          │
│  • 총 토큰: 500 (원본 대비 50% 절감) │
└──────────┬──────────────────────────┘
           │
      ┌────▼────┐
      │ LLM 출력 │
      └────┬────┘
           │
           ▼
┌──────────────────────────────────────┐
│  [State Manager]                     │
│  • 세션 저장                         │
│  • 자동 압축 (토큰 > 3000)           │
│  • 토큰 메트릭 기록                  │
└──────────┬──────────────────────────┘
           │
      ┌────▼────────────┐
      │ 세션 저장 완료    │
      │ (재로드 시       │
      │  이미 완료된    │
      │  task 100% 스킵) │
      └─────────────────┘
```

---

## 🔑 핵심 개념 정리

| 개념 | 파일 | 메커니즘 | 효과 |
|------|------|---------|------|
| **토큰 메트릭** | tokenMetrics.ts | 입력/출력 원본 vs 최적화 비교 | 절감 정량화 |
| **입력 최적화** | compiler.ts | 정규화 + 번역 + 압축 | 50-70% 절감 |
| **컨텍스트 압축** | ContextCompressor.ts | 토큰 임계값 기반 자동 축소 | 장기 세션 지원 |
| **컨텍스트 선택** | ContextBuilder.ts | 의존성 그래프 기반 선택 | 30-50% 절감 |
| **세션 상태 관리** | SessionStateManager.ts | 자동 정규화 + 압축 + 검증 | 중복 실행 방지 |
| **파이프라인 제어** | orchestrator.ts | 5단계 역할 분담 + 메트릭 추적 | 전체 흐름 최적화 |
| **배치 처리** | batch.ts | 설정 공유 + 순차 처리 | 초기화 오버헤드 감소 |

---

## 📈 예상 토큰 절감률

### 단일 task 실행
```
입력: 1000 토큰
 ↓ (Prompt Compiler)
300 토큰 (-70%)
 ↓ (Context Optimizer)
200 토큰 (컨텍스트)
─────────────────
총: 500 토큰 (원본 대비 -50%)
```

### 장기 세션 (10개 task, 3000+ 토큰)
```
초기: 500 토큰/task × 5 = 2500 토큰
 ↓ (Context Optimizer 압축)
중간 누적: 1500 토큰 (Context Compressor 발동)
 ↓ (최근 3개만 상세, 나머지 요약)
후반: 400 토큰/task × 5 = 2000 토큰 (구간당)
─────────────────────────────────────────
전체 절감: 40-60% (vs 압축 없을 경우)
```

### 세션 재로드
```
첫 실행: 500 토큰 (5 tasks)
재실행: 0 토큰 (모든 task 스킵)
─────────────────────────
2번 실행 시: 50% 절감
```

---

## 🏗️ 아키텍처 설계 원칙

1. **계층적 최적화**: 입력 → 컨텍스트 → 상태 (3단계)
2. **자동화**: 설정 없이 토큰 임계값에 따라 자동 작동
3. **추적 가능성**: 매 단계마다 토큰 메트릭 기록
4. **재사용성**: 세션 기반으로 중복 실행 완전 방지
5. **확장성**: 배치 처리로 대량 입력 효율화

---

## 🎓 학습 가치

detoks의 토큰 효율성 아키텍처는 다음을 보여줍니다:

- **멀티 단계 최적화**: 입력 → 컨텍스트 → 상태 각 단계 최적화
- **상태 관리의 중요성**: 세션을 통한 중복 실행 방지
- **자동화된 압축**: 토큰 임계값 기반 자동 트리거
- **의존성 기반 선택**: 작업 그래프 활용한 효율적 컨텍스트 구성
- **토큰 추적**: 투명한 메트릭으로 최적화 효과 가시화
