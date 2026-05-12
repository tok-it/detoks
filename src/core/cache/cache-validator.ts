import type { SessionState } from "../../schemas/pipeline.js";
import { CACHE_TTL_DAYS } from "./cache-config.js";

export interface CacheValidationOpts {
  project_id?: string;
  recencyDays?: number;
}

export function isSessionCacheValid(
  session: SessionState,
  opts: CacheValidationOpts = {},
): boolean {
  const { project_id, recencyDays = CACHE_TTL_DAYS } = opts;

  if (project_id && session.shared_context.project_id !== project_id) return false;

  const failedIds = (session.shared_context.failed_task_ids as string[] | undefined) ?? [];
  if (failedIds.length > 0) return false;

  if (session.completed_task_ids.length === 0) return false;

  if (session.updated_at) {
    const cutoff = Date.now() - recencyDays * 24 * 60 * 60 * 1000;
    if (new Date(session.updated_at).getTime() < cutoff) return false;
  }

  return true;
}

export function isTaskCacheValid(
  taskResult: Record<string, unknown>,
  opts: CacheValidationOpts = {},
): boolean {
  const { recencyDays = CACHE_TTL_DAYS } = opts;

  if (taskResult.success !== true) return false;

  if (typeof taskResult.completed_at === "string") {
    const cutoff = Date.now() - recencyDays * 24 * 60 * 60 * 1000;
    if (new Date(taskResult.completed_at).getTime() < cutoff) return false;
  }

  return true;
}
