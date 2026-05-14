import { countTokens } from "./tokenMetrics.js";

// Token Safety Rule: net = saved_by_cache - added_by_rag - added_by_hints - added_by_compression
// net이 음수일 수 있다는 사실을 명시적으로 인정하는 구조.

export interface TokenAccounting {
  tokensSavedByCache: number;
  tokensAddedByRagContext: number;
  tokensAddedByPatternHints: number;
  tokensAddedByCompression: number;
  netTokensSaved: number;
}

export interface CostAccounting {
  costSavedUsd: number;
  costAddedUsd: number;
  compressionCostUsd: number;
  netCostSavedUsd: number;
}

export interface LightQualityCounters {
  ragContextInjected: boolean;
  cacheHitRate: number;
}

export function computeNetTokens(
  saved: number,
  addedRag: number,
  addedHints = 0,
  addedCompression = 0,
): TokenAccounting {
  return {
    tokensSavedByCache: saved,
    tokensAddedByRagContext: addedRag,
    tokensAddedByPatternHints: addedHints,
    tokensAddedByCompression: addedCompression,
    netTokensSaved: saved - addedRag - addedHints - addedCompression,
  };
}

export function countRagContextTokens(ragContextText: string): number {
  if (!ragContextText) return 0;
  return countTokens(ragContextText);
}
