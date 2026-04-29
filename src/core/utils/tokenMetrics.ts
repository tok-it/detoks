import { get_encoding } from "tiktoken";

export const TOKEN_METRIC_MODEL = "o200k_base" as const;

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

let _encoder: ReturnType<typeof get_encoding> | null = null;

function getEncoder() {
  if (!_encoder) {
    _encoder = get_encoding(TOKEN_METRIC_MODEL);
  }

  return _encoder;
}

export function countTokens(text: string): number {
  try {
    return getEncoder().encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
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

