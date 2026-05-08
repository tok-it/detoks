import { get_encoding } from "tiktoken";

export const TOKEN_METRIC_MODEL = "o200k_base" as const;

type SupportedEncoderType = 'o200k_base' | 'cl100k_base' | 'gpt2';
type TiktokenEncoder = ReturnType<typeof get_encoding>;

const encoderCache = new Map<string, TiktokenEncoder>();

export function getTokenEncoder(encoderType: SupportedEncoderType): TiktokenEncoder {
  const cached = encoderCache.get(encoderType);
  if (cached) return cached;

  try {
    const encoder = get_encoding(encoderType);
    encoderCache.set(encoderType, encoder);
    return encoder;
  } catch {
    // 지원하지 않는 인코더 타입은 기본값으로 대체
    const fallback = get_encoding('o200k_base');
    encoderCache.set(encoderType, fallback);
    return fallback;
  }
}

export function countTokensWithEncoder(
  text: string,
  encoderType: SupportedEncoderType = 'o200k_base',
): number {
  try {
    return getTokenEncoder(encoderType).encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

export interface TokenReductionSnapshot {
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  savedPercent: number;
}

export interface TokenMetricsSnapshot {
  model: typeof TOKEN_METRIC_MODEL;
  input: TokenReductionSnapshot;
  output: TokenReductionSnapshot;
}

export function countTokens(text: string): number {
  return countTokensWithEncoder(text, TOKEN_METRIC_MODEL);
}

function buildReduction(
  originalText: string,
  optimizedText: string,
): TokenReductionSnapshot {
  const originalTokens = countTokens(originalText);
  const optimizedTokens = countTokens(optimizedText);
  const savedTokens = Math.max(0, originalTokens - optimizedTokens);

  return {
    originalTokens,
    optimizedTokens,
    savedTokens,
    savedPercent:
      originalTokens > 0 ? (savedTokens / originalTokens) * 100 : 0,
  };
}

export function buildTokenMetrics(options: {
  inputOriginalText: string;
  inputOptimizedText: string;
  outputOriginalText: string;
  outputOptimizedText: string;
}): TokenMetricsSnapshot {
  return {
    model: TOKEN_METRIC_MODEL,
    input: buildReduction(
      options.inputOriginalText,
      options.inputOptimizedText,
    ),
    output: buildReduction(
      options.outputOriginalText,
      options.outputOptimizedText,
    ),
  };
}

export function isTokenReductionSnapshot(
  value: unknown,
): value is TokenReductionSnapshot {
  return !!value && typeof value === "object"
    && typeof (value as TokenReductionSnapshot).originalTokens === "number"
    && typeof (value as TokenReductionSnapshot).optimizedTokens === "number"
    && typeof (value as TokenReductionSnapshot).savedTokens === "number"
    && typeof (value as TokenReductionSnapshot).savedPercent === "number";
}

export function isTokenMetricsSnapshot(
  value: unknown,
): value is TokenMetricsSnapshot {
  return !!value
    && typeof value === "object"
    && (value as TokenMetricsSnapshot).model === TOKEN_METRIC_MODEL
    && isTokenReductionSnapshot((value as TokenMetricsSnapshot).input)
    && isTokenReductionSnapshot((value as TokenMetricsSnapshot).output);
}

const formatCount = (value: number): string => value.toLocaleString("ko-KR");

export function formatTokenReductionSnapshot(
  reduction: TokenReductionSnapshot,
): string {
  return [
    `${formatCount(reduction.originalTokens)}토큰`,
    `→ ${formatCount(reduction.optimizedTokens)}토큰`,
    `(절감 ${formatCount(reduction.savedTokens)}토큰, ${reduction.savedPercent.toFixed(1)}%)`,
  ].join(" ");
}

