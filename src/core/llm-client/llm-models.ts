export interface LLMModelConfig {
  modelName: string;
  provider: 'anthropic' | 'openai' | 'google';
  contextWindowTokens: number;
  tokenEncoderType: 'o200k_base' | 'cl100k_base' | 'approximate';
  reservedTokens: {
    systemPrompt: number;
    outputBuffer: number;
    safetyMargin: number;
  };
  maxBatchInputTokens?: number;
}

export const LLM_MODELS: Record<string, LLMModelConfig> = {
  // ── Anthropic Claude
  'claude-3.5-sonnet': {
    modelName: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    contextWindowTokens: 200000,
    tokenEncoderType: 'o200k_base',
    reservedTokens: { systemPrompt: 500, outputBuffer: 4000, safetyMargin: 500 },
    maxBatchInputTokens: 180000,
  },
  'claude-opus': {
    modelName: 'claude-3-opus-20250514',
    provider: 'anthropic',
    contextWindowTokens: 200000,
    tokenEncoderType: 'o200k_base',
    reservedTokens: { systemPrompt: 500, outputBuffer: 4000, safetyMargin: 500 },
    maxBatchInputTokens: 180000,
  },
  'claude-haiku': {
    modelName: 'claude-3-haiku-20240307',
    provider: 'anthropic',
    contextWindowTokens: 200000,
    tokenEncoderType: 'o200k_base',
    reservedTokens: { systemPrompt: 300, outputBuffer: 1000, safetyMargin: 200 },
    maxBatchInputTokens: 180000,
  },

  // ── OpenAI GPT
  'gpt-4-turbo': {
    modelName: 'gpt-4-turbo-preview',
    provider: 'openai',
    contextWindowTokens: 128000,
    tokenEncoderType: 'cl100k_base',
    reservedTokens: { systemPrompt: 500, outputBuffer: 4000, safetyMargin: 1000 },
  },
  'gpt-4': {
    modelName: 'gpt-4',
    provider: 'openai',
    contextWindowTokens: 8192,
    tokenEncoderType: 'cl100k_base',
    reservedTokens: { systemPrompt: 300, outputBuffer: 2000, safetyMargin: 500 },
  },
  'gpt-3.5-turbo': {
    modelName: 'gpt-3.5-turbo',
    provider: 'openai',
    contextWindowTokens: 16385,
    tokenEncoderType: 'cl100k_base',
    reservedTokens: { systemPrompt: 200, outputBuffer: 1000, safetyMargin: 300 },
  },

  // ── Google Gemini
  'gemini-2.0-flash': {
    modelName: 'gemini-2.0-flash',
    provider: 'google',
    contextWindowTokens: 1000000,
    tokenEncoderType: 'approximate',
    reservedTokens: { systemPrompt: 500, outputBuffer: 8000, safetyMargin: 1000 },
  },
  'gemini-pro': {
    modelName: 'gemini-pro',
    provider: 'google',
    contextWindowTokens: 32768,
    tokenEncoderType: 'approximate',
    reservedTokens: { systemPrompt: 300, outputBuffer: 2000, safetyMargin: 500 },
  },

};

export function getLLMModelConfig(modelName: string): LLMModelConfig | null {
  return LLM_MODELS[modelName] ?? null;
}

export function getAvailableModels(): string[] {
  return Object.keys(LLM_MODELS);
}
