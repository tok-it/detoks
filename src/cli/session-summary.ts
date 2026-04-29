import type { SessionState } from "../schemas/pipeline.js";
import {
  isTokenMetricsSnapshot,
  type TokenMetricsSnapshot,
} from "../core/utils/tokenMetrics.js";

const SUMMARY_PREVIEW_LENGTH = 110;

const compactWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

export const previewText = (value: string, maxLength = SUMMARY_PREVIEW_LENGTH): string => {
  const compact = compactWhitespace(value);
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const extractSummaryText = (value: unknown): string | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    summary?: unknown;
    raw_output?: unknown;
    next_action?: unknown;
  };

  if (typeof candidate.summary === "string" && candidate.summary.trim()) {
    return previewText(candidate.summary);
  }

  if (typeof candidate.raw_output === "string" && candidate.raw_output.trim()) {
    return previewText(candidate.raw_output);
  }

  if (typeof candidate.next_action === "string" && candidate.next_action.trim()) {
    return previewText(candidate.next_action);
  }

  return null;
};

const collectOrderedTaskIds = (state: SessionState): string[] => {
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const pushId = (value: unknown): void => {
    if (typeof value !== "string") {
      return;
    }

    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    orderedIds.push(normalized);
  };

  const completedTaskIds = Array.isArray(state.completed_task_ids)
    ? state.completed_task_ids.filter((id): id is string => typeof id === "string")
    : [];

  for (const taskId of completedTaskIds) {
    pushId(taskId);
  }

  pushId(state.current_task_id);

  if (state.task_results && typeof state.task_results === "object") {
    for (const taskId of Object.keys(state.task_results).sort()) {
      pushId(taskId);
    }
  }

  return orderedIds;
};

const deriveTaskSummaryOnly = (state: SessionState): string | null => {
  if (typeof state.last_summary === "string" && state.last_summary.trim()) {
    return previewText(state.last_summary);
  }

  const completedTaskIds = Array.isArray(state.completed_task_ids)
    ? state.completed_task_ids.filter((id): id is string => typeof id === "string")
    : [];

  for (let index = completedTaskIds.length - 1; index >= 0; index -= 1) {
    const taskId = completedTaskIds[index];
    if (!taskId) {
      continue;
    }

    const result = state.task_results?.[taskId];
    const summary = extractSummaryText(result);
    if (summary) {
      return previewText(summary);
    }
  }

  return null;
};

export const deriveLastWorkSummary = (state: SessionState): string | null => {
  const summary = deriveTaskSummaryOnly(state);
  if (summary) {
    return summary;
  }

  if (typeof state.next_action === "string" && state.next_action.trim()) {
    return previewText(state.next_action);
  }

  return null;
};

export interface SessionResumeOverview {
  summary: string | null;
  nextAction: string | null;
  currentTaskId: string | null;
  completedTaskCount: number;
  taskResultCount: number;
  updatedAt: string | null;
}

export interface SessionTaskLogEntry {
  taskId: string;
  success: boolean | null;
  summary: string | null;
  rawOutputPreview: string | null;
  rawOutput?: string;
}

export const deriveSessionResumeOverview = (
  state: SessionState,
): SessionResumeOverview => ({
  summary: deriveTaskSummaryOnly(state),
  nextAction:
    typeof state.next_action === "string" && state.next_action.trim()
      ? previewText(state.next_action)
      : null,
  currentTaskId:
    typeof state.current_task_id === "string" &&
    state.current_task_id.trim()
      ? state.current_task_id
      : null,
  completedTaskCount: Array.isArray(state.completed_task_ids)
    ? state.completed_task_ids.filter((id): id is string => typeof id === "string").length
    : 0,
  taskResultCount:
    state.task_results && typeof state.task_results === "object"
      ? Object.keys(state.task_results).length
      : 0,
  updatedAt:
    typeof state.updated_at === "string" && state.updated_at.trim()
      ? state.updated_at
      : null,
});

export const deriveSessionTaskLogEntries = (
  state: SessionState,
  options: { includeRawOutput?: boolean } = {},
): SessionTaskLogEntry[] =>
  collectOrderedTaskIds(state).map((taskId) => {
    const result = state.task_results?.[taskId];
    if (!result || typeof result !== "object") {
      return {
        taskId,
        success: null,
        summary: null,
        rawOutputPreview: null,
      };
    }

    const candidate = result as {
      success?: unknown;
      summary?: unknown;
      raw_output?: unknown;
    };
    const summary =
      typeof candidate.summary === "string" && candidate.summary.trim()
        ? previewText(candidate.summary)
        : typeof candidate.raw_output === "string" && candidate.raw_output.trim()
          ? previewText(candidate.raw_output)
          : null;
    const rawOutput =
      typeof candidate.raw_output === "string" && candidate.raw_output.trim()
        ? candidate.raw_output
        : null;

    return {
      taskId,
      success: typeof candidate.success === "boolean" ? candidate.success : null,
      summary,
      rawOutputPreview: rawOutput ? previewText(rawOutput) : null,
      ...(options.includeRawOutput && rawOutput ? { rawOutput } : {}),
    };
  });

export const deriveTokenMetricsSummary = (
  state: SessionState,
): TokenMetricsSnapshot | null => {
  const sharedContext = state.shared_context as Record<string, unknown> | undefined;
  const candidate = sharedContext?.token_metrics;
  return isTokenMetricsSnapshot(candidate) ? candidate : null;
};
