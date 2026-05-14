import type { Adapter } from "../pipeline/types.js";
import {
  RequestCategoryValues,
  type RequestCategory,
  type SessionState,
} from "../../schemas/pipeline.js";
import { DETOKS_VERSION } from "../version.js";

export interface GeneralizedContribution {
  contributed_at: string;
  type_sequence: RequestCategory[];
  success: true;
  adapter: Adapter;
  task_count: number;
  duration_sec: number | null;
  detoks_version: string;
}

function isRequestCategory(value: unknown): value is RequestCategory {
  return typeof value === "string" && RequestCategoryValues.includes(value as RequestCategory);
}

export class WorkflowGeneralizer {
  generalize(session: SessionState, adapter: Adapter): GeneralizedContribution | null {
    const completedIds = session.completed_task_ids;
    if (completedIds.length < 2) return null;

    const failedIds =
      (session.shared_context.failed_task_ids as string[] | undefined) ?? [];
    if (failedIds.length > 0) return null;

    const rawTypes = completedIds.map(
      (id) => (session.task_results[id] as { type?: unknown } | undefined)?.type,
    );
    if (!rawTypes.every(isRequestCategory)) return null;

    return {
      contributed_at: new Date().toISOString(),
      type_sequence: rawTypes,
      success: true,
      adapter,
      task_count: completedIds.length,
      duration_sec: this.calcDuration(session),
      detoks_version: DETOKS_VERSION,
    };
  }

  private calcDuration(session: SessionState): number | null {
    try {
      const endMs = new Date(session.updated_at ?? "").getTime();
      const firstId = session.completed_task_ids[0];
      if (!firstId) return null;
      const firstResult = session.task_results[firstId] as
        | { completed_at?: string }
        | undefined;
      if (!firstResult?.completed_at) return null;
      const startMs = new Date(firstResult.completed_at).getTime();
      if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return null;
      return Math.round((endMs - startMs) / 1000);
    } catch {
      return null;
    }
  }
}
