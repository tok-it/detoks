import { describe, it, expect } from 'vitest';
import {
  LLM_MODELS,
  getLLMModelConfig,
  getAvailableModels,
} from '../../../../../src/core/llm-client/llm-models.js';

describe('LLM_MODELS', () => {
  it('모든 모델이 필수 필드를 갖는다', () => {
    for (const [key, config] of Object.entries(LLM_MODELS)) {
      expect(config.modelName, `${key}: modelName`).toBeTruthy();
      expect(config.contextWindowTokens, `${key}: contextWindowTokens`).toBeGreaterThan(0);
      expect(config.tokenEncoderType, `${key}: tokenEncoderType`).toBeTruthy();
      expect(config.reservedTokens.systemPrompt, `${key}: systemPrompt`).toBeGreaterThanOrEqual(0);
      expect(config.reservedTokens.outputBuffer, `${key}: outputBuffer`).toBeGreaterThan(0);
      expect(config.reservedTokens.safetyMargin, `${key}: safetyMargin`).toBeGreaterThanOrEqual(0);
    }
  });

  it('예약 토큰 합계가 컨텍스트 윈도우보다 작다', () => {
    for (const [key, config] of Object.entries(LLM_MODELS)) {
      const total =
        config.reservedTokens.systemPrompt +
        config.reservedTokens.outputBuffer +
        config.reservedTokens.safetyMargin;
      expect(total, `${key}: reserved < contextWindow`).toBeLessThan(config.contextWindowTokens);
    }
  });
});

describe('getLLMModelConfig', () => {
  it('등록된 모델명이면 설정을 반환한다', () => {
    const config = getLLMModelConfig('claude-3.5-sonnet');
    expect(config).not.toBeNull();
    expect(config!.contextWindowTokens).toBe(200000);
    expect(config!.provider).toBe('anthropic');
  });

  it('미등록 모델명이면 null을 반환한다', () => {
    expect(getLLMModelConfig('gpt-99')).toBeNull();
    expect(getLLMModelConfig('')).toBeNull();
  });

  it('Gemini 모델 설정이 올바르다', () => {
    const gemini = getLLMModelConfig('gemini-2.0-flash');
    expect(gemini).not.toBeNull();
    expect(gemini!.provider).toBe('google');
    expect(gemini!.contextWindowTokens).toBe(1000000);
  });
});

describe('getAvailableModels', () => {
  it('Claude, GPT, Gemini 모델을 모두 포함한다', () => {
    const models = getAvailableModels();
    expect(models).toContain('claude-3.5-sonnet');
    expect(models).toContain('gpt-4-turbo');
    expect(models).toContain('gemini-2.0-flash');
  });
});
