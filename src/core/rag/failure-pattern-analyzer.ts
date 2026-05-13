import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface FailureStat {
  taskType: string;
  adapter: string;
  failCount: number;
  totalCount: number;
  failureRate: number;
}

export class FailurePatternAnalyzer {
  constructor(private readonly sessionsDir: string) {}

  async analyze(): Promise<FailureStat[]> {
    const matrix = new Map<string, { fail: number; total: number }>();

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
          shared_context?: { adapter?: string };
          task_results?: Record<string, { type?: string; success?: boolean }>;
        };
        const adapter = session.shared_context?.adapter ?? "unknown";

        for (const result of Object.values(session.task_results ?? {})) {
          const taskType = result.type ?? "UNKNOWN";
          const key = `${taskType}::${adapter}`;
          const entry = matrix.get(key) ?? { fail: 0, total: 0 };
          entry.total++;
          if (!result.success) entry.fail++;
          matrix.set(key, entry);
        }
      } catch {
        // skip
      }
    }

    return [...matrix.entries()]
      .map(([key, v]) => {
        const [taskType, adapter] = key.split("::") as [string, string];
        return {
          taskType,
          adapter,
          failCount: v.fail,
          totalCount: v.total,
          failureRate: v.total === 0 ? 0 : v.fail / v.total,
        };
      })
      .sort((a, b) => b.failureRate - a.failureRate);
  }

  async getWarning(
    taskType: string,
    adapter: string,
    threshold = 0.2,
  ): Promise<string | undefined> {
    const stats = await this.analyze();
    const entry = stats.find((s) => s.taskType === taskType && s.adapter === adapter);
    if (!entry || entry.failureRate < threshold) return undefined;
    const pct = Math.round(entry.failureRate * 100);
    return `⚠️ ${taskType} × ${adapter} 실패율 ${pct}% (${entry.failCount}/${entry.totalCount}건)`;
  }
}
