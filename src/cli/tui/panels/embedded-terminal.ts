import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { PtyEvent } from "../../../integrations/subprocess/types.js";
import { getContentArea } from "../layout-manager.js";
import { colors } from "../../colors.js";
import { padDisplayWidth } from "../renderer.js";
import type { TerminalCell, TerminalCellStyle, TerminalColor } from "../terminal-emulator.js";
import { TerminalEmulatorBuffer, getCharacterDisplayWidth } from "../terminal-emulator.js";

// Larger than the terminal-emulator default (200) to retain full LLM session output.
const EMBEDDED_PANE_SCROLLBACK_LIMIT = 500;

const EMPTY_PANE_LINES = [
  "원본 CLI 출력이 이 영역에 표시됩니다.",
  "PTY 이벤트가 들어오면 버퍼를 이 패널에 렌더링합니다.",
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

export class EmbeddedTerminalPane {
  private readonly buffer = new TerminalEmulatorBuffer(80, 24, EMBEDDED_PANE_SCROLLBACK_LIMIT);
  private scrollOffset = 0;
  // Cached total row count (scrollback + visible) — updated on every write to avoid
  // rebuilding the combined array on every scrollUp() keypress.
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

  private updateCachedTotalRows(): void {
    this.cachedTotalRows = this.buffer.getScrollbackRows().length + this.buffer.getVisibleRows().length;
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

  getRenderableLines(maxWidth: number, maxRows?: number, scrollOffset = 0): EmbeddedTerminalRenderableLine[] {
    if (maxWidth <= 0) {
      return [];
    }

    if (!this.buffer.hasContent()) {
      return EMPTY_PANE_LINES.map((line) => ({
        text: colors.muted(padDisplayWidth(truncateToWidth(line, maxWidth), maxWidth)),
      }));
    }

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

    const endIndex = Math.max(0, lastContentIndex + 1 - scrollOffset);
    const startIndex = Math.max(0, maxRows === undefined ? 0 : endIndex - Math.max(0, maxRows));
    const renderedRows = rows.slice(startIndex, endIndex);

    return renderedRows.map((row, offset) => {
      const globalRow = startIndex + offset;
      const cursorColumn =
        cursorState.visible && globalRow === cursorGlobalRow ? cursorState.column : undefined;
      const plainText = rowToPlainText(row, maxWidth);
      return {
        text: renderCellsToAnsi(
          row,
          maxWidth,
          cursorColumn,
          cursorState.visible,
          getRowDefaultStyle(plainText),
        ),
      };
    });
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

    while (currentRow < region.endRow) {
      screen.cursorMoveTo(currentRow, 0);
      screen.write(" ".repeat(usableWidth));
      currentRow += 1;
    }
  }
}
