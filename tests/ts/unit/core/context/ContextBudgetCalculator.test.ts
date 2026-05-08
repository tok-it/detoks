import { describe, it, expect } from 'vitest';
import { ContextBudgetCalculator } from '../../../../../src/core/context/ContextBudgetCalculator.js';

describe('calculateContextBudget', () => {
  it('Claude 3.5 Sonnet 버짓을 올바르게 계산한다', () => {
    const budget = ContextBudgetCalculator.calculateContextBudget('claude-3.5-sonnet');
    expect(budget).not.toBeNull();
    expect(budget!.totalContextWindow).toBe(200000);
    // 예약 = 500 + 4000 + 500 = 5000
    expect(budget!.reservedTokens).toBe(5000);
    expect(budget!.availableTokens).toBe(195000);
    expect(budget!.breakdown.outputBuffer).toBe(4000);
  });

  it('GPT-4 (소형 컨텍스트) 버짓을 올바르게 계산한다', () => {
    const budget = ContextBudgetCalculator.calculateContextBudget('gpt-4');
    expect(budget).not.toBeNull();
    expect(budget!.totalContextWindow).toBe(8192);
    // 예약 = 300 + 2000 + 500 = 2800
    expect(budget!.availableTokens).toBe(8192 - 2800);
  });

  it('미지원 모델이면 null을 반환한다', () => {
    expect(ContextBudgetCalculator.calculateContextBudget('unknown-model')).toBeNull();
  });

  it('시스템 프롬프트를 직접 전달하면 실제 토큰 수를 반영한다', () => {
    const shortPrompt = 'You are a helpful assistant.';
    const budget = ContextBudgetCalculator.calculateContextBudget('claude-3.5-sonnet', shortPrompt);
    expect(budget).not.toBeNull();
    // 짧은 시스템 프롬프트이므로 기본 예약값(500)보다 available이 많아야 함
    expect(budget!.availableTokens).toBeGreaterThan(190000);
  });
});

describe('calculateCompressionThreshold', () => {
  it('Claude는 GPT-4보다 큰 임계값을 갖는다', () => {
    const claudeThreshold = ContextBudgetCalculator.calculateCompressionThreshold('claude-3.5-sonnet');
    const gpt4Threshold = ContextBudgetCalculator.calculateCompressionThreshold('gpt-4');
    expect(claudeThreshold).toBeGreaterThan(gpt4Threshold);
  });

  it('임계값이 available 토큰의 80%다', () => {
    const budget = ContextBudgetCalculator.calculateContextBudget('claude-3.5-sonnet')!;
    const threshold = ContextBudgetCalculator.calculateCompressionThreshold('claude-3.5-sonnet');
    expect(threshold).toBe(Math.floor(budget.availableTokens * 0.8));
  });

  it('미지원 모델이면 기존 고정값 3000을 반환한다', () => {
    expect(ContextBudgetCalculator.calculateCompressionThreshold('unknown-model')).toBe(3000);
  });

  it('최솟값은 500이다', () => {
    // gpt-4: 8192 - 2800 = 5392 → 5392*0.8 = 4313 > 500
    const threshold = ContextBudgetCalculator.calculateCompressionThreshold('gpt-4');
    expect(threshold).toBeGreaterThanOrEqual(500);
  });
});

describe('analyzeContextStatus', () => {
  it('사용률 50% 미만은 safe다', () => {
    const result = ContextBudgetCalculator.analyzeContextStatus('claude-3.5-sonnet', 90000);
    expect(result!.status).toBe('safe');
  });

  it('사용률 75~90% 구간은 warning이다', () => {
    const budget = ContextBudgetCalculator.calculateContextBudget('claude-3.5-sonnet')!;
    const warningTokens = Math.floor(budget.availableTokens * 0.80);
    const result = ContextBudgetCalculator.analyzeContextStatus('claude-3.5-sonnet', warningTokens);
    expect(result!.status).toBe('warning');
  });

  it('사용률 90% 이상은 critical이다', () => {
    const budget = ContextBudgetCalculator.calculateContextBudget('claude-3.5-sonnet')!;
    const criticalTokens = Math.floor(budget.availableTokens * 0.95);
    const result = ContextBudgetCalculator.analyzeContextStatus('claude-3.5-sonnet', criticalTokens);
    expect(result!.status).toBe('critical');
  });

  it('미지원 모델이면 null을 반환한다', () => {
    expect(ContextBudgetCalculator.analyzeContextStatus('unknown', 1000)).toBeNull();
  });
});
