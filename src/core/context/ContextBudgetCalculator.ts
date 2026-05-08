import { getLLMModelConfig } from '../llm-client/llm-models.js';
import { countTokensWithEncoder } from '../utils/tokenMetrics.js';

export class ContextBudgetCalculator {
  /**
   * LLM별 실제 사용 가능한 토큰 버짓 계산
   *
   * availableTokens = contextWindowTokens
   *                 - systemPromptTokens
   *                 - outputBufferTokens
   *                 - safetyMarginTokens
   */
  static calculateContextBudget(
    modelName: string,
    currentSystemPrompt?: string,
  ): {
    totalContextWindow: number;
    reservedTokens: number;
    availableTokens: number;
    breakdown: { systemPrompt: number; outputBuffer: number; safetyMargin: number };
  } | null {
    const config = getLLMModelConfig(modelName);
    if (!config) return null;

    const systemPromptTokens = currentSystemPrompt
      ? countTokensWithEncoder(currentSystemPrompt, config.tokenEncoderType)
      : config.reservedTokens.systemPrompt;

    const totalReserved =
      systemPromptTokens +
      config.reservedTokens.outputBuffer +
      config.reservedTokens.safetyMargin;

    return {
      totalContextWindow: config.contextWindowTokens,
      reservedTokens: totalReserved,
      availableTokens: Math.max(0, config.contextWindowTokens - totalReserved),
      breakdown: {
        systemPrompt: systemPromptTokens,
        outputBuffer: config.reservedTokens.outputBuffer,
        safetyMargin: config.reservedTokens.safetyMargin,
      },
    };
  }

  /**
   * 동적 압축 임계값 계산
   * 사용 가능한 토큰의 80% 도달 시 압축 트리거. 미지원 모델은 고정값 3000 반환.
   */
  static calculateCompressionThreshold(modelName: string): number {
    const budget = this.calculateContextBudget(modelName);
    if (!budget) return 3000;
    return Math.max(Math.floor(budget.availableTokens * 0.8), 500);
  }

  /**
   * 현재 상태의 컨텍스트 사용률 분석
   */
  static analyzeContextStatus(
    modelName: string,
    currentStateTokens: number,
  ): {
    status: 'safe' | 'warning' | 'critical';
    utilizationPercent: number;
    recommendedAction: string;
  } | null {
    const budget = this.calculateContextBudget(modelName);
    if (!budget) return null;

    const utilization = (currentStateTokens / budget.availableTokens) * 100;

    if (utilization >= 90) {
      return { status: 'critical', utilizationPercent: utilization, recommendedAction: '즉시 압축 필요 — 컨텍스트 윈도우 부족' };
    }
    if (utilization >= 75) {
      return { status: 'warning', utilizationPercent: utilization, recommendedAction: '조만간 압축 권장 — 컨텍스트 사용량 높음' };
    }
    return { status: 'safe', utilizationPercent: utilization, recommendedAction: '현재 컨텍스트 사용량 안전' };
  }
}
