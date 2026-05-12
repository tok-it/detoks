import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface CacheStats {
  totalSessions: number;
  f1Eligible: number;
  f2Eligible: number;
  expiredSessions: number;
  ttlDays: number;
}

export const getCacheStats = async (sessionsDir: string, ttlDays: number): Promise<CacheStats> => {
  const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
  const stats: CacheStats = { totalSessions: 0, f1Eligible: 0, f2Eligible: 0, expiredSessions: 0, ttlDays };

  let files: string[];
  try {
    files = await readdir(sessionsDir);
  } catch {
    return stats;
  }

  for (const file of files) {
    if (!file.endsWith(".json") || file.endsWith(".tmp.json")) continue;

    try {
      const raw = await readFile(join(sessionsDir, file), "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;

      stats.totalSessions++;

      const ctx = data.shared_context as Record<string, unknown> | undefined;
      if (ctx?.raw_input_hash) stats.f1Eligible++;

      const taskResults = data.task_results as Record<string, Record<string, unknown>> | undefined;
      if (taskResults) {
        for (const tr of Object.values(taskResults)) {
          if (tr.input_hash) {
            stats.f2Eligible++;
          }
        }
      }

      const updatedAt = data.updated_at as string | undefined;
      if (updatedAt && new Date(updatedAt).getTime() < cutoff) {
        stats.expiredSessions++;
      }
    } catch {
      continue;
    }
  }

  return stats;
};

export const clearExpiredSessions = async (sessionsDir: string, ttlDays: number): Promise<number> => {
  const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
  let removed = 0;

  let files: string[];
  try {
    files = await readdir(sessionsDir);
  } catch {
    return 0;
  }

  for (const file of files) {
    if (!file.endsWith(".json") || file.endsWith(".tmp.json")) continue;

    try {
      const raw = await readFile(join(sessionsDir, file), "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const updatedAt = data.updated_at as string | undefined;

      if (updatedAt && new Date(updatedAt).getTime() < cutoff) {
        await unlink(join(sessionsDir, file));
        removed++;
      }
    } catch {
      continue;
    }
  }

  return removed;
};

export const formatCacheStats = (stats: CacheStats, cacheDisabled: boolean): string => {
  const status = cacheDisabled ? "비활성 (이 세션에서 캐시 우회 중)" : "활성";
  const lines = [
    `캐시 상태: ${status}`,
    `TTL: ${stats.ttlDays}일`,
    ``,
    `세션 파일 통계:`,
    `  전체 세션      : ${stats.totalSessions}개`,
    `  F1 캐시 대상   : ${stats.f1Eligible}개  (raw_input_hash 보유)`,
    `  F2 캐시 대상   : ${stats.f2Eligible}개  (task input_hash 보유)`,
    `  만료된 세션    : ${stats.expiredSessions}개  (TTL ${stats.ttlDays}일 초과)`,
    ``,
    `  /cache clear   — 만료된 세션 삭제`,
    `  /cache disable — 이 세션에서 캐시 우회`,
    `  /cache enable  — 캐시 다시 활성화`,
  ];
  return lines.join("\n") + "\n";
};
