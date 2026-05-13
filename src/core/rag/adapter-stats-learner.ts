import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface AdapterStat {
  adapter: string;
  sessionCount: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgReductionRatio: number;
}

export interface BudgetEstimate {
  adapter: string;
  estimatedInputTokens: number;
  estimatedReductionRatio: number;
}

interface TokenMetrics {
  input_original_tokens?: number;
  output_original_tokens?: number;
  reduction_ratio?: number;
}

export class AdapterStatsLearner {
  constructor(private readonly sessionsDir: string) {}

  async learn(): Promise<AdapterStat[]> {
    const acc = new Map<string, { inputSum: number; outputSum: number; ratioSum: number; count: number }>();

    let files: string[];
    try {
      files = await readdir(this.sessionsDir);
    } catch {
      return [];
    }

    for (const file of files) {
      if (!file.endsWith(".json") || file.endsWith(".tmp.json")) continue;
      try {
        const raw = await readFile(join(this.sessionsDir, file), "utf-8");
        const session = JSON.parse(raw) as {
          shared_context?: { adapter?: string; token_metrics?: TokenMetrics | null };
        };
        const adapter = session.shared_context?.adapter;
        const metrics = session.shared_context?.token_metrics;
        if (!adapter || !metrics) continue;

        const entry = acc.get(adapter) ?? { inputSum: 0, outputSum: 0, ratioSum: 0, count: 0 };
        entry.inputSum += metrics.input_original_tokens ?? 0;
        entry.outputSum += metrics.output_original_tokens ?? 0;
        entry.ratioSum += metrics.reduction_ratio ?? 0;
        entry.count++;
        acc.set(adapter, entry);
      } catch { /* skip */ }
    }

    return [...acc.entries()]
      .map(([adapter, v]) => ({
        adapter,
        sessionCount: v.count,
        avgInputTokens: v.count === 0 ? 0 : v.inputSum / v.count,
        avgOutputTokens: v.count === 0 ? 0 : v.outputSum / v.count,
        avgReductionRatio: v.count === 0 ? 0 : v.ratioSum / v.count,
      }))
      .sort((a, b) => b.sessionCount - a.sessionCount);
  }

  async estimateBudget(adapter: string): Promise<BudgetEstimate | undefined> {
    const stats = await this.learn();
    const entry = stats.find((s) => s.adapter === adapter);
    if (!entry) return undefined;
    return {
      adapter,
      estimatedInputTokens: entry.avgInputTokens,
      estimatedReductionRatio: entry.avgReductionRatio,
    };
  }
}
