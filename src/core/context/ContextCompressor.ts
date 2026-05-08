import type { SessionState } from '../../schemas/pipeline.js';
import { ContextProcessingError } from '../errors/StateErrors.js';
import { ContextBudgetCalculator } from './ContextBudgetCalculator.js';
import { getLLMModelConfig } from '../llm-client/llm-models.js';
import { countTokensWithEncoder } from '../utils/tokenMetrics.js';

const DEFAULT_MODEL = 'claude-3.5-sonnet';

export class ContextCompressor {
  /**
   * 세션 상태의 컨텍스트를 분석하고 필요시 압축을 수행합니다.
   * modelName을 받아 LLM별 동적 임계값을 사용합니다. 기본값은 claude-3.5-sonnet.
   */
  static compress(state: SessionState, modelName: string = DEFAULT_MODEL): SessionState {
    if (!state) {
      throw new ContextProcessingError('ContextCompressor.compress에 잘못된 상태가 전달되었습니다');
    }

    try {
      const threshold = ContextBudgetCalculator.calculateCompressionThreshold(modelName);
      const currentStateSize = this.estimateTokenUsage(state, modelName);

      if (currentStateSize <= threshold) {
        return state;
      }

      const compressedState = { ...state };
      compressedState.task_results = this.compressTaskResults(
        state.task_results || {},
        state.completed_task_ids || [],
        modelName,
      );

      compressedState.last_summary = `[압축됨] ${state.last_summary || ''}`;

      return compressedState;
    } catch (error: any) {
      if (error instanceof ContextProcessingError) throw error;
      throw new ContextProcessingError('컨텍스트 압축 중 예기치 않은 오류가 발생했습니다', {
        originalError: error.message
      });
    }
  }

  private static compressTaskResults(
    results: Record<string, any>,
    completedIds: string[],
    modelName: string,
  ): Record<string, any> {
    const compressed: Record<string, any> = {};

    // 컨텍스트 윈도우가 클수록 상세 정보를 더 많이 유지
    const config = getLLMModelConfig(modelName);
    const contextWindow = config?.contextWindowTokens ?? 8192;
    const keepDetailCount = contextWindow >= 100000 ? 5 : contextWindow >= 16000 ? 3 : 2;

    for (const [id, result] of Object.entries(results)) {
      if (!result) continue;

      const completionIndex = completedIds.indexOf(id);
      const isRecent = completionIndex >= 0 && completionIndex >= completedIds.length - keepDetailCount;

      if (isRecent || completionIndex === -1) {
        compressed[id] = result;
      } else {
        const res = result as any;
        compressed[id] = {
          summary: res.summary || '압축 후에도 요약이 유지되었습니다',
          status: res.status || (res.success ? 'completed' : 'failed'),
          _compressed: true,
        };
      }
    }

    return compressed;
  }

  private static estimateTokenUsage(state: SessionState, modelName: string): number {
    try {
      const content = JSON.stringify(state);
      const encoderType = getLLMModelConfig(modelName)?.tokenEncoderType ?? 'o200k_base';
      return countTokensWithEncoder(content, encoderType);
    } catch (error: any) {
      throw new ContextProcessingError('Failed to estimate token usage - Serialization error', {
        originalError: error.message
      });
    }
  }

  /**
   * 강제 압축: 모든 Task 결과를 오래된 것으로 간주하여 요약본으로 전환합니다.
   */
  static forceCompress(state: SessionState): SessionState {
    if (!state || !state.task_results) {
      return state;
    }

    try {
      const compressed: Record<string, any> = {};

      for (const [id, result] of Object.entries(state.task_results)) {
        if (!result) continue;
        const res = result as any;
        compressed[id] = {
          summary: res.summary || '압축 후에도 요약이 유지되었습니다',
          status: res.status || (res.success ? 'completed' : 'failed'),
          _compressed: true
        };
      }

      return {
        ...state,
        task_results: compressed
      };
    } catch (error: any) {
      throw new ContextProcessingError('Failed to force compress state', {
        originalError: error.message
      });
    }
  }
}
