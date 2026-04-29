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

export const deriveLastWorkSummary = (state: SessionState): string | null => {
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
      return summary;
    }
  }

  if (typeof state.next_action === "string" && state.next_action.trim()) {
    return previewText(state.next_action);
  }

  return null;
};

export const deriveTokenMetricsSummary = (
  state: SessionState,
): TokenMetricsSnapshot | null => {
  const sharedContext = state.shared_context as Record<string, unknown> | undefined;
  const candidate = sharedContext?.token_metrics;
  return isTokenMetricsSnapshot(candidate) ? candidate : null;
};
