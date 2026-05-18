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
  /^.*error[=-]write_stdin failed: stdin is closed for this session\b/i,
  /^.*rerun exec_command with tty=true to keep stdin open\b/i,
] as const;

const stripControlSequences = (value: string): string =>
  value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

export const sanitizeCodexText = (value: string): string => stripControlSequences(value).replace(/\r/g, "");

const extractJsonCandidate = (line: string): string | null => {
  const normalized = sanitizeCodexText(line).trim();
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end < start) {
    return null;
  }

  const candidate = normalized.slice(start, end + 1).trim();
  return candidate.startsWith("{") && candidate.endsWith("}") ? candidate : null;
};

export const hasCodexJsonCandidate = (line: string): boolean => extractJsonCandidate(line) !== null;

export type CodexStructuredLine =
  | {
      kind: "command";
      commandLine: string | null;
      status: "running" | "completed" | "failed";
      outputPreview?: string;
      category: "tool" | "validation" | "git";
    }
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
      const sanitized = sanitizeCodexText(nested);
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
    const sanitized = sanitizeCodexText(value);
    return sanitized.length > 0 ? sanitized : null;
  }
  if (Array.isArray(value)) {
    const pieces = value.map((item) => extractJsonText(item)).filter((item): item is string => Boolean(item));
    return pieces.length > 0 ? pieces.join("") : null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of [
    "message", "text", "delta", "content", "output", "summary", "stdout", "stderr", "aggregated_output", "result",
  ] as const) {
    const extracted = extractJsonText(record[key]);
    if (extracted) return extracted;
  }
  return null;
};

const normalizeEventType = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return sanitizeCodexText(value).replaceAll("/", ".").trim();
};

const getEventPhase = (eventType: string): string => {
  const parts = eventType.split(".");
  return parts[parts.length - 1] ?? "";
};

const isToolItemType = (itemType: string): boolean =>
  new Set(["command_execution", "mcp_tool_call", "web_search", "todo_list", "tool_search"]).has(itemType);

const isFileEditItemType = (itemType: string): boolean => itemType === "file_change";
const isFinalAnswerItemType = (itemType: string): boolean =>
  new Set(["agent_message", "assistant_message", "final_answer"]).has(itemType);
const isIntentLikeAssistantText = (text: string): boolean => /^(Goal|목표):\s*/i.test(text.trim());

const summarizeText = (text: string, maxLines = 3): string => {
  const normalized = sanitizeCodexText(text).replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) return "";
  if (lines.length <= maxLines) return lines.join(" · ");
  return `${lines.slice(0, maxLines).join(" · ")} · … (+${lines.length - maxLines}줄)`;
};

const summarizeCommand = (command: string): string => sanitizeCodexText(command).replace(/\s+/g, " ").trim();
const isValidationCommand = (command: string): boolean =>
  /\b(npm run (typecheck|build|lint)|vitest|npm test|pnpm test|yarn test|bun test|tsc)\b/i.test(command);
const isGitCommand = (command: string): boolean =>
  /\bgit\b\s+(add|commit|push|status|diff|checkout|merge|rebase)\b/i.test(command);

const classifyCommandExecution = (item: Record<string, unknown>, phase: string): CodexStructuredLine | null => {
  const command = getStringField(item, ["command"]);
  const commandSummary = command ? summarizeCommand(command) : null;
  const exitCode = getNumberField(item, ["exit_code", "exitCode"]);
  const output = summarizeText(getStringField(item, ["aggregated_output", "output", "stdout", "result", "text"]) ?? extractJsonText(item) ?? "");
  const status =
    phase === "started" ? "running"
    : exitCode === null || exitCode === 0 ? "completed"
    : "failed";
  const category =
    command && isValidationCommand(command) ? "validation"
    : command && isGitCommand(command) ? "git"
    : "tool";
  if (commandSummary === null && output.length === 0 && phase !== "started") {
    return null;
  }
  return {
    kind: "command",
    commandLine: commandSummary,
    status,
    ...(output.length > 0 ? { outputPreview: output } : {}),
    category,
  };
};

const summarizeFileChange = (item: Record<string, unknown>, phase: string): string | null => {
  if (phase !== "completed" && phase !== "updated" && phase !== "progress") return null;
  const changes = getArrayField(item, "changes");
  const changeSummaries = (changes ?? []).map((change) => {
    if (!change || typeof change !== "object" || Array.isArray(change)) return null;
    const record = change as Record<string, unknown>;
    const path = getStringField(record, ["path", "filePath", "file_name", "filename"]);
    if (!path) return null;
    return path;
  }).filter((entry): entry is string => Boolean(entry));
  const summary = changeSummaries.length > 0 ? changeSummaries.join(", ") : (getStringField(item, ["path", "filePath", "file_name", "filename"]) ?? "");
  return summary.length === 0 ? "Edit 파일 변경" : `Edit ${summary.replace(/^([+~\-→]\s*)+/g, "").trim()}`;
};

const summarizeToolItem = (item: Record<string, unknown>, phase: string, itemType: string): string | null => {
  const label = itemType.replaceAll("_", " ").trim();
  const summarySource =
      phase === "completed" || phase === "updated" || phase === "progress"
      ? getStringField(item, ["output", "result", "text", "summary", "title", "name", "query", "prompt", "command", "input"]) ?? extractJsonText(item) ?? ""
      : getStringField(item, ["title", "name", "summary", "text", "output", "query", "prompt", "command", "input"]) ?? extractJsonText(item) ?? "";
  const summary = summarizeText(summarySource, 2) || "";
  if (phase === "started") return summary.length > 0 ? `${label}: ${summary}` : label;
  if (phase === "completed" || phase === "updated" || phase === "progress") return summary.length > 0 ? `${label}: ${summary}` : `${label}: done`;
  return summary.length > 0 ? `${label}: ${summary}` : label;
};

export const shouldIgnoreCodexNoiseLine = (line: string): boolean => {
  const normalized = sanitizeCodexText(line).trim();
  if (normalized.length === 0) return true;
  return CODEX_STDERR_NOISE_PATTERNS.some((pattern) => pattern.test(normalized));
};

const looksLikeLifecycleNoise = (line: string): boolean => {
  const normalized = sanitizeCodexText(line).trim();
  if (normalized.length === 0) return false;
  for (const type of CODEX_LIFECYCLE_TYPES) {
    if (normalized === type || normalized.startsWith(`${type}[`) || normalized.startsWith(`${type} `) || normalized.startsWith(`${type}:`)) {
      return true;
    }
  }
  return false;
};

export const classifyCodexJsonLine = (line: string): CodexStructuredLine | null => {
  const candidate = extractJsonCandidate(line);
  if (candidate === null) return null;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const eventType = normalizeEventType(parsed.type ?? parsed.method ?? "");
    const phase = getEventPhase(eventType);
    const item = getRecordField(parsed, "item");
    const itemType = normalizeEventType(item?.type ?? item?.kind ?? item?.name ?? "");
    const text = extractJsonText(item ?? parsed);
    if (eventType === "error" || eventType === "warning") return { kind: "diagnostic", text: (text ?? eventType) || "diagnostic" };
    if (item) {
      if (isToolItemType(itemType)) {
        if (itemType === "command_execution") return classifyCommandExecution(item, phase);
        const toolText = summarizeToolItem(item, phase, itemType);
        if (toolText) return { kind: "tool", text: toolText };
        if (phase !== "started" && text) return { kind: "tool", text };
      }
      if (isFileEditItemType(itemType)) {
        const editText = summarizeFileChange(item, phase) ?? text;
        if (editText) return { kind: "edit", text: editText };
      }
      if (isFinalAnswerItemType(itemType)) {
        const finalText = text ?? getStringField(item, ["text", "content", "message", "summary"]);
        if (finalText && isIntentLikeAssistantText(finalText)) {
          return { kind: "raw", text: finalText };
        }
        if (phase !== "completed") return null;
        if (finalText) {
          return { kind: "final", text: finalText };
        }
      }
    }
    if (
      text &&
      !eventType.startsWith("item.") &&
      (eventType.includes("final") || eventType.endsWith(".completed"))
    ) {
      return { kind: "final", text };
    }
    if (eventType.startsWith("thread.") || eventType.startsWith("turn.") || eventType.startsWith("response.") || eventType.startsWith("item.")) {
      return null;
    }
    return text ? { kind: "raw", text } : null;
  } catch {
    return null;
  }
};

export const shouldDropLifecycleJsonLine = (line: string): boolean => {
  const candidate = extractJsonCandidate(line);
  if (candidate === null) return false;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const eventType = normalizeEventType(parsed.type ?? parsed.method ?? "");
    if (eventType.startsWith("thread.") || eventType.startsWith("turn.") || eventType.startsWith("response.")) return true;
    if (eventType.startsWith("item.")) return classifyCodexJsonLine(line) === null;
    return false;
  } catch {
    return false;
  }
};

export const isCodexJsonOrNoiseLine = (line: string): boolean => {
  return (
    hasCodexJsonCandidate(line) ||
    shouldIgnoreCodexNoiseLine(line) ||
    looksLikeLifecycleNoise(line) ||
    shouldDropLifecycleJsonLine(line)
  );
};
