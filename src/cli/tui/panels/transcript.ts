import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { PtyEvent } from "../../../integrations/subprocess/types.js";
import type { ActionTimelineEvent } from "../../../core/timeline/types.js";
import { getContentArea, getPanelHeight } from "../layout-manager.js";
import { padDisplayWidth } from "../renderer.js";
import {
  fillRemaining,
  formatHiddenAboveMarker,
  formatHiddenBelowMarker,
  truncateByLength,
} from "./base.js";
import { statusColor } from "../design/tokens.js";

const EMPTY_TRANSCRIPT_LINES = [
  "실행 기록이 아직 없습니다.",
  "명령을 실행하면 원본 CLI 출력이 이 영역에 표시됩니다.",
  "",
  "↑/↓ 이전 출력 스크롤  ·  PageUp/Down 빠른 이동  ·  /help 로 명령 보기",
] as const;

const CODEX_LIFECYCLE_TYPES = new Set([
  "thread.started",
  "turn.started",
  "turn.completed",
  "item.started",
  "item.updated",
  "item.completed",
  "response.started",
  "response.completed",
]);

const CODEX_STDERR_NOISE_PATTERNS = [
  /^Reading additional input from stdin\.\.\.$/,
  /^OpenAI Codex v[\d.]+/,
  /^--------$/,
  /^workdir:/,
  /^model:/,
  /^provider:/,
  /^approval:/,
  /^sandbox:/,
  /^reasoning effort:/,
  /^reasoning summaries:/,
  /^session id:/,
  /^user$/,
  /^codex$/,
  /^\[EXECUTE\]/,
  /^Context:/,
  /^tokens used/,
] as const;

const stripControlSequences = (value: string): string =>
  value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const sanitizeText = (value: string): string => stripControlSequences(value).replace(/\r/g, "");

const truncateLine = truncateByLength;

type TranscriptEntryKind = "tool" | "validation" | "git" | "edit" | "final" | "diagnostic" | "recap" | "raw" | "marker";

interface TranscriptEntry {
  kind: TranscriptEntryKind;
  text: string;
}

type ClassifiedLine =
  | { kind: "tool"; text: string }
  | { kind: "validation"; text: string }
  | { kind: "git"; text: string }
  | { kind: "edit"; text: string }
  | { kind: "final"; text: string }
  | { kind: "diagnostic"; text: string }
  | { kind: "raw"; text: string };

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

const getArrayField = (value: unknown, key: string): unknown[] | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const nested = record[key];
  return Array.isArray(nested) ? nested : null;
};

const getStringField = (value: unknown, keys: string[]): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const nested = record[key];
    if (typeof nested === "string") {
      const sanitized = sanitizeText(nested);
      if (sanitized.length > 0) {
        return sanitized;
      }
    }
  }

  return null;
};

const getNumberField = (value: unknown, keys: string[]): number | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const nested = record[key];
    if (typeof nested === "number" && Number.isFinite(nested)) {
      return nested;
    }
  }

  return null;
};

const extractJsonText = (value: unknown): string | null => {
  if (typeof value === "string") {
    const sanitized = sanitizeText(value);
    return sanitized.length > 0 ? sanitized : null;
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
  for (const key of [
    "message",
    "text",
    "delta",
    "content",
    "output",
    "summary",
    "stdout",
    "stderr",
    "aggregated_output",
    "result",
  ] as const) {
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

  return sanitizeText(value).replaceAll("/", ".").trim();
};

const getEventPhase = (eventType: string): string => {
  const parts = eventType.split(".");
  return parts[parts.length - 1] ?? "";
};

const isToolItemType = (itemType: string): boolean =>
  new Set([
    "command_execution",
    "mcp_tool_call",
    "web_search",
    "todo_list",
    "tool_search",
  ]).has(itemType);

const isFileEditItemType = (itemType: string): boolean => itemType === "file_change";

const isFinalAnswerItemType = (itemType: string): boolean =>
  new Set(["agent_message", "assistant_message", "final_answer"]).has(itemType);

const summarizeText = (text: string, maxLines = 3): string => {
  const normalized = sanitizeText(text).replace(/\r\n/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return "";
  }

  if (lines.length <= maxLines) {
    return lines.join(" · ");
  }

  return `${lines.slice(0, maxLines).join(" · ")} · … (+${lines.length - maxLines}줄)`;
};

const summarizeCommand = (command: string): string =>
  sanitizeText(command).replace(/\s+/g, " ").trim();

const isValidationCommand = (command: string): boolean =>
  /\b(npm run (typecheck|build|lint)|vitest|npm test|pnpm test|yarn test|bun test|tsc)\b/i.test(command);

const isGitCommand = (command: string): boolean =>
  /\bgit\b\s+(add|commit|push|status|diff|checkout|merge|rebase)\b/i.test(command);

const classifyCommandExecution = (
  item: Record<string, unknown>,
  phase: string,
): ClassifiedLine | null => {
  const command = getStringField(item, ["command"]);
  const commandSummary = command ? summarizeCommand(command) : null;
  const exitCode = getNumberField(item, ["exit_code", "exitCode"]);
  const output = summarizeText(
    getStringField(item, ["aggregated_output", "output", "stdout", "result", "text"]) ??
      extractJsonText(item) ??
      "",
  );
  const resultSummary = exitCode === null ? "done" : `exit ${exitCode}`;

  if (phase !== "completed" && phase !== "updated" && phase !== "progress") {
    return null;
  }

  if (command && isValidationCommand(command)) {
    return {
      kind: "validation",
      text: commandSummary
        ? `${commandSummary} · ${output.length > 0 ? output : resultSummary}`
        : output.length > 0
          ? output
          : resultSummary,
    };
  }

  if (command && isGitCommand(command)) {
    return {
      kind: "git",
      text: commandSummary
        ? `${commandSummary} · ${output.length > 0 ? output : resultSummary}`
        : output.length > 0
          ? output
          : resultSummary,
    };
  }

  const toolText =
    commandSummary
      ? `${commandSummary} · ${output.length > 0 ? output : resultSummary}`
      : output.length > 0
        ? output
        : resultSummary;

  return toolText ? { kind: "tool", text: toolText } : null;
};

const summarizeFileChange = (
  item: Record<string, unknown>,
  phase: string,
): string | null => {
  if (phase !== "completed" && phase !== "updated" && phase !== "progress") {
    return null;
  }

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
    return "파일 변경 완료";
  }

  return `applied: ${summary}`;
};

const summarizeToolItem = (
  item: Record<string, unknown>,
  phase: string,
  itemType: string,
): string | null => {
  const label = itemType.replaceAll("_", " ").trim();

  if (phase === "started") {
    return null;
  }

  const summarySource =
    phase === "completed" || phase === "updated" || phase === "progress"
      ? getStringField(item, ["output", "result", "text", "summary", "title", "name"]) ??
        extractJsonText(item) ??
        ""
      : getStringField(item, ["title", "name", "summary", "text", "output"]) ??
        extractJsonText(item) ??
        "";

  const summary = summarizeText(summarySource, 2) || "";

  if (phase === "completed" || phase === "updated" || phase === "progress") {
    return summary.length > 0 ? `${label}: ${summary}` : `${label}: done`;
  }

  return summary.length > 0 ? `${label}: ${summary}` : label;
};

const shouldIgnoreCodexNoiseLine = (line: string): boolean => {
  const normalized = sanitizeText(line).trim();
  if (normalized.length === 0) {
    return true;
  }

  return CODEX_STDERR_NOISE_PATTERNS.some((pattern) => pattern.test(normalized));
};

const looksLikeLifecycleNoise = (line: string): boolean => {
  const normalized = sanitizeText(line).trim();
  if (normalized.length === 0) {
    return false;
  }

  for (const type of CODEX_LIFECYCLE_TYPES) {
    if (
      normalized === type ||
      normalized.startsWith(`${type}[`) ||
      normalized.startsWith(`${type} `) ||
      normalized.startsWith(`${type}:`)
    ) {
      return true;
    }
  }

  return false;
};

const classifyJsonLine = (line: string): ClassifiedLine | null => {
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

    if (eventType === "error" || eventType === "warning") {
      return { kind: "diagnostic", text: (text ?? eventType) || "diagnostic" };
    }

    if (item) {
      if (isToolItemType(itemType)) {
        if (itemType === "command_execution") {
          const commandExecution = classifyCommandExecution(item, phase);
          if (commandExecution) {
            return commandExecution;
          }
          return null;
        }

        const toolText = summarizeToolItem(item, phase, itemType);
        if (toolText) {
          return { kind: "tool", text: toolText };
        }

        if (phase === "started") {
          return null;
        }

        if (text) {
          return { kind: "tool", text };
        }
      }

      if (isFileEditItemType(itemType)) {
        const editText = summarizeFileChange(item, phase) ?? text;
        if (editText) {
          return { kind: "edit", text: editText };
        }
      }

      if (isFinalAnswerItemType(itemType)) {
        const finalText = text ?? getStringField(item, ["text", "content", "message", "summary"]);
        if (finalText) {
          return { kind: "final", text: finalText };
        }
      }
    }

    if (
      text &&
      (eventType.includes("message") ||
        eventType.includes("text") ||
        eventType.includes("delta"))
    ) {
      return { kind: "final", text };
    }

    if (
      eventType.startsWith("thread.") ||
      eventType.startsWith("turn.") ||
      eventType.startsWith("response.") ||
      eventType.startsWith("item.")
    ) {
      return null;
    }

    if (text) {
      return { kind: "raw", text };
    }

    return null;
  } catch {
    return null;
  }
};

const shouldDropLifecycleJsonLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const eventType = normalizeEventType(parsed.type ?? parsed.method ?? "");

    if (
      eventType.startsWith("thread.") ||
      eventType.startsWith("turn.") ||
      eventType.startsWith("response.")
    ) {
      return true;
    }

    if (eventType.startsWith("item.")) {
      return classifyJsonLine(line) === null;
    }

    return false;
  } catch {
    return false;
  }
};

export class TranscriptPanel {
  private entries: TranscriptEntry[] = [];
  private pendingFinalText: string = "";
  private scrollOffset: number = 0;
  private hasEditEntries: boolean = false;

  hasVisibleContent(): boolean {
    return this.entries.length > 0 || this.pendingFinalText.length > 0;
  }

  private pushEntry(kind: TranscriptEntryKind, text: string): void {
    if (text.length === 0) {
      return;
    }

    this.entries.push({ kind, text });
    if (kind === "edit") {
      this.hasEditEntries = true;
    }
    this.scrollToBottom();
  }

  private appendCommittedText(kind: TranscriptEntryKind, text: string): void {
    const normalized = sanitizeText(text).replace(/\r\n/g, "\n");
    for (const line of normalized.split("\n")) {
      if (line.length > 0) {
        this.pushEntry(kind, line);
      }
    }
  }

  private commitPendingFinalText(): void {
    if (this.pendingFinalText.length === 0) {
      return;
    }

    const pending = this.pendingFinalText;
    this.pendingFinalText = "";
    this.appendCommittedText("final", pending);
  }

  private appendFinalText(text: string): void {
    const normalized = sanitizeText(text).replace(/\r\n/g, "\n");
    const parts = normalized.split("\n");

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index] ?? "";
      if (index < parts.length - 1) {
        this.pendingFinalText += part;
        this.commitPendingFinalText();
      } else {
        this.pendingFinalText += part;
      }
    }

    this.scrollToBottom();
  }

  private appendStructuredLine(entry: ClassifiedLine): void {
    if (entry.kind === "final") {
      this.appendFinalText(entry.text);
      return;
    }

    this.commitPendingFinalText();
    this.appendCommittedText(entry.kind, entry.text);
  }

  appendFinalAnswer(text: string): void {
    this.appendFinalText(text);
    this.commitPendingFinalText();
  }

  appendWorkspaceDiff(lines: string[]): void {
    if (this.hasEditEntries) {
      return;
    }

    const normalized = lines
      .map((line, index) => {
        const sanitized = sanitizeText(line);
        if (index === 0) {
          return sanitized.replace(/^\[WORKSPACE\]\s*/, "");
        }

        return sanitized.replace(/^\s+/, "");
      })
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    if (normalized.length === 0) {
      return;
    }

    this.commitPendingFinalText();
    for (const line of normalized) {
      this.pushEntry("edit", line);
    }
  }

  appendTurnRecap(event: ActionTimelineEvent): void {
    if (event.kind !== "turn_recap") {
      return;
    }

    this.commitPendingFinalText();
    const lines = event.details && event.details.length > 0
      ? [event.summary, ...event.details]
      : [event.summary];

    for (const line of lines) {
      const normalized = sanitizeText(line);
      if (normalized.length > 0) {
        this.pushEntry("recap", normalized);
      }
    }
  }

  append(chunk: string): void {
    const normalized = chunk.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");

    for (const line of lines) {
      if (
        line.length === 0 ||
        shouldIgnoreCodexNoiseLine(line) ||
        looksLikeLifecycleNoise(line) ||
        shouldDropLifecycleJsonLine(line)
      ) {
        continue;
      }

      const classified = classifyJsonLine(line);
      if (!classified) {
        this.commitPendingFinalText();
        this.pushEntry("raw", sanitizeText(line));
        continue;
      }

      this.appendStructuredLine(classified);
    }
  }

  addEvent(event: PtyEvent): void {
    if (event.type === "chunk" && event.stream === "stdout" && event.data) {
      this.append(event.data);
    } else if (event.type === "chunk" && event.stream === "stderr" && event.data) {
      const normalized = sanitizeText(event.data).replace(/\r\n/g, "\n");
      for (const line of normalized.split("\n")) {
        if (line.length === 0 || shouldIgnoreCodexNoiseLine(line) || shouldDropLifecycleJsonLine(line)) {
          continue;
        }

        const classified = classifyJsonLine(line);
        if (classified) {
          this.appendStructuredLine(classified);
        } else {
          this.commitPendingFinalText();
          this.pushEntry("diagnostic", sanitizeText(line));
        }
      }
    } else if (event.type === "exit" || event.type === "timeout" || event.type === "error") {
      this.commitPendingFinalText();
      this.scrollToBottom();
    }
  }

  scrollUp(): void {
    const totalLines = this.entries.length + (this.pendingFinalText.length > 0 ? 1 : 0);
    this.scrollOffset = Math.min(
      this.scrollOffset + 1,
      Math.max(0, totalLines - 1),
    );
  }

  scrollDown(): void {
    this.scrollOffset = Math.max(this.scrollOffset - 1, 0);
  }

  scrollToBottom(): void {
    this.scrollOffset = 0;
  }

  clear(): void {
    this.entries = [];
    this.pendingFinalText = "";
    this.scrollOffset = 0;
    this.hasEditEntries = false;
  }

  render(ctx: RenderContext, region: PanelRegion): void {
    const { screen } = ctx;
    const { usableWidth, usableHeight } = getContentArea(region);
    const panelHeight = getPanelHeight(region);
    void panelHeight;

    const hasPendingFinal = this.pendingFinalText.length > 0;
    const isEmptyState = !this.hasVisibleContent();
    const sourceEntries: TranscriptEntry[] = isEmptyState
      ? EMPTY_TRANSCRIPT_LINES.map((text) => ({ kind: "raw" as const, text }))
      : [
          ...this.entries,
          ...(hasPendingFinal
            ? [{ kind: "final" as const, text: this.pendingFinalText }]
            : []),
        ];

    const effectiveScrollOffset = Math.min(
      this.scrollOffset,
      Math.max(0, sourceEntries.length - 1),
    );
    const endIdx = sourceEntries.length - effectiveScrollOffset;
    const startIdx = Math.max(0, endIdx - usableHeight);
    let visibleEntries = sourceEntries.slice(startIdx, endIdx);

    // Truncation markers — only when content overflows (not in empty state).
    if (!isEmptyState) {
      const hiddenAbove = startIdx;
      const hiddenBelow = sourceEntries.length - endIdx;
      if (hiddenAbove > 0 && visibleEntries.length > 1) {
        visibleEntries = [
          { kind: "marker" as const, text: formatHiddenAboveMarker(hiddenAbove) },
          ...visibleEntries.slice(1),
        ];
      }
      if (hiddenBelow > 0 && visibleEntries.length > 1) {
        visibleEntries = [
          ...visibleEntries.slice(0, -1),
          { kind: "marker" as const, text: formatHiddenBelowMarker(hiddenBelow) },
        ];
      }
    }

    let currentRow = region.startRow;
    for (const entry of visibleEntries) {
      if (currentRow >= region.endRow) {
        break;
      }

      const prefix =
        entry.kind === "recap"
              ? "[recap] "
              : "";
      const line = truncateLine(`${prefix}${entry.text}`, usableWidth);
      const paddedLine = padDisplayWidth(line, usableWidth);
      const displayLine = isEmptyState
        ? statusColor.muted(paddedLine)
        : entry.kind === "marker"
          ? statusColor.muted(paddedLine)
          : entry.kind === "diagnostic"
            ? statusColor.error(paddedLine)
            : entry.kind === "recap"
              ? statusColor.info(paddedLine)
              : paddedLine;

      screen.cursorMoveTo(currentRow, 0);
      screen.write(displayLine);
      currentRow += 1;
    }

    fillRemaining(ctx, region, currentRow);
  }
}
