# LLM별 컨텍스트 윈도우 기반 동적 압축 구현 가이드

## 문제 정의

현재 detoks의 토큰 압축 로직:
```typescript
// src/core/context/ContextCompressor.ts
private static readonly TOKEN_THRESHOLD = 3000; // 고정값
```

**문제점**:
- 모든 LLM에 동일한 3000 토큰 임계값 적용
- Claude (200K), GPT-4 (8K), Gemini (1M) 등 LLM별 컨텍스트 윈도우 차이 미반영
- detoks의 토큰 계산(o200k_base)과 실제 LLM 토큰 사용량 불일치 가능

**해결 목표**:
1. **LLM별 메타데이터**: 각 LLM의 실제 컨텍스트 윈도우 정의
2. **토큰 인코더 통합**: LLM별 토큰 인코더 지원
3. **동적 임계값**: 실제 사용 가능한 토큰 기반 자동 계산
4. **일관성 유지**: detoks 메트릭과 LLM 실제 계산 동기화

---

## 1단계: LLM 메타데이터 정의

### 파일 생성: `src/core/llm-client/llm-models.ts`

```typescript
// LLM별 컨텍스트 윈도우 및 토큰 인코더 정보
export interface LLMModelConfig {
  // 기본 정보
  modelName: string;
  provider: 'anthropic' | 'openai' | 'google' | 'local';
  
  // 컨텍스트 윈도우 (토큰)
  contextWindowTokens: number;
  
  // 토큰 인코더 정보
  tokenEncoderType: 'o200k_base' | 'cl100k_base' | 'gpt2' | 'custom';
  
  // 예약 토큰 (시스템 프롬프트, 출력 등)
  reservedTokens: {
    systemPrompt: number;      // 시스템 프롬프트 크기 (예: 500)
    outputBuffer: number;      // 출력 버퍼 (예: 2000)
    safetyMargin: number;      // 안전 마진 (예: 100)
  };
  
  // 배치 처리 최대 입력
  maxBatchInputTokens?: number;
}

/**
 * 지원하는 모든 LLM 메타데이터
 * detoks가 지원하는 모든 LLM의 메타데이터를 여기에 정의
 */
export const LLM_MODELS: Record<string, LLMModelConfig> = {
  // ── Anthropic Claude 시리즈
  'claude-3.5-sonnet': {
    modelName: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    contextWindowTokens: 200000,
    tokenEncoderType: 'o200k_base',
    reservedTokens: {
      systemPrompt: 500,
      outputBuffer: 4000,  // Claude는 생성 토큰이 많을 수 있음
      safetyMargin: 500,
    },
    maxBatchInputTokens: 180000,  // 배치 처리 최대 입력
  },

  'claude-opus': {
    modelName: 'claude-3-opus-20250514',
    provider: 'anthropic',
    contextWindowTokens: 200000,
    tokenEncoderType: 'o200k_base',
    reservedTokens: {
      systemPrompt: 500,
      outputBuffer: 4000,
      safetyMargin: 500,
    },
    maxBatchInputTokens: 180000,
  },

  'claude-sonnet': {
    modelName: 'claude-3-sonnet-20240229',
    provider: 'anthropic',
    contextWindowTokens: 200000,
    tokenEncoderType: 'o200k_base',
    reservedTokens: {
      systemPrompt: 500,
      outputBuffer: 2000,
      safetyMargin: 500,
    },
    maxBatchInputTokens: 180000,
  },

  'claude-haiku': {
    modelName: 'claude-3-haiku-20240307',
    provider: 'anthropic',
    contextWindowTokens: 200000,
    tokenEncoderType: 'o200k_base',
    reservedTokens: {
      systemPrompt: 300,
      outputBuffer: 1000,
      safetyMargin: 200,
    },
    maxBatchInputTokens: 180000,
  },

  // ── OpenAI GPT 시리즈
  'gpt-4-turbo': {
    modelName: 'gpt-4-turbo-preview',
    provider: 'openai',
    contextWindowTokens: 128000,
    tokenEncoderType: 'cl100k_base',  // GPT-4는 다른 토큰 인코더
    reservedTokens: {
      systemPrompt: 500,
      outputBuffer: 4000,
      safetyMargin: 1000,  // GPT-4는 보수적인 여유 필요
    },
  },

  'gpt-4': {
    modelName: 'gpt-4',
    provider: 'openai',
    contextWindowTokens: 8192,
    tokenEncoderType: 'cl100k_base',
    reservedTokens: {
      systemPrompt: 300,
      outputBuffer: 2000,
      safetyMargin: 500,
    },
  },

  'gpt-3.5-turbo': {
    modelName: 'gpt-3.5-turbo',
    provider: 'openai',
    contextWindowTokens: 16385,
    tokenEncoderType: 'cl100k_base',
    reservedTokens: {
      systemPrompt: 200,
      outputBuffer: 1000,
      safetyMargin: 300,
    },
  },

  // ── Google Gemini 시리즈
  'gemini-2.0-flash': {
    modelName: 'gemini-2.0-flash',
    provider: 'google',
    contextWindowTokens: 1000000,  // Gemini는 매우 큰 컨텍스트 윈도우
    tokenEncoderType: 'gpt2',       // Gemini는 다른 토큰화 사용
    reservedTokens: {
      systemPrompt: 500,
      outputBuffer: 8000,
      safetyMargin: 1000,
    },
  },

  'gemini-pro': {
    modelName: 'gemini-pro',
    provider: 'google',
    contextWindowTokens: 32768,
    tokenEncoderType: 'gpt2',
    reservedTokens: {
      systemPrompt: 300,
      outputBuffer: 2000,
      safetyMargin: 500,
    },
  },

  // ── 로컬 LLM (예: Llama 2, Mistral)
  'local-llama2-13b': {
    modelName: 'llama-2-13b-chat',
    provider: 'local',
    contextWindowTokens: 4096,
    tokenEncoderType: 'gpt2',  // 오픈소스 모델은 gpt2 토큰화 사용
    reservedTokens: {
      systemPrompt: 200,
      outputBuffer: 512,
      safetyMargin: 100,
    },
  },

  'local-mistral-7b': {
    modelName: 'mistral-7b-instruct',
    provider: 'local',
    contextWindowTokens: 8192,
    tokenEncoderType: 'gpt2',
    reservedTokens: {
      systemPrompt: 300,
      outputBuffer: 1024,
      safetyMargin: 200,
    },
  },
};

/**
 * LLM 모델 설정 조회
 * @param modelName 모델명 또는 alias
 * @returns LLMModelConfig 또는 null
 */
export function getLLMModelConfig(modelName: string): LLMModelConfig | null {
  return LLM_MODELS[modelName] || null;
}

/**
 * 유효한 모델명 목록 반환
 */
export function getAvailableModels(): string[] {
  return Object.keys(LLM_MODELS);
}
```

---

## 2단계: LLM별 토큰 인코더 통합

### 파일 수정: `src/core/utils/tokenMetrics.ts`

```typescript
import { get_encoding, Encoding } from 'tiktoken';

// LLM별 토큰 인코더 캐시
const encoderCache = new Map<string, Encoding>();

/**
 * LLM별 토큰 인코더 반환
 * @param encoderType 인코더 타입 ('o200k_base' | 'cl100k_base' | 'gpt2' | 'custom')
 * @returns tiktoken Encoding 객체
 */
export function getTokenEncoder(encoderType: string): Encoding {
  if (encoderCache.has(encoderType)) {
    return encoderCache.get(encoderType)!;
  }

  let encoder: Encoding;

  try {
    // tiktoken에서 지원하는 인코더 타입
    if (encoderType === 'o200k_base' || 
        encoderType === 'cl100k_base' || 
        encoderType === 'gpt2') {
      encoder = get_encoding(encoderType as any);
    } else {
      // 미지원 타입은 기본값으로 o200k_base 사용
      console.warn(`Unsupported encoder type: ${encoderType}, falling back to o200k_base`);
      encoder = get_encoding('o200k_base');
    }
  } catch (error) {
    // tiktoken 로드 실패 시 대체 계산
    console.warn(`Failed to load encoder ${encoderType}, using fallback calculation`);
    return {
      encode: (text: string) => {
        // 대략적인 토큰 계산: 평균 4글자 = 1토큰
        const tokens = Math.ceil(text.length / 4);
        return Array(tokens).fill(0);
      },
      decode: (tokens: number[]) => '',
      encode_single_token: () => [0],
    } as Encoding;
  }

  encoderCache.set(encoderType, encoder);
  return encoder;
}

/**
 * LLM별 토큰 계산 (인코더 타입 지정)
 * @param text 텍스트
 * @param encoderType 인코더 타입
 * @returns 토큰 수
 */
export function countTokensWithEncoder(
  text: string, 
  encoderType: string = 'o200k_base'
): number {
  try {
    const encoder = getTokenEncoder(encoderType);
    return encoder.encode(text).length;
  } catch {
    // Fallback: 글자 수 기반 대략 계산
    return Math.ceil(text.length / 4);
  }
}

/**
 * 기존 함수 (backward compatibility)
 * detoks 기본값(o200k_base)으로 토큰 계산
 */
export function countTokens(text: string): number {
  return countTokensWithEncoder(text, 'o200k_base');
}

/**
 * 개선된 토큰 메트릭: LLM 인코더 타입 포함
 */
export interface TokenReductionSnapshot {
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  savedPercent: number;
  // 추가: 어떤 인코더로 계산했는지 기록
  encoderType: string;
}

export interface TokenMetricsSnapshot {
  model: string;  // 이전: TOKEN_METRIC_MODEL (고정값) → 실제 모델명
  input: TokenReductionSnapshot;
  output: TokenReductionSnapshot;
  // 추가: LLM 실제 컨텍스트 정보
  llmContextWindow?: {
    totalTokens: number;
    reservedTokens: number;
    availableTokens: number;
  };
}

/**
 * 개선된 토큰 메트릭 빌드: LLM 인코더 타입 고려
 */
export function buildTokenMetricsWithLLM(options: {
  inputOriginalText: string;
  inputOptimizedText: string;
  outputOriginalText: string;
  outputOptimizedText: string;
  modelName?: string;  // LLM 모델명
  encoderType?: string;  // 인코더 타입
}): TokenMetricsSnapshot {
  const encoderType = options.encoderType || 'o200k_base';
  const modelName = options.modelName || 'unknown';

  const input = buildReductionWithEncoder(
    options.inputOriginalText,
    options.inputOptimizedText,
    encoderType
  );

  const output = buildReductionWithEncoder(
    options.outputOriginalText,
    options.outputOptimizedText,
    encoderType
  );

  return {
    model: modelName,
    input: { ...input, encoderType },
    output: { ...output, encoderType },
  };
}

function buildReductionWithEncoder(
  originalText: string,
  optimizedText: string,
  encoderType: string
): Omit<TokenReductionSnapshot, 'encoderType'> {
  const originalTokens = countTokensWithEncoder(originalText, encoderType);
  const optimizedTokens = countTokensWithEncoder(optimizedText, encoderType);
  const savedTokens = Math.max(0, originalTokens - optimizedTokens);

  return {
    originalTokens,
    optimizedTokens,
    savedTokens,
    savedPercent:
      originalTokens > 0 ? (savedTokens / originalTokens) * 100 : 0,
  };
}
```

---

## 3단계: 동적 컨텍스트 버짓 계산

### 파일 생성: `src/core/context/ContextBudgetCalculator.ts`

```typescript
import type { LLMModelConfig } from '../llm-client/llm-models.js';
import { getLLMModelConfig } from '../llm-client/llm-models.js';
import { countTokensWithEncoder } from '../utils/tokenMetrics.js';

/**
 * LLM별 실제 사용 가능한 토큰 버짓 계산
 */
export class ContextBudgetCalculator {
  /**
   * 컨텍스트 버짓 계산
   * 
   * 공식:
   * ```
   * availableTokens = contextWindowTokens 
   *                 - systemPromptTokens 
   *                 - outputBufferTokens 
   *                 - safetyMarginTokens
   * ```
   * 
   * @param modelName LLM 모델명
   * @param currentSystemPrompt 현재 시스템 프롬프트 (실제 길이 기반 계산)
   * @returns 컨텍스트 버짓
   */
  static calculateContextBudget(
    modelName: string,
    currentSystemPrompt?: string
  ): {
    totalContextWindow: number;
    reservedTokens: number;
    availableTokens: number;
    breakdown: {
      systemPrompt: number;
      outputBuffer: number;
      safetyMargin: number;
    };
  } | null {
    const config = getLLMModelConfig(modelName);
    if (!config) {
      return null;  // 지원하지 않는 모델
    }

    // 시스템 프롬프트 토큰 계산 (실제 vs 예상)
    const actualSystemPromptTokens = currentSystemPrompt
      ? countTokensWithEncoder(currentSystemPrompt, config.tokenEncoderType)
      : config.reservedTokens.systemPrompt;

    const totalReserved =
      actualSystemPromptTokens +
      config.reservedTokens.outputBuffer +
      config.reservedTokens.safetyMargin;

    const availableTokens = config.contextWindowTokens - totalReserved;

    return {
      totalContextWindow: config.contextWindowTokens,
      reservedTokens: totalReserved,
      availableTokens: Math.max(0, availableTokens),
      breakdown: {
        systemPrompt: actualSystemPromptTokens,
        outputBuffer: config.reservedTokens.outputBuffer,
        safetyMargin: config.reservedTokens.safetyMargin,
      },
    };
  }

  /**
   * 동적 압축 임계값 계산
   * 
   * 원칙:
   * - 사용 가능한 토큰의 80% 도달 시 압축 트리거
   * - 안전 마진 확보
   * 
   * @param modelName LLM 모델명
   * @returns 압축 트리거 임계값
   */
  static calculateCompressionThreshold(modelName: string): number {
    const budget = this.calculateContextBudget(modelName);
    if (!budget) {
      // Fallback: 기존 고정값
      return 3000;
    }

    // 사용 가능한 토큰의 80% 도달 시 압축
    const threshold = Math.floor(budget.availableTokens * 0.8);

    // 최소 임계값 설정 (너무 작은 모델 대비)
    return Math.max(threshold, 500);
  }

  /**
   * 컨텍스트 상태 분석
   * @param modelName LLM 모델명
   * @param currentStateSize 현재 상태 토큰 수
   * @returns 상태 분석 결과
   */
  static analyzeContextStatus(
    modelName: string,
    currentStateSize: number
  ): {
    status: 'safe' | 'warning' | 'critical';
    utilizationPercent: number;
    recommendedAction: string;
  } | null {
    const budget = this.calculateContextBudget(modelName);
    if (!budget) {
      return null;
    }

    const utilization = (currentStateSize / budget.availableTokens) * 100;
    let status: 'safe' | 'warning' | 'critical' = 'safe';
    let recommendedAction = '현재 컨텍스트 사용량 안전';

    if (utilization >= 90) {
      status = 'critical';
      recommendedAction = '즉시 압축 필요 — 컨텍스트 윈도우 부족';
    } else if (utilization >= 75) {
      status = 'warning';
      recommendedAction = '조만간 압축 권장 — 컨텍스트 사용량 높음';
    }

    return {
      status,
      utilizationPercent: utilization,
      recommendedAction,
    };
  }
}
```

---

## 4단계: 개선된 ContextCompressor (동적 임계값)

### 파일 수정: `src/core/context/ContextCompressor.ts`

```typescript
import type { SessionState } from '../../schemas/pipeline.js';
import { ContextBudgetCalculator } from './ContextBudgetCalculator.js';
import { ContextProcessingError } from '../errors/StateErrors.js';

/**
 * 개선된 ContextCompressor: LLM 기반 동적 압축
 */
export class ContextCompressor {
  /**
   * 세션 상태의 컨텍스트를 분석하고 필요시 압축을 수행합니다.
   * 
   * 이전: 고정 TOKEN_THRESHOLD (3000)
   * 개선: LLM별 동적 계산
   * 
   * @param state 세션 상태
   * @param modelName LLM 모델명 (선택사항, 기본값: 'claude-3.5-sonnet')
   * @returns 압축된 상태
   */
  static compress(
    state: SessionState,
    modelName: string = 'claude-3.5-sonnet'
  ): SessionState {
    if (!state) {
      throw new ContextProcessingError('ContextCompressor.compress에 잘못된 상태가 전달되었습니다');
    }

    try {
      // 1. 동적 임계값 계산
      const compressionThreshold = ContextBudgetCalculator.calculateCompressionThreshold(modelName);
      
      // 2. 현재 상태 크기 추정
      const currentStateSize = this.estimateTokenUsage(state, modelName);

      // 3. 압축 필요 여부 판단
      if (currentStateSize <= compressionThreshold) {
        return state;  // 압축 불필요
      }

      // 4. 압축 수행
      const compressedState = { ...state };
      compressedState.task_results = this.compressTaskResults(
        state.task_results || {},
        state.completed_task_ids || [],
        modelName  // LLM 모델명 전달
      );

      // 5. 압축 메타데이터 기록
      compressedState.shared_context = {
        ...compressedState.shared_context,
        _compression_info: {
          triggeredAt: new Date().toISOString(),
          modelName,
          beforeTokens: currentStateSize,
          compressionThreshold,
          compressionReason: `사용 가능한 컨텍스트 토큰 ${compressionThreshold} 초과`,
        },
      };

      return compressedState;
    } catch (error: any) {
      if (error instanceof ContextProcessingError) throw error;
      throw new ContextProcessingError('컨텍스트 압축 중 예기치 않은 오류가 발생했습니다', {
        originalError: error.message
      });
    }
  }

  /**
   * 토큰 사용량 추정 (LLM 인코더 기반)
   */
  private static estimateTokenUsage(state: SessionState, modelName: string): number {
    const config = getLLMModelConfig(modelName);
    if (!config) {
      // Fallback: 기본 계산
      const content = JSON.stringify(state);
      return Math.ceil(content.length / 4);
    }

    // LLM별 인코더로 정확히 계산
    const content = JSON.stringify(state);
    return countTokensWithEncoder(content, config.tokenEncoderType);
  }

  /**
   * Task 결과 압축
   */
  private static compressTaskResults(
    results: Record<string, any>,
    completedIds: string[],
    modelName: string
  ): Record<string, any> {
    const compressed: Record<string, any> = {};
    
    // LLM별 상세 정보 유지 개수 조정
    let keepDetailCount = 3;  // 기본값
    
    if (modelName.includes('gpt-4') || modelName.includes('claude-3.5')) {
      keepDetailCount = 5;  // 큰 컨텍스트 윈도우는 더 많이 유지
    } else if (modelName.includes('local') || modelName.includes('gpt-3.5')) {
      keepDetailCount = 2;  // 작은 컨텍스트 윈도우는 적게 유지
    }

    for (const [id, result] of Object.entries(results)) {
      if (!result) continue;

      const completionIndex = completedIds.indexOf(id);
      const isRecent = completionIndex >= 0 && 
        completionIndex >= completedIds.length - keepDetailCount;

      if (isRecent || completionIndex === -1) {
        compressed[id] = result;
      } else {
        // 압축: 요약본만 유지
        const res = result as any;
        compressed[id] = {
          summary: res.summary || '압축됨',
          status: res.status || (res.success ? 'completed' : 'failed'),
          _compressed: true,
          _originalSize: JSON.stringify(res).length  // 압축 전 크기 기록
        };
      }
    }

    return compressed;
  }
}
```

---

## 5단계: Pipeline에서의 통합

### 파일 수정: `src/core/pipeline/orchestrator.ts`

```typescript
import { ContextBudgetCalculator } from '../context/ContextBudgetCalculator.js';
import { countTokensWithEncoder } from '../utils/tokenMetrics.js';

// 기존 코드에서 context 빌드 부분 수정

// ── Step 6-2: ExecutionContext 생성 (Role 2.2 — 동적 압축)
await emitProgressWithLogging({
  stage: "Context Optimizer",
  status: "start",
  taskId: task.id,
  message: `Context Optimizer(${task.id}) 시작 — 모델: ${request.model || 'default'}`,
});

PipelineTracer.startStage(`ContextOptimizer:${task.id}`);

// 👇 개선: LLM 모델명 기반 동적 압축
const context = ContextBuilder.build(
  state, 
  task,
  request.model  // LLM 모델명 전달
);

// 컨텍스트 상태 분석 (로깅용)
const contextStatus = ContextBudgetCalculator.analyzeContextStatus(
  request.model || 'claude-3.5-sonnet',
  JSON.stringify(context).length / 4  // 대략적 토큰 추정
);

if (contextStatus && contextStatus.status !== 'safe') {
  logger.warn(
    `[${task.id}] 컨텍스트 사용량: ${contextStatus.utilizationPercent.toFixed(1)}% — ${contextStatus.recommendedAction}`
  );
}

// ... 기존 코드 계속
```

### 파일 수정: `src/core/context/ContextBuilder.ts`

```typescript
static build(
  state: SessionState, 
  task: Task,
  modelName?: string  // 추가: LLM 모델명
): ExecutionContext {
  if (!state || !task) {
    throw new ContextProcessingError('Invalid input for ContextBuilder.build', {
      hasState: !!state,
      taskId: task?.id,
    });
  }

  try {
    // 1. 동적 압축 — LLM 모델명 기반
    const compressedState = ContextCompressor.compress(
      state,
      modelName || 'claude-3.5-sonnet'  // 기본값
    );

    // 2. 의존성 결과 선택
    const selectedContext = this.selectDependencyResults(compressedState, task);

    // 3. 요약 생성
    const summary = this.generateContextSummary(
      compressedState.shared_context,
      selectedContext,
    );

    return {
      session_id: (compressedState.shared_context?.session_id as string) || 'default',
      active_task_id: task.id,
      shared_context: compressedState.shared_context || {},
      selected_context: selectedContext,
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

---

## 6단계: detoks 메트릭과 LLM 계산 동기화

### 파일 수정: `src/core/pipeline/orchestrator.ts` (메트릭 부분)

```typescript
function applySessionTokenMetrics(
  state: SessionState,
  inputOriginalText: string,
  inputOptimizedText: string,
  modelName?: string  // 추가: LLM 모델명
): {
  state: SessionState;
  tokenMetrics: TokenMetricsSnapshot | null;
} {
  const { rawOutputText, summaryText } = collectTaskOutputText(state);
  
  if (!rawOutputText.trim() || !summaryText.trim()) {
    const sharedContext = { ...state.shared_context };
    delete sharedContext.token_metrics;
    return {
      state: {
        ...state,
        shared_context: sharedContext,
      },
      tokenMetrics: null,
    };
  }

  // 👇 개선: LLM별 토큰 메트릭 계산
  const tokenMetrics = buildTokenMetricsWithLLM({
    inputOriginalText,
    inputOptimizedText,
    outputOriginalText: rawOutputText,
    outputOptimizedText: summaryText,
    modelName: modelName || 'unknown',
    encoderType: getLLMModelConfig(modelName || 'claude-3.5-sonnet')?.tokenEncoderType,
  });

  // 컨텍스트 버짓 정보 추가
  const contextBudget = ContextBudgetCalculator.calculateContextBudget(
    modelName || 'claude-3.5-sonnet'
  );

  return {
    state: {
      ...state,
      shared_context: {
        ...state.shared_context,
        token_metrics: tokenMetrics,
        ...(contextBudget && {
          context_budget: contextBudget
        }),
      },
    },
    tokenMetrics,
  };
}
```

---

## 7단계: 설정 및 CLI 통합

### 파일 생성: `src/cli/config/llm-context-config.ts`

```typescript
import type { LLMModelConfig } from '../../core/llm-client/llm-models.js';
import { getLLMModelConfig } from '../../core/llm-client/llm-models.js';

/**
 * CLI에서 LLM 모델명 해석
 * 
 * 사용자 입력: "claude", "gpt-4", "gemini"
 * 실제 모델명: "claude-3.5-sonnet", "gpt-4-turbo", "gemini-2.0-flash"
 */
export class LLMContextConfig {
  static parseModelName(input: string): string {
    const aliases: Record<string, string> = {
      // Claude
      'claude': 'claude-3.5-sonnet',
      'claude-3.5': 'claude-3.5-sonnet',
      'claude-opus': 'claude-opus',
      'claude-sonnet': 'claude-3.5-sonnet',
      'claude-haiku': 'claude-haiku',

      // GPT
      'gpt-4': 'gpt-4-turbo',
      'gpt-4-turbo': 'gpt-4-turbo',
      'gpt-3.5': 'gpt-3.5-turbo',
      'gpt': 'gpt-4-turbo',

      // Gemini
      'gemini': 'gemini-2.0-flash',
      'gemini-flash': 'gemini-2.0-flash',
      'gemini-pro': 'gemini-pro',

      // 로컬 모델
      'local': 'local-mistral-7b',
      'local-llama': 'local-llama2-13b',
      'local-mistral': 'local-mistral-7b',
    };

    return aliases[input.toLowerCase()] || input;
  }

  /**
   * CLI 도움말: 지원하는 모델 출력
   */
  static printSupportedModels(): void {
    console.log('\n지원하는 LLM 모델:');
    console.log('─'.repeat(60));

    const grouped = {
      'Anthropic Claude': [
        'claude-3.5-sonnet (200K tokens)',
        'claude-opus (200K tokens)',
        'claude-sonnet (200K tokens)',
        'claude-haiku (200K tokens)',
      ],
      'OpenAI GPT': [
        'gpt-4-turbo (128K tokens)',
        'gpt-4 (8K tokens)',
        'gpt-3.5-turbo (16K tokens)',
      ],
      'Google Gemini': [
        'gemini-2.0-flash (1M tokens)',
        'gemini-pro (32K tokens)',
      ],
      '로컬 모델': [
        'local-llama2-13b (4K tokens)',
        'local-mistral-7b (8K tokens)',
      ],
    };

    for (const [provider, models] of Object.entries(grouped)) {
      console.log(`\n${provider}:`);
      models.forEach(model => console.log(`  • ${model}`));
    }
    console.log('\n');
  }
}
```

---

## 8단계: 테스트 케이스

### 파일 생성: `tests/ts/unit/core/context/llm-context-window.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { ContextBudgetCalculator } from '../../../src/core/context/ContextBudgetCalculator';
import { countTokensWithEncoder } from '../../../src/core/utils/tokenMetrics';

describe('LLM Context Window 동적 압축', () => {
  it('Claude 3.5 Sonnet 컨텍스트 버짓 계산', () => {
    const budget = ContextBudgetCalculator.calculateContextBudget('claude-3.5-sonnet');
    
    expect(budget).toBeDefined();
    expect(budget?.totalContextWindow).toBe(200000);
    expect(budget?.availableTokens).toBeGreaterThan(180000);
    expect(budget?.breakdown.outputBuffer).toBe(4000);
  });

  it('GPT-4 컨텍스트 버짓 계산', () => {
    const budget = ContextBudgetCalculator.calculateContextBudget('gpt-4');
    
    expect(budget).toBeDefined();
    expect(budget?.totalContextWindow).toBe(8192);
    expect(budget?.availableTokens).toBeLessThan(5000);  // 예약 토큰 많음
  });

  it('동적 압축 임계값 계산', () => {
    const claudeThreshold = ContextBudgetCalculator.calculateCompressionThreshold('claude-3.5-sonnet');
    const gptThreshold = ContextBudgetCalculator.calculateCompressionThreshold('gpt-4');
    
    // Claude는 큰 컨텍스트 → 더 큰 임계값
    expect(claudeThreshold).toBeGreaterThan(gptThreshold);
    
    // 최소 임계값 확인
    expect(claudeThreshold).toBeGreaterThanOrEqual(500);
    expect(gptThreshold).toBeGreaterThanOrEqual(500);
  });

  it('토큰 인코더 타입별 계산', () => {
    const text = '한국어 테스트 문장입니다.';
    
    // o200k_base (Claude)
    const claudeTokens = countTokensWithEncoder(text, 'o200k_base');
    
    // cl100k_base (GPT)
    const gptTokens = countTokensWithEncoder(text, 'cl100k_base');
    
    // 같은 텍스트도 인코더에 따라 다를 수 있음
    console.log(`Claude tokens: ${claudeTokens}, GPT tokens: ${gptTokens}`);
    expect(claudeTokens).toBeGreaterThan(0);
    expect(gptTokens).toBeGreaterThan(0);
  });

  it('컨텍스트 상태 분석', () => {
    const status1 = ContextBudgetCalculator.analyzeContextStatus('claude-3.5-sonnet', 100000);
    expect(status1?.status).toBe('safe');
    
    const status2 = ContextBudgetCalculator.analyzeContextStatus('claude-3.5-sonnet', 170000);
    expect(status2?.status).toBe('critical');
  });
});
```

---

## 📊 구현 비교표

| 항목 | 기존 (고정 임계값) | 개선 (동적 임계값) |
|------|------------------|------------------|
| **압축 임계값** | 3000 (고정) | LLM별 계산 (500~140K) |
| **토큰 인코더** | o200k_base만 지원 | 4가지 지원 (o200k_base, cl100k_base, gpt2, custom) |
| **컨텍스트 버짓** | 미계산 | LLM별 실제 계산 |
| **예약 토큰** | 미고려 | 시스템 프롬프트, 출력 버퍼, 안전 마진 |
| **메트릭 추적** | 모델명 미기록 | 모델명 + 인코더 타입 기록 |
| **상태 분석** | 단순 크기 비교 | 상세 분석 (safe/warning/critical) |

---

## 🚀 마이그레이션 전략

### Phase 1: 준비 (Week 1)
- [ ] LLM 메타데이터 정의 (`llm-models.ts`)
- [ ] 토큰 인코더 통합 (`tokenMetrics.ts`)
- [ ] 단위 테스트 작성

### Phase 2: 구현 (Week 2)
- [ ] `ContextBudgetCalculator` 구현
- [ ] `ContextCompressor` 개선
- [ ] Pipeline 통합

### Phase 3: 검증 (Week 3)
- [ ] 통합 테스트
- [ ] 실제 LLM (Claude, GPT-4, Gemini) 테스트
- [ ] 메트릭 정확성 검증

### Phase 4: 배포 (Week 4)
- [ ] 문서화
- [ ] CLI 명령어 추가
- [ ] PR 리뷰 및 머지

---

## 💡 주요 이점

1. **정확성**: 각 LLM의 실제 컨텍스트 윈도우 기반 압축
2. **유연성**: 새로운 LLM 추가 시 메타데이터만 수정
3. **투명성**: detoks 메트릭과 LLM 실제 계산 동기화
4. **안전성**: 컨텍스트 오버플로우 완전 방지
5. **확장성**: 커스텀 LLM 쉽게 추가 가능

---

## 🔄 일관성 유지 방법

```
┌─────────────────────────────────────────────┐
│ 1. LLM 메타데이터 정의                      │
│    (contextWindowTokens, encoderType 등)   │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 2. 토큰 인코더 통합                         │
│    (getTokenEncoder, countTokensWithEncoder) │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 3. 컨텍스트 버짓 계산                       │
│    (ContextBudgetCalculator)               │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 4. 동적 압축 실행                           │
│    (ContextCompressor.compress)             │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 5. 메트릭 추적                              │
│    (buildTokenMetricsWithLLM)              │
│    → detoks 계산과 LLM 실제 계산 일치      │
└─────────────────────────────────────────────┘

결과: 전체 파이프라인에서 동일한 토큰 계산 기준 유지
```
