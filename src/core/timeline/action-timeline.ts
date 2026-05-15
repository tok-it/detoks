import type { PipelineExecutionResult } from "../pipeline/types.js";
import type { ActionTimelineEvent } from "./types.js";
import { createActionTimelineEvent } from "./types.js";
import type { PtyTranscript } from "../../integrations/subprocess/types.js";
import { formatWorkspaceStatusEntry, parseWorkspaceStatusLine } from "./workspace-status.js";

const normalizeLine = (value: string): string =>
  value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

const dedupeEvents = (events: readonly ActionTimelineEvent[]): ActionTimelineEvent[] => {
  const seen = new Set<string>();
  const output: ActionTimelineEvent[] = [];

  for (const event of events) {
    const key = `${event.kind}:${event.stage ?? ""}:${event.taskId ?? ""}:${event.summary}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(event);
  }

  return output;
};

const getRecordField = (value: unknown, key: string): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const nested = record[key];
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    return null;
  }

  return nested as Record<string, unknown>;
};

const getStringField = (value: unknown, keys: string[]): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const nested = record[key];
    if (typeof nested === "string") {
      const normalized = normalizeLine(nested);
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }

  return null;
};

const getArrayField = (value: unknown, key: string): unknown[] | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const nested = record[key];
  return Array.isArray(nested) ? nested : null;
};

const extractJsonText = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = normalizeLine(value);
    return normalized.length > 0 ? normalized : null;
  }

  if (Array.isArray(value)) {
    const pieces = value
      .map((item) => extractJsonText(item))
      .filter((item): item is string => Boolean(item));
    return pieces.length > 0 ? pieces.join("") : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["message", "text", "delta", "content", "output", "summary", "stdout", "stderr", "aggregated_output", "result"] as const) {
    const extracted = extractJsonText(record[key]);
    if (extracted) {
      return extracted;
    }
  }

  return null;
};

const normalizeEventType = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeLine(value).replaceAll("/", ".").trim();
};

const getEventPhase = (eventType: string): string => {
  const parts = eventType.split(".");
  return parts[parts.length - 1] ?? "";
};

const summarizeCommand = (command: string): string => normalizeLine(command).replace(/\s+/g, " ");

const isValidationCommand = (command: string): boolean =>
  /\b(npm run (typecheck|build|lint)|vitest|npm test|pnpm test|yarn test|tsc)\b/i.test(command);

const isGitCommand = (command: string): boolean =>
  /\bgit\b\s+(add|commit|push|status|diff|checkout|merge|rebase)\b/i.test(command);

const PIPELINE_STAGE_TO_WORK_STATE: Record<string, string> = {
  "Prompt Compiler": "Planning",
  "Task Graph Builder": "Inspecting",
  "Context Optimizer": "Inspecting",
  "Executor": "Editing",
  "State Manager": "Committing",
};

const INSPECTION_COMMAND_PATTERN =
  /\b(?:cat|sed|grep|rg|find|ls|pwd|head|tail|awk|git\s+(?:status|diff|log|show))\b/i;

const EDITING_COMMAND_PATTERN =
  /\b(?:apply_patch|touch|mkdir|cp|mv|rm|tee|nano|vim|vi)\b/i;

const WORK_STATE_ORDER = [
  "Planning",
  "Inspecting",
  "Editing",
  "Validating",
  "Committing",
  "Pushing",
  "Waiting for CI",
] as const;

const getTimelineCommand = (event: ActionTimelineEvent): string | null => {
  const rawPayload = event.rawPayload;
  const item = getRecordField(rawPayload, "item");
  const command = getStringField(item ?? rawPayload, ["command"]);
  if (command) {
    return summarizeCommand(command);
  }

  const summary = summarizeCommand(event.summary);
  if (summary.startsWith("exec: ")) {
    return summarizeCommand(summary.slice("exec: ".length));
  }

  if (summary.startsWith("git ")) {
    return summary;
  }

  return null;
};

const getTimelinePhase = (event: ActionTimelineEvent): string => {
  const rawPayload = event.rawPayload;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return "";
  }

  const record = rawPayload as Record<string, unknown>;
  return normalizeEventType(record.type ?? record.method ?? "");
};

export const deriveActionWorkState = (event: ActionTimelineEvent): string | null => {
  if (event.kind === "cache_hit") {
    return "캐시 적중";
  }

  if (event.kind === "cache_advise") {
    return "캐시 참고";
  }

  if (event.kind === "validation") {
    return "Validating";
  }

  if (event.kind === "file_edit") {
    return "Editing";
  }

  if (event.kind === "stage_update") {
    if (!event.stage) {
      return event.summary;
    }

    if (event.stage === "Executor" && event.summary.includes("start")) {
      return "Editing";
    }

    if (event.stage === "Executor" && event.summary.includes("end")) {
      return "Validating";
    }

    return PIPELINE_STAGE_TO_WORK_STATE[event.stage] ?? event.stage;
  }

  const command = getTimelineCommand(event);
  if (!command) {
    return null;
  }

  const lower = command.toLowerCase();
  const phase = getTimelinePhase(event);

  if (lower.includes("git push")) {
    return phase.includes("completed") ? "Waiting for CI" : "Pushing";
  }

  if (lower.includes("git add") || lower.includes("git commit") || lower.includes("git merge") || lower.includes("git rebase")) {
    return "Committing";
  }

  if (isValidationCommand(command)) {
    return "Validating";
  }

  if (INSPECTION_COMMAND_PATTERN.test(command)) {
    return "Inspecting";
  }

  if (EDITING_COMMAND_PATTERN.test(command)) {
    return "Editing";
  }

  if (event.kind === "tool_result" && lower.includes("exit 0")) {
    return "Editing";
  }

  if (event.kind === "tool_call" || event.kind === "tool_result" || event.kind === "git_operation") {
    return "Editing";
  }

  return null;
};

export const collectActionWorkStates = (events: readonly ActionTimelineEvent[]): string[] => {
  const states: string[] = [];
  for (const event of events) {
    const state = deriveActionWorkState(event);
    if (state && !states.includes(state)) {
      states.push(state);
    }
  }

  const rankedStates = [...states].sort((left, right) => {
    const leftIndex = WORK_STATE_ORDER.indexOf(left as (typeof WORK_STATE_ORDER)[number]);
    const rightIndex = WORK_STATE_ORDER.indexOf(right as (typeof WORK_STATE_ORDER)[number]);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });

  return rankedStates;
};

const summarizeFileEdits = (events: readonly ActionTimelineEvent[]): string | null => {
  const counts = new Map<string, number>();
  let total = 0;

  for (const event of events) {
    if (event.kind !== "file_edit") {
      continue;
    }

    total += 1;
    const match = /^(수정|추가|삭제|이름변경|복사|미추적|충돌|형식변경|변경)\s+/.exec(event.summary);
    const label = match?.[1] ?? "변경";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  if (total === 0) {
    return null;
  }

  const orderedLabels = [
    "수정",
    "추가",
    "삭제",
    "이름변경",
    "복사",
    "미추적",
    "충돌",
    "형식변경",
    "변경",
  ];

  const parts = orderedLabels
    .map((label) => {
      const count = counts.get(label);
      if (!count) {
        return null;
      }

      return `${label} ${count}개`;
    })
    .filter((part): part is string => Boolean(part));

  return parts.length > 0
    ? `파일 변경 ${total}개 (${parts.join(" · ")})`
    : `파일 변경 ${total}개`;
};

const summarizeFileChange = (item: Record<string, unknown>, phase: string): string | null => {
  const changes = getArrayField(item, "changes");
  const changeSummaries = (changes ?? [])
    .map((change) => {
      if (!change || typeof change !== "object" || Array.isArray(change)) {
        return null;
      }

      const record = change as Record<string, unknown>;
      const path = getStringField(record, ["path", "filePath", "file_name", "filename"]);
      if (!path) {
        return null;
      }

      const kind = getStringField(record, ["kind", "type"]) ?? "update";
      const symbol =
        kind === "add" || kind === "create"
          ? "+"
          : kind === "delete" || kind === "remove"
            ? "-"
            : kind === "rename"
              ? "→"
              : "~";
      return `${symbol} ${path}`;
    })
    .filter((entry): entry is string => Boolean(entry));

  const summary =
    changeSummaries.length > 0
      ? changeSummaries.join(", ")
      : getStringField(item, ["path", "filePath", "file_name", "filename"]) ?? "";

  if (summary.length === 0) {
    return phase === "completed" ? "파일 변경 완료" : "파일 변경 중";
  }

  return phase === "completed" ? `applied: ${summary}` : `changes: ${summary}`;
};

const classifyCodexJsonLine = (line: string): ActionTimelineEvent | null => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const eventType = normalizeEventType(parsed.type ?? parsed.method ?? "");
    const phase = getEventPhase(eventType);
    const item = getRecordField(parsed, "item");
    const itemType = normalizeEventType(item?.type ?? item?.kind ?? item?.name ?? "");
    const text = extractJsonText(item ?? parsed);

    if (eventType.startsWith("thread.") || eventType.startsWith("turn.") || eventType.startsWith("response.")) {
      return null;
    }

    if (item) {
      if (itemType === "command_execution") {
        const command = getStringField(item, ["command"]);
        const commandSummary = command ? summarizeCommand(command) : null;
        const toolSummary = phase === "started"
          ? (commandSummary ? `exec: ${commandSummary}` : "exec")
          : (() => {
              const exitCode = typeof item.exit_code === "number" ? item.exit_code : typeof item.exitCode === "number" ? item.exitCode : null;
              const output = summarizeCommand(
                getStringField(item, ["aggregated_output", "output", "stdout", "result", "text"]) ??
                  text ??
                  "",
              );
              const resultSummary = exitCode === null ? "done" : `exit ${exitCode}`;
              return output.length > 0 ? `${resultSummary} · ${output}` : resultSummary;
            })();

        if (command && isValidationCommand(command)) {
          return createActionTimelineEvent({
            kind: "validation",
            source: "validation",
            summary: commandSummary ? `Ran ${commandSummary}` : "validation command",
            rawPayload: parsed,
          });
        }

        if (command && isGitCommand(command)) {
          return createActionTimelineEvent({
            kind: "git_operation",
            source: "git",
            summary: commandSummary ? `git ${commandSummary.replace(/^git\s+/i, "")}` : "git operation",
            rawPayload: parsed,
          });
        }

        return createActionTimelineEvent({
          kind: phase === "started" ? "tool_call" : "tool_result",
          source: "adapter",
          summary: toolSummary,
          rawPayload: parsed,
        });
      }

      if (itemType === "file_change") {
        const editText = summarizeFileChange(item, phase);
        if (editText) {
          return createActionTimelineEvent({
            kind: "file_edit",
            source: "workspace",
            summary: editText,
            rawPayload: parsed,
          });
        }
      }
    }

    if (eventType.includes("error") || eventType.includes("warning")) {
      return createActionTimelineEvent({
        kind: "tool_result",
        source: "adapter",
        summary: text ?? eventType,
        rawPayload: parsed,
      });
    }

    if (text && (eventType.includes("message") || eventType.includes("text") || eventType.includes("delta"))) {
      return createActionTimelineEvent({
        kind: "tool_result",
        source: "adapter",
        summary: text,
        rawPayload: parsed,
      });
    }

    return null;
  } catch {
    return null;
  }
};

const extractActionTimelineEventsFromTranscript = (transcript: PtyTranscript): ActionTimelineEvent[] => {
  const events: ActionTimelineEvent[] = [];

  for (const transcriptEvent of transcript.events) {
    if (transcriptEvent.type !== "chunk" || !transcriptEvent.data) {
      continue;
    }

    const normalized = transcriptEvent.data.replace(/\r\n/g, "\n");
    for (const line of normalized.split("\n")) {
      const parsed = classifyCodexJsonLine(line);
      if (parsed) {
        events.push(parsed);
      }
    }
  }

  return events;
};

const buildTurnRecapEvent = (
  result: Pick<PipelineExecutionResult, "summary" | "nextAction">,
  events: readonly ActionTimelineEvent[],
): ActionTimelineEvent => {
  const workStates = collectActionWorkStates(events);
  const validations = events
    .filter((event) => event.kind === "validation")
    .map((event) => event.summary)
    .filter((summary) => summary.length > 0);
  const gitOps = events
    .filter((event) => event.kind === "git_operation")
    .map((event) => event.summary)
    .filter((summary) => summary.length > 0);
  const tools = events
    .filter((event) => event.kind === "tool_call" || event.kind === "tool_result")
    .map((event) => event.summary)
    .filter((summary) => summary.length > 0);

  const details: string[] = [];
  details.push(`요약: ${result.summary}`);
  details.push(`다음 작업: ${result.nextAction}`);
  if (workStates.length > 0) {
    details.push(`진행 단계: ${workStates.join(" · ")}`);
  }

  const fileEditSummary = summarizeFileEdits(events);
  if (fileEditSummary) {
    details.push(fileEditSummary);
  }

  if (tools.length > 0) {
    details.push(`도구: ${tools.slice(0, 2).join(" · ")}`);
  }
  if (validations.length > 0) {
    details.push(`검증: ${validations.slice(0, 2).join(" · ")}`);
  }
  if (gitOps.length > 0) {
    details.push(`git: ${gitOps.slice(0, 2).join(" · ")}`);
  }

  return createActionTimelineEvent({
    kind: "turn_recap",
    source: "detoks",
    summary: "턴 종료 recap",
    details,
  });
};

export const buildActionTimeline = (
  result: Pick<PipelineExecutionResult, "summary" | "nextAction" | "progressLog" | "adapterTranscript"> & {
    actionTimeline?: readonly ActionTimelineEvent[] | undefined;
  },
  workspaceDiffLines: readonly string[] = [],
): ActionTimelineEvent[] => {
  const events: ActionTimelineEvent[] = [...(result.actionTimeline ?? [])];
  if (result.adapterTranscript) {
    events.push(...extractActionTimelineEventsFromTranscript(result.adapterTranscript));
  }

  for (const log of result.progressLog ?? []) {
    events.push(
      createActionTimelineEvent({
        kind: "stage_update",
        source: "pipeline",
        stage: log.stage,
        summary: `${log.stage}: ${log.status} · ${log.message}`,
        rawPayload: log,
        timestamp: log.timestamp,
      }),
    );
  }

  for (const line of workspaceDiffLines) {
    const summary = normalizeLine(line).replace(/^\[WORKSPACE\]\s*/, "").replace(/^\s+/, "");
    if (!summary) {
      continue;
    }

    const parsed = parseWorkspaceStatusLine(summary);
    if (!parsed) {
      continue;
    }

    events.push(
      createActionTimelineEvent({
        kind: "file_edit",
        source: "workspace",
        summary: formatWorkspaceStatusEntry(parsed),
        rawPayload: parsed,
      }),
    );
  }

  const deduped = dedupeEvents(events);
  deduped.push(buildTurnRecapEvent(result, deduped));
  return dedupeEvents(deduped);
};

export const getTurnRecapLines = (event: ActionTimelineEvent): string[] => {
  if (event.kind !== "turn_recap") {
    return [event.summary];
  }

  return event.details && event.details.length > 0 ? [event.summary, ...event.details] : [event.summary];
};
