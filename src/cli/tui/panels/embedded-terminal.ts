import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { PtyEvent } from "../../../integrations/subprocess/types.js";
import { getContentArea } from "../layout-manager.js";
import { padDisplayWidth } from "../renderer.js";
import { fillRemaining } from "./base.js";
import { statusColor } from "../design/tokens.js";
import type { TerminalCell, TerminalCellStyle, TerminalColor } from "../terminal-emulator.js";
import { TerminalEmulatorBuffer, getCharacterDisplayWidth } from "../terminal-emulator.js";

// Larger than the terminal-emulator default (200) to retain full LLM session output.
const EMBEDDED_PANE_SCROLLBACK_LIMIT = 500;

const EMPTY_PANE_LINES = [
  "원본 CLI 출력이 이 영역에 표시됩니다.",
  "PTY 이벤트가 들어오면 버퍼를 이 패널에 렌더링합니다.",
  "",
  "Ctrl+T 어댑터 터미널 포커스 전환  ·  Esc / Ctrl+G detoks 입력으로 복귀",
] as const;

const truncateToWidth = (line: string, maxWidth: number): string => {
  if (maxWidth <= 0) {
    return "";
  }

  if (line.length <= maxWidth) {
    return line.padEnd(maxWidth);
  }

  if (maxWidth <= 3) {
    return ".".repeat(maxWidth);
  }

  return `${line.slice(0, maxWidth - 3)}...`;
};

const colorToAnsi = (color: TerminalColor | undefined, isForeground: boolean): string | null => {
  if (color === undefined) {
    return null;
  }

  if (color.kind === "ansi") {
    const base = color.value >= 8 ? (isForeground ? 90 : 100) : (isForeground ? 30 : 40);
    return String(base + (color.value % 8));
  }

  if (color.kind === "indexed") {
    return `${isForeground ? 38 : 48};5;${color.value}`;
  }

  return `${isForeground ? 38 : 48};2;${color.red};${color.green};${color.blue}`;
};

const styleSignature = (style: TerminalCellStyle): string => {
  return JSON.stringify({
    fg: style.fg ?? null,
    bg: style.bg ?? null,
    bold: style.bold ?? false,
    dim: style.dim ?? false,
    italic: style.italic ?? false,
    underline: style.underline ?? false,
    inverse: style.inverse ?? false,
  });
};

const styleToAnsi = (style: TerminalCellStyle): string => {
  const codes: string[] = [];
  if (style.bold) codes.push("1");
  if (style.dim) codes.push("2");
  if (style.italic) codes.push("3");
  if (style.underline) codes.push("4");
  if (style.inverse) codes.push("7");
  const fg = colorToAnsi(style.fg, true);
  const bg = colorToAnsi(style.bg, false);
  if (fg !== null) codes.push(fg);
  if (bg !== null) codes.push(bg);
  return codes.length > 0 ? `\x1b[${codes.join(";")}m` : "";
};

const applyDefaultStyle = (
  style: TerminalCellStyle,
  defaultStyle?: Partial<TerminalCellStyle>,
): TerminalCellStyle => {
  if (defaultStyle === undefined) {
    return style;
  }

  return {
    fg: style.fg ?? defaultStyle.fg,
    bg: style.bg ?? defaultStyle.bg,
    bold: style.bold || defaultStyle.bold === true,
    dim: style.dim || defaultStyle.dim === true,
    italic: style.italic || defaultStyle.italic === true,
    underline: style.underline || defaultStyle.underline === true,
    inverse: style.inverse || defaultStyle.inverse === true,
  };
};

const rowToPlainText = (cells: TerminalCell[], maxWidth: number): string => {
  const visibleCells = cells.slice(0, Math.max(0, maxWidth));
  let output = "";

  for (const cell of visibleCells) {
    if (cell.wideContinuation) {
      continue;
    }
    output += cell.char || " ";
  }

  return output.trimEnd();
};

const META_LINE_PATTERNS = [
  /^Context:/,
  /^OpenAI Codex\b/,
  /^workdir:/,
  /^model:/,
  /^provider:/,
  /^approval:/,
  /^sandbox:/,
  /^reasoning effort:/,
  /^reasoning summaries:/,
  /^session id:/,
] as const;

const TOOL_ACTIVITY_PATTERNS = [
  /^web search:/i,
  /^tool_search:/i,
  /^mcp\b/i,
  /^todo_list\b/i,
] as const;

const COMMAND_STATUS_PATTERNS = [
  /^succeeded in \d+ms:?$/i,
  /^failed in \d+ms:?$/i,
  /^exit code \d+$/i,
] as const;

const COMMAND_LINE_PATTERNS = [
  /^\/bin\/(zsh|bash|sh)\b/i,
  /^rg\b/i,
  /^grep\b/i,
  /^find\b/i,
  /^git\b/i,
  /^npm\b/i,
  /^npx\b/i,
  /^node\b/i,
  /^python(?:3)?\b/i,
  /^bun\b/i,
  /^yarn\b/i,
  /^pnpm\b/i,
] as const;

const CONVERSATION_ROLE_PATTERNS = [
  /^codex$/i,
  /^user$/i,
  /^tokens used$/i,
] as const;

const APPROVAL_PROMPT_PATTERNS = [
  /\bapproval\b/i,
  /\bapprove\b/i,
  /\bconfirm\b/i,
  /\ballow\b/i,
  /\bproceed\b/i,
] as const;

const APPROVAL_PROMPT_HINT_PATTERNS = [
  /\by\/n\b/i,
  /\byes\/no\b/i,
  /\[y\/n\]/i,
  /\[y\/N\]/i,
  /\benter\b/i,
  /\bcontinue\b/i,
] as const;

interface RenderedRowInfo {
  cells: TerminalCell[];
  plainText: string;
  globalRow: number;
}

export type EmbeddedActivityKind = "file" | "search" | "tool" | "test" | "git" | "command";

export interface EmbeddedActivitySnapshot {
  kind: EmbeddedActivityKind;
  label: string;
  detail: string;
  status: "running" | "completed" | "failed";
}

export interface EmbeddedInteractionState {
  kind: "none" | "approval";
  label: string;
  detail?: string;
}

const isMetaLine = (plainText: string): boolean =>
  plainText.length > 0 &&
  (plainText === "--------" || META_LINE_PATTERNS.some((pattern) => pattern.test(plainText)));

const isToolActivityLine = (plainText: string): boolean =>
  plainText.length > 0 && TOOL_ACTIVITY_PATTERNS.some((pattern) => pattern.test(plainText));

const isCommandStatusLine = (plainText: string): boolean =>
  plainText.length > 0 && COMMAND_STATUS_PATTERNS.some((pattern) => pattern.test(plainText));

const looksLikeCommandLine = (plainText: string): boolean =>
  plainText.length > 0 && COMMAND_LINE_PATTERNS.some((pattern) => pattern.test(plainText));

const isConversationRoleLine = (plainText: string): boolean =>
  plainText.length > 0 && CONVERSATION_ROLE_PATTERNS.some((pattern) => pattern.test(plainText));

const isApprovalPromptLine = (plainText: string): boolean => {
  if (plainText.length === 0) {
    return false;
  }

  const hasApprovalVerb = APPROVAL_PROMPT_PATTERNS.some((pattern) => pattern.test(plainText));
  const hasApprovalHint = APPROVAL_PROMPT_HINT_PATTERNS.some((pattern) => pattern.test(plainText));
  return hasApprovalVerb && hasApprovalHint;
};

const extractCommandName = (commandLine: string): string => {
  const target = extractShellPayload(commandLine);
  const firstToken = target.split(/\s+/)[0] ?? target;
  const basename = firstToken.split("/").pop() ?? firstToken;
  return basename.length > 0 ? basename : "command";
};

const extractShellPayload = (commandLine: string): string => {
  const trimmed = commandLine.trim();
  const shellMatch = trimmed.match(/\s-lc\s+(?:"((?:\\.|[^"\\])*)"|'([^']*)'|(\S.*?))(?:\s+in\s+\/.*)?$/);
  if (shellMatch) {
    return (shellMatch[1] ?? shellMatch[2] ?? shellMatch[3] ?? trimmed)
      .replace(/\\"/g, "\"")
      .replace(/\\'/g, "'")
      .trim();
  }

  return trimmed.replace(/\s+in\s+\/.*$/, "").trim();
};

const extractPathCandidate = (commandLine: string): string | null => {
  const payload = extractShellPayload(commandLine);
  const pathMatches = payload.match(/(?:~\/|\/|\.\.?\/)[^\s"'`]+/g);
  if (pathMatches !== null && pathMatches.length > 0) {
    return pathMatches[pathMatches.length - 1] ?? null;
  }

  const tokens = payload.split(/\s+/).filter(Boolean);
  const likelyPath = [...tokens].reverse().find((token) =>
    /[./]/.test(token) && /\.(?:[cm]?[jt]sx?|json|md|yml|yaml|toml|lock|txt|css|html|py|rs|go|java|swift)$/i.test(token),
  );
  return likelyPath?.replace(/[;:,]+$/, "") ?? null;
};

const extractSearchQuery = (commandLine: string): string | null => {
  const payload = extractShellPayload(commandLine);
  const quoted = payload.match(/\b(?:rg|grep)\b(?:\s+-\S+)*\s+(?:"([^"]+)"|'([^']+)')/i);
  if (quoted) {
    return quoted[1] ?? quoted[2] ?? null;
  }

  const tokens = payload.split(/\s+/).filter(Boolean);
  const commandIndex = tokens.findIndex((token) => /^(rg|grep)$/i.test(token.split("/").pop() ?? token));
  if (commandIndex >= 0) {
    return tokens.slice(commandIndex + 1).find((token) => !token.startsWith("-"))?.replace(/[;:,]+$/, "") ?? null;
  }

  return null;
};

const describeCommandActivity = (commandLine: string): Omit<EmbeddedActivitySnapshot, "status"> => {
  const payload = extractShellPayload(commandLine);
  const commandName = extractCommandName(commandLine);
  const path = extractPathCandidate(commandLine);

  if (/\b(sed|cat|less|head|tail)\b/i.test(payload) && path !== null) {
    return { kind: "file", label: "파일 읽기", detail: path };
  }

  if (/\b(rg|grep|find)\b/i.test(payload)) {
    const query = extractSearchQuery(commandLine);
    return { kind: "search", label: "검색", detail: query ?? payload };
  }

  if (/\b(git)\b/i.test(payload)) {
    return { kind: "git", label: "Git", detail: payload };
  }

  if (/\b(npm|npx|pnpm|yarn|node)\b/i.test(payload) && /\b(test|vitest|tsc|build)\b/i.test(payload)) {
    return { kind: "test", label: "검증", detail: payload };
  }

  return { kind: "command", label: "명령 실행", detail: commandName };
};

const statusFromCommandStatusLine = (statusLine: string | null): EmbeddedActivitySnapshot["status"] => {
  if (statusLine === null) {
    return "running";
  }

  if (/^succeeded in/i.test(statusLine)) {
    return "completed";
  }

  return "failed";
};

const summarizeCommandActivity = (
  commandLine: string,
  maxWidth: number,
  status: EmbeddedActivitySnapshot["status"],
): string => {
  const activity = describeCommandActivity(commandLine);
  const statusLabel = status === "running" ? "진행 중" : status === "completed" ? "완료" : "실패";
  return truncateForSummary(`${activity.label}: ${activity.detail} · ${statusLabel}`, maxWidth);
};

const truncateForSummary = (text: string, maxWidth: number): string => {
  if (maxWidth <= 0) {
    return "";
  }

  if (text.length <= maxWidth) {
    return text;
  }

  if (maxWidth <= 3) {
    return ".".repeat(maxWidth);
  }

  return `${text.slice(0, maxWidth - 3)}...`;
};

const findMetaValue = (rows: RenderedRowInfo[], key: string): string | null => {
  const matched = rows.find((row) => row.plainText.startsWith(key));
  if (!matched) {
    return null;
  }

  const value = matched.plainText.slice(key.length).trim();
  return value.length > 0 ? value : null;
};

const summarizeMetadataBlock = (rows: RenderedRowInfo[], maxWidth: number): string => {
  const parts: string[] = [];
  const header = rows.find((row) => /^OpenAI Codex\b/i.test(row.plainText));
  if (header) {
    parts.push("OpenAI Codex");
  }

  const model = findMetaValue(rows, "model:");
  const provider = findMetaValue(rows, "provider:");
  const sandbox = findMetaValue(rows, "sandbox:");
  const approval = findMetaValue(rows, "approval:");

  for (const value of [model, provider, sandbox, approval].filter((item): item is string => Boolean(item))) {
    parts.push(value);
  }

  const summary = parts.length > 0 ? `세션 정보: ${parts.join(" · ")}` : "세션 정보";
  return truncateForSummary(summary, maxWidth);
};

const summarizeToolActivityBlock = (rows: RenderedRowInfo[], maxWidth: number): string => {
  const firstLine = rows[0]?.plainText ?? "";
  const label = firstLine.startsWith("web search:")
    ? "웹 검색"
    : firstLine.startsWith("tool_search:")
      ? "도구 검색"
      : firstLine.startsWith("todo_list:")
        ? "할일 도구"
        : firstLine.startsWith("mcp")
          ? "MCP 도구"
          : "도구 활동";
  const detail = firstLine.includes(":") ? firstLine.slice(firstLine.indexOf(":") + 1).trim() : "";
  const summary = detail.length > 0
    ? `${label} ${rows.length}건 · ${detail}`
    : `${label} ${rows.length}건`;
  return truncateForSummary(summary, maxWidth);
};

const summarizeCommandBlock = (rows: RenderedRowInfo[], maxWidth: number): string | null => {
  if (rows.length < 2) {
    return null;
  }

  const commandLine = rows[1]?.plainText.trim() ?? "";
  if (!looksLikeCommandLine(commandLine)) {
    return null;
  }

  const statusLine = rows.find((row, index) => index >= 2 && isCommandStatusLine(row.plainText))?.plainText ?? null;
  const resultLines = rows
    .slice(statusLine ? rows.findIndex((row, index) => index >= 2 && isCommandStatusLine(row.plainText)) + 1 : 2)
    .map((row) => row.plainText)
    .filter((line) => line.length > 0);

  const commandName = extractCommandName(commandLine);
  const statusLabel = statusLine === null
    ? "실행"
    : /^succeeded in/i.test(statusLine)
      ? "성공"
      : /^failed in/i.test(statusLine)
        ? "실패"
        : /^exit code\s+(\d+)$/i.test(statusLine)
          ? `종료 코드 ${statusLine.match(/^exit code\s+(\d+)$/i)?.[1] ?? ""}`.trim()
          : "실행";
  const durationMatch = statusLine?.match(/in\s+(\d+)ms/i);
  const duration = durationMatch?.[1] ? `${durationMatch[1]}ms` : null;
  const parts = [`명령 실행: ${commandName}`];
  if (statusLabel.length > 0) {
    parts.push(statusLabel);
  }
  if (duration) {
    parts.push(duration);
  }
  if (resultLines.length > 0) {
    parts.push(`${resultLines.length}개 결과`);
  }
  return truncateForSummary(parts.join(" · "), maxWidth);
};

const findPendingCommandEnd = (rows: RenderedRowInfo[], startIndex: number): number => {
  let cursor = startIndex;
  while (cursor < rows.length) {
    const text = rows[cursor]?.plainText ?? "";
    if (
      text === "exec" ||
      isMetaLine(text) ||
      isToolActivityLine(text) ||
      isConversationRoleLine(text)
    ) {
      break;
    }
    cursor += 1;
  }
  return cursor;
};

const buildCompactRenderableLines = (
  rows: RenderedRowInfo[],
  maxWidth: number,
  cursorColumn?: number,
  cursorVisible?: boolean,
  cursorGlobalRow?: number,
): EmbeddedTerminalRenderableLine[] => {
  const output: EmbeddedTerminalRenderableLine[] = [];

  for (let index = 0; index < rows.length; ) {
    const row = rows[index];
    if (!row) {
      index += 1;
      continue;
    }

    if (isMetaLine(row.plainText)) {
      const block: RenderedRowInfo[] = [row];
      index += 1;
      while (index < rows.length && rows[index] !== undefined && isMetaLine(rows[index]!.plainText)) {
        block.push(rows[index]!);
        index += 1;
      }

      output.push({
        text: statusColor.muted(
          padDisplayWidth(summarizeMetadataBlock(block, maxWidth), maxWidth),
        ),
      });
      continue;
    }

    if (row.plainText === "exec") {
      const commandBlock: RenderedRowInfo[] = [row];
      if (index + 1 < rows.length && rows[index + 1] !== undefined) {
        commandBlock.push(rows[index + 1]!);
      }

      let statusIndex = -1;
      for (let lookahead = 2; lookahead < Math.min(rows.length - index, 8); lookahead += 1) {
        const candidate = rows[index + lookahead];
        if (candidate !== undefined && isCommandStatusLine(candidate.plainText)) {
          commandBlock.push(candidate);
          statusIndex = index + lookahead;
          break;
        }
      }

      if (statusIndex !== -1) {
        let cursor = statusIndex + 1;
        while (
          cursor < rows.length &&
          rows[cursor] !== undefined &&
          rows[cursor]!.plainText.length > 0 &&
          !isMetaLine(rows[cursor]!.plainText) &&
          !isToolActivityLine(rows[cursor]!.plainText) &&
          rows[cursor]!.plainText !== "exec"
        ) {
          commandBlock.push(rows[cursor]!);
          cursor += 1;
        }

        const summary = summarizeCommandBlock(commandBlock, maxWidth);
        if (summary !== null) {
          output.push({
            text: statusColor.header(padDisplayWidth(summary, maxWidth)),
          });
          index = cursor;
          continue;
        }
      }

      const commandLine = rows[index + 1]?.plainText.trim() ?? "";
      if (looksLikeCommandLine(commandLine)) {
        output.push({
          text: statusColor.muted(
            padDisplayWidth(summarizeCommandActivity(commandLine, maxWidth, "running"), maxWidth),
          ),
        });
        index = findPendingCommandEnd(rows, index + 2);
        continue;
      }
    }

    if (isToolActivityLine(row.plainText)) {
      const block: RenderedRowInfo[] = [row];
      index += 1;
      while (
        index < rows.length &&
        rows[index] !== undefined &&
        isToolActivityLine(rows[index]!.plainText)
      ) {
        block.push(rows[index]!);
        index += 1;
      }

      output.push({
        text: statusColor.muted(
          padDisplayWidth(summarizeToolActivityBlock(block, maxWidth), maxWidth),
        ),
      });
      continue;
    }

    const isCursorCell = cursorVisible === true && cursorGlobalRow === row.globalRow && cursorColumn !== undefined;
    output.push({
      text: renderCellsToAnsi(
        row.cells,
        maxWidth,
        isCursorCell ? cursorColumn : undefined,
        cursorVisible,
        getRowDefaultStyle(row.plainText),
      ),
    });
    index += 1;
  }

  return output;
};

const getRowDefaultStyle = (plainText: string): Partial<TerminalCellStyle> | undefined => {
  if (plainText.length === 0) {
    return undefined;
  }

  if (/^-{4,}$/.test(plainText)) {
    return {
      fg: { kind: "indexed", value: 244 },
      dim: true,
    };
  }

  if (META_LINE_PATTERNS.some((pattern) => pattern.test(plainText))) {
    return {
      fg: { kind: "indexed", value: 250 },
    };
  }

  return undefined;
};

const renderCellsToAnsi = (
  cells: TerminalCell[],
  maxWidth: number,
  cursorColumn?: number,
  cursorVisible?: boolean,
  defaultStyle?: Partial<TerminalCellStyle>,
): string => {
  const visibleCells = cells.slice(0, Math.max(0, maxWidth));
  let output = "";
  let renderedColumns = 0;
  let currentSignature = "";

  for (const [index, cell] of visibleCells.entries()) {
    if (cell.wideContinuation) {
      continue;
    }

    const isCursorCell = cursorVisible === true && cursorColumn === index;
    const baseStyle = applyDefaultStyle(cell.style, defaultStyle);
    const displayStyle = isCursorCell
      ? { ...baseStyle, inverse: true }
      : baseStyle;
    const signature = styleSignature(displayStyle);
    if (signature !== currentSignature) {
      output += "\x1b[0m";
      output += styleToAnsi(displayStyle);
      currentSignature = signature;
    }
    const renderedChar = cell.char || " ";
    output += renderedChar;
    renderedColumns += cell.char.length > 0 ? getCharacterDisplayWidth(renderedChar) : 1;
  }

  if (renderedColumns < maxWidth) {
    output += " ".repeat(maxWidth - renderedColumns);
  }

  return `${output}\x1b[0m`;
};

export interface EmbeddedTerminalRenderableLine {
  text: string;
}

export interface EmbeddedTerminalViewportTrackingInfo {
  pinnedToBottom: boolean;
  distanceFromBottom: number;
  totalLines: number;
}

export class EmbeddedTerminalPane {
  private readonly buffer = new TerminalEmulatorBuffer(80, 24, EMBEDDED_PANE_SCROLLBACK_LIMIT);
  private scrollOffset = 0;
  // Cached total renderable line count (after compact summaries are applied) —
  // updated on every write to avoid rebuilding the combined array on every scrollUp() keypress.
  private cachedTotalRows = 0;
  private currentColumns = 80;
  private currentRows = 24;

  clear(): void {
    this.buffer.reset();
    this.scrollOffset = 0;
    this.cachedTotalRows = 0;
    this.currentColumns = 80;
    this.currentRows = 24;
  }

  resize(columns: number, rows: number): void {
    const nextColumns = Math.max(0, columns);
    const nextRows = Math.max(0, rows);

    if (this.currentColumns === nextColumns && this.currentRows === nextRows) {
      return;
    }

    this.currentColumns = nextColumns;
    this.currentRows = nextRows;
    this.buffer.resize(nextColumns, nextRows);
    this.updateCachedTotalRows();
  }

  scrollUp(): void {
    this.scrollOffset = Math.min(this.scrollOffset + 1, Math.max(0, this.cachedTotalRows - 1));
  }

  scrollDown(): void {
    this.scrollOffset = Math.max(this.scrollOffset - 1, 0);
  }

  scrollToBottom(): void {
    this.scrollOffset = 0;
  }

  scrollBy(deltaRows: number): void {
    if (deltaRows < 0) {
      this.scrollOffset = Math.min(this.scrollOffset + Math.abs(deltaRows), Math.max(0, this.cachedTotalRows - 1));
      return;
    }

    this.scrollOffset = Math.max(this.scrollOffset - deltaRows, 0);
  }

  scrollToTop(maxWidth: number, viewportHeight: number): void {
    const totalLines = this.getRenderableLines(Math.max(1, maxWidth)).length;
    this.scrollOffset = Math.max(0, totalLines - Math.max(0, viewportHeight));
  }

  getViewportTrackingInfo(maxWidth: number, viewportHeight: number): EmbeddedTerminalViewportTrackingInfo {
    const totalLines = this.getRenderableLines(Math.max(1, maxWidth)).length;
    const maxTopRow = Math.max(0, totalLines - Math.max(0, viewportHeight));
    const distanceFromBottom = Math.min(this.scrollOffset, maxTopRow);

    return {
      pinnedToBottom: distanceFromBottom === 0,
      distanceFromBottom,
      totalLines,
    };
  }

  private updateCachedTotalRows(): void {
    this.cachedTotalRows = this.getRenderableLines(this.currentColumns).length;
  }

  addEvent(event: PtyEvent): void {
    if (event.type === "resize") {
      if (typeof event.columns === "number" && typeof event.rows === "number") {
        this.resize(event.columns, event.rows);
      }
      return;
    }

    if (event.type !== "chunk" || typeof event.data !== "string") {
      return;
    }

    this.buffer.write(event.data);
    this.updateCachedTotalRows();
    this.scrollOffset = 0;
  }

  appendFinalAnswer(text: string): void {
    if (text.trim().length === 0) {
      return;
    }

    this.buffer.write(text.endsWith("\n") ? text : `${text}\n`);
    this.updateCachedTotalRows();
    this.scrollOffset = 0;
  }

  hasVisibleContent(): boolean {
    return this.buffer.hasContent();
  }

  getActivitySnapshot(maxWidth = this.currentColumns): EmbeddedActivitySnapshot | null {
    if (!this.buffer.hasContent()) {
      return null;
    }

    const { rows } = this.getRenderedRows(Math.max(1, maxWidth));
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (row === undefined) {
        continue;
      }

      if (row.plainText === "exec") {
        const commandLine = rows[index + 1]?.plainText.trim() ?? "";
        if (!looksLikeCommandLine(commandLine)) {
          continue;
        }

        let statusLine: string | null = null;
        for (let lookahead = index + 2; lookahead < Math.min(rows.length, index + 10); lookahead += 1) {
          const candidate = rows[lookahead]?.plainText ?? "";
          if (isCommandStatusLine(candidate)) {
            statusLine = candidate;
            break;
          }
        }

        const activity = describeCommandActivity(commandLine);
        return {
          ...activity,
          status: statusFromCommandStatusLine(statusLine),
        };
      }

      if (isToolActivityLine(row.plainText)) {
        const detail = row.plainText.includes(":")
          ? row.plainText.slice(row.plainText.indexOf(":") + 1).trim()
          : row.plainText;
        return {
          kind: "tool",
          label: row.plainText.startsWith("web search:") ? "웹 검색" : "도구 활동",
          detail: detail.length > 0 ? detail : "진행 중",
          status: "running",
        };
      }
    }

    return null;
  }

  getInteractionState(maxWidth = this.currentColumns): EmbeddedInteractionState | null {
    if (!this.buffer.hasContent()) {
      return null;
    }

    const { rows } = this.getRenderedRows(Math.max(1, maxWidth));
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (row === undefined || row.plainText.length === 0) {
        continue;
      }

      if (isMetaLine(row.plainText) || isToolActivityLine(row.plainText) || isConversationRoleLine(row.plainText)) {
        continue;
      }

      if (isApprovalPromptLine(row.plainText)) {
        return {
          kind: "approval",
          label: "Codex 승인 대기",
          detail: row.plainText,
        };
      }

      return null;
    }

    return null;
  }

  private getRenderedRows(maxWidth: number): {
    rows: RenderedRowInfo[];
    cursorColumn: number;
    cursorVisible: boolean;
    cursorGlobalRow: number;
  } {
    const scrollbackRows = this.buffer.getScrollbackCells();
    const visibleRows = this.buffer.getVisibleCells();
    const rows = [...scrollbackRows, ...visibleRows];
    const cursorState = this.buffer.getCursorState();
    const cursorGlobalRow = scrollbackRows.length + cursorState.row;

    let lastContentIndex = -1;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      if (row !== undefined && row.some((cell) => (cell.char ?? "").trim().length > 0)) {
        lastContentIndex = i;
        break;
      }
    }

    const contentRows = rows.slice(0, lastContentIndex + 1);
    return {
      rows: contentRows.map((row, offset) => ({
        cells: row,
        plainText: rowToPlainText(row, maxWidth),
        globalRow: offset,
      })),
      cursorColumn: cursorState.column,
      cursorVisible: cursorState.visible,
      cursorGlobalRow,
    };
  }

  getRenderableLines(maxWidth: number, maxRows?: number, scrollOffset = 0): EmbeddedTerminalRenderableLine[] {
    if (maxWidth <= 0) {
      return [];
    }

    if (!this.buffer.hasContent()) {
      return EMPTY_PANE_LINES.map((line) => ({
        text: statusColor.muted(padDisplayWidth(truncateToWidth(line, maxWidth), maxWidth)),
      }));
    }

    const {
      rows: renderedRows,
      cursorColumn,
      cursorVisible,
      cursorGlobalRow,
    } = this.getRenderedRows(maxWidth);

    const compactLines = buildCompactRenderableLines(
      renderedRows,
      maxWidth,
      cursorColumn,
      cursorVisible,
      cursorGlobalRow,
    );

    const endIndex = Math.max(0, compactLines.length - Math.max(0, scrollOffset));
    const startIndex = Math.max(0, maxRows === undefined ? 0 : endIndex - Math.max(0, maxRows));

    return compactLines.slice(startIndex, endIndex);
  }

  render(ctx: RenderContext, region: PanelRegion): void {
    const { screen } = ctx;
    const { usableWidth, usableHeight } = getContentArea(region);

    if (usableWidth <= 0 || usableHeight <= 0) {
      return;
    }

    let currentRow = region.startRow;
    const renderedLines = this.getRenderableLines(usableWidth, usableHeight, this.scrollOffset);

    for (const line of renderedLines) {
      if (currentRow >= region.endRow) {
        break;
      }

      screen.cursorMoveTo(currentRow, 0);
      screen.write(line.text);
      currentRow += 1;
    }

    fillRemaining(ctx, region, currentRow);
  }
}
