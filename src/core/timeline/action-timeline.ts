import type { PipelineExecutionResult } from "../pipeline/types.js";
import type { ActionTimelineEvent } from "./types.js";
import { createActionTimelineEvent } from "./types.js";
import type { PtyTranscript } from "../../integrations/subprocess/types.js";

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

const summarizeWorkspaceLine = (line: string): string | null => {
  const normalized = normalizeLine(line);
  if (normalized.length === 0) {
    return null;
  }

  return normalized.replace(/^\[WORKSPACE\]\s*/, "").replace(/^\s+/, "");
};

const looksLikeGitStatusLine = (value: string): boolean => /^[MARCUD!?]{1,2}\s/.test(value) || value.startsWith("?? ");

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
  const fileEdits = events
    .filter((event) => event.kind === "file_edit")
    .map((event) => event.summary)
    .filter((summary) => summary.length > 0);
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

  if (tools.length > 0) {
    details.push(`도구: ${tools.slice(0, 2).join(" · ")}`);
  }
  if (fileEdits.length > 0) {
    details.push(`편집: ${fileEdits.slice(0, 3).join(" · ")}`);
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
    const summary = summarizeWorkspaceLine(line);
    if (!summary) {
      continue;
    }

    if (looksLikeGitStatusLine(summary)) {
      events.push(
        createActionTimelineEvent({
          kind: "file_edit",
          source: "workspace",
          summary,
          rawPayload: line,
        }),
      );
    }
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
