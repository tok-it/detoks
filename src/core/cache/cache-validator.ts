import type { SessionState } from "../../schemas/pipeline.js";
import { CACHE_TTL_DAYS } from "./cache-config.js";

// "auto"   → 모든 조건 통과, 즉시 캐시 반환
// "advise" → adapter·git HEAD 불일치 등 — 결과 반환 X, 구 세션 기록으로만 취급
// "skip"   → 검증 실패, miss 처리
export type CacheValidity = "auto" | "advise" | "skip";

export interface CacheValidationOpts {
  project_id?: string;
  recencyDays?: number;
  expected_adapter?: string;
  expected_adapter_model?: string;
  expected_git_head?: string;
}

export function isSessionCacheValid(
  session: SessionState,
  opts: CacheValidationOpts = {},
): CacheValidity {
  const { project_id, recencyDays = CACHE_TTL_DAYS, expected_adapter, expected_git_head } = opts;

  if (project_id && session.shared_context.project_id !== project_id) return "skip";

  const failedIds = (session.shared_context.failed_task_ids as string[] | undefined) ?? [];
  if (failedIds.length > 0) return "skip";

  if (session.completed_task_ids.length === 0) return "skip";

  if (session.updated_at) {
    const cutoff = Date.now() - recencyDays * 24 * 60 * 60 * 1000;
    if (new Date(session.updated_at).getTime() < cutoff) return "skip";
  }

  // 구 세션(stamp 필드 없음)은 adapter/git_head 필드 자체가 없으므로 비교 없이 통과
  const ctx = session.shared_context as Record<string, unknown>;
  if (expected_adapter && ctx.adapter && ctx.adapter !== expected_adapter) return "advise";
  if (expected_git_head && ctx.git_head && ctx.git_head !== expected_git_head) return "advise";

  return "auto";
}

export function deriveAdviseReasons(
  ctx: Record<string, unknown>,
  opts: Pick<CacheValidationOpts, "expected_adapter" | "expected_git_head">,
): string[] {
  const reasons: string[] = [];
  if (opts.expected_adapter && ctx.adapter && ctx.adapter !== opts.expected_adapter) {
    reasons.push(`adapter 불일치: 저장 ${String(ctx.adapter)} → 현재 ${opts.expected_adapter}`);
  }
  if (opts.expected_git_head && ctx.git_head && ctx.git_head !== opts.expected_git_head) {
    const stored = String(ctx.git_head).slice(0, 7);
    const current = opts.expected_git_head.slice(0, 7);
    reasons.push(`git HEAD 변경: ${stored} → ${current}`);
  }
  return reasons;
}

export function isTaskCacheValid(
  taskResult: Record<string, unknown>,
  opts: CacheValidationOpts = {},
): CacheValidity {
  const { recencyDays = CACHE_TTL_DAYS, expected_adapter, expected_git_head } = opts;

  if (taskResult.success !== true) return "skip";

  if (typeof taskResult.completed_at === "string") {
    const cutoff = Date.now() - recencyDays * 24 * 60 * 60 * 1000;
    if (new Date(taskResult.completed_at).getTime() < cutoff) return "skip";
  }

  // 구 세션(stamp 필드 없음)은 비교 없이 통과
  if (expected_adapter && taskResult.adapter && taskResult.adapter !== expected_adapter) return "advise";
  if (expected_git_head && taskResult.git_head && taskResult.git_head !== expected_git_head) return "advise";

  return "auto";
}
