export const ActionTimelineKinds = [
  "tool_call",
  "tool_result",
  "file_edit",
  "validation",
  "git_operation",
  "approval_request",
  "approval_result",
  "turn_recap",
  "stage_update",
] as const;

export type ActionTimelineKind = (typeof ActionTimelineKinds)[number];

export const ActionTimelineSources = [
  "pipeline",
  "executor",
  "adapter",
  "workspace",
  "validation",
  "git",
  "detoks",
] as const;

export type ActionTimelineSource = (typeof ActionTimelineSources)[number];

export interface ActionTimelineEvent {
  kind: ActionTimelineKind;
  source: ActionTimelineSource;
  summary: string;
  timestamp: number;
  taskId?: string;
  stage?: string;
  details?: string[];
  rawPayload?: unknown;
}

export type ActionTimelineSink = (
  event: ActionTimelineEvent,
) => void | Promise<void>;

export const createActionTimelineEvent = (
  event: Omit<ActionTimelineEvent, "timestamp"> & { timestamp?: number },
): ActionTimelineEvent => ({
  ...event,
  timestamp: event.timestamp ?? Date.now(),
});
