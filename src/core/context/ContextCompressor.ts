import type { SessionState, TaskResult } from '../../schemas/pipeline.js';
import { ContextProcessingError } from '../errors/StateErrors.js';

/**
 * ContextCompressor
 * 컨텍스트 과부하 시 정보를 압축하고 최적화합니다.
 * .gemini/skill.md의 'Automatic Compression' 및 'Minimal Information' 원칙을 수행합니다.
 *
 * 임계값 정책:
 * - 데이터 기반 동적 계산 (docs/COMPRESSION_THRESHOLD_ANALYSIS.md 참고)
 * - 어댑터별 context window 고려
 * - 50% 안전 마진 + 15K 오버헤드 적용
 */

interface CompressionPolicy {
  adapter: string;
  contextWindow: number;
  safeMargin: number;
  systemOverhead: number;
}

const COMPRESSION_POLICIES: Record<string, CompressionPolicy> = {
  gemini: {
    adapter: 'gemini',
    contextWindow: 1_000_000,
    safeMargin: 0.5,
    systemOverhead: 15_000,
  },
  claude: {
    adapter: 'claude',
    contextWindow: 1_000_000,
    safeMargin: 0.5,
    systemOverhead: 15_000,
  },
  haiku: {
    adapter: 'haiku',
    contextWindow: 200_000,
    safeMargin: 0.5,
    systemOverhead: 15_000,
  },
  codex: {
    adapter: 'codex',
    contextWindow: 400_000,
    safeMargin: 0.5,
    systemOverhead: 15_000,
  },
};

export class ContextCompressor {
  private static readonly DEFAULT_TOKEN_THRESHOLD = 85_000; // Claude Haiku 기준 (최소값)

  /**
   * 동적 임계값을 계산합니다.
   * context_window * 0.5 (50% 안전 마진) - 15K (시스템 오버헤드)
   */
  private static calculateTokenThreshold(adapter: string = 'gemini'): number {
    const policy = COMPRESSION_POLICIES[adapter] || COMPRESSION_POLICIES.gemini;
    const safeContext = policy.contextWindow * policy.safeMargin;
    const threshold = safeContext - policy.systemOverhead;
    return Math.max(threshold, this.DEFAULT_TOKEN_THRESHOLD);
  }

  /**
   * 세션 상태의 컨텍스트를 분석하고 필요시 압축을 수행합니다.
   * @param state 세션 상태
   * @param adapter 현재 사용 중인 어댑터 (기본값: gemini)
   */
  static compress(state: SessionState, adapter: string = 'gemini'): SessionState {
    if (!state) {
      throw new ContextProcessingError('Invalid state provided to ContextCompressor.compress');
    }

    try {
      const currentStateSize = this.estimateTokenUsage(state);
      const tokenThreshold = this.calculateTokenThreshold(adapter);

      if (currentStateSize <= tokenThreshold) {
        return state;
      }

      // 압축 로직 수행
      const compressedState = { ...state };
      compressedState.task_results = this.compressTaskResults(
        state.task_results || {}, 
        state.completed_task_ids || []
      );
      
      // 마지막 요약(last_summary) 업데이트 (선택 사항)
      compressedState.last_summary = `[Compressed] ${state.last_summary || ''}`;

      return compressedState;
    } catch (error: any) {
      if (error instanceof ContextProcessingError) throw error;
      throw new ContextProcessingError('Unexpected failure during context compression', {
        originalError: error.message
      });
    }
  }

  /**
   * Task 결과들을 압축합니다.
   * 오래된 결과일수록 더 공격적으로 정보를 제거합니다.
   */
  private static compressTaskResults(
    results: Record<string, TaskResult>, 
    completedIds: string[]
  ): Record<string, TaskResult> {
    const compressed: Record<string, TaskResult> = {};
    const keepDetailCount = 3; // 최근 3개 작업만 상세 정보 유지

    // 전체 결과에 대해 루프를 돌며 압축 여부 결정
    for (const [id, result] of Object.entries(results)) {
      if (!result) continue;

      const completionIndex = completedIds.indexOf(id);
      const isRecent = completionIndex >= 0 && completionIndex >= completedIds.length - keepDetailCount;

      if (isRecent || completionIndex === -1) {
        // 최근 작업이거나 아직 완료되지 않은 작업은 데이터 유지
        compressed[id] = result;
      } else {
        // 오래된 완료 작업은 압축
        const compressedResult: any = {
          summary: result.summary || 'Summary preserved after compression',
          status: 'success' in result && result.success ? 'completed' : 'failed',
          _compressed: true
        };

        // type 필드 보존 (P1 개선안)
        if ('type' in result && result.type) {
          compressedResult.type = result.type;
        }

        // success 필드 보존
        if ('success' in result) {
          compressedResult.success = result.success;
        }

        compressed[id] = compressedResult;
      }
    }

    return compressed;
  }

  /**
   * 현재 상태의 대략적인 토큰 사용량을 추정합니다.
   * (실제 토큰 계산기 라이브러리 연동 전 임시 글자 수 기반 계산)
   */
  private static estimateTokenUsage(state: SessionState): number {
    try {
      const content = JSON.stringify(state);
      return Math.ceil(content.length / 4); // 대략적인 글자당 토큰 비율
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
      const compressed: Record<string, TaskResult> = {};
      
      for (const [id, result] of Object.entries(state.task_results)) {
        if (!result) continue;
        const compressedResult: any = {
          summary: result.summary || 'Summary preserved after compression',
          status: 'success' in result && result.success ? 'completed' : 'failed',
          _compressed: true
        };

        // type 필드 보존 (P1 개선안)
        if ('type' in result && result.type) {
          compressedResult.type = result.type;
        }

        // success 필드 보존
        if ('success' in result) {
          compressedResult.success = result.success;
        }

        compressed[id] = compressedResult;
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
