import type { ScreenManager, ScreenDimensions } from "./screen-manager.js";
import { colors } from "../colors.js";

export interface RenderContext {
  screen: ScreenManager;
  dims: ScreenDimensions;
}

interface WrappedInputLine {
  text: string;
  width: number;
}

export interface InputLayout {
  separatorRow: number;
  inputStartRow: number;
  inputEndRow: number;
  bottomSeparatorRow: number;
  visibleStartIndex: number;
  visibleLines: WrappedInputLine[];
  cursorRow: number;
  cursorCol: number;
}

export interface FooterContext {
  adapter: string;
  adapterModel?: string | undefined;
  inferenceStrength?: string | undefined;
  tokenSavings?: string | undefined;
  cwd: string;
}

const isWideCharacter = (char: string): boolean => {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3040 && code <= 0x309f) || // Hiragana
    (code >= 0x30a0 && code <= 0x30ff) || // Katakana
    (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
    (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo Extended-A
    (code >= 0x3130 && code <= 0x318f)    // Hangul Compatibility Jamo
  );
};

const wrapInputLines = (
  input: string,
  firstLineWidth: number,
  continuationWidth: number,
): WrappedInputLine[] => {
  const chars = Array.from(input);
  const lines: WrappedInputLine[] = [];
  let currentText = "";
  let currentWidth = 0;
  let currentLimit = firstLineWidth;

  for (const char of chars) {
    const charWidth = isWideCharacter(char) ? 2 : 1;

    if (currentText.length > 0 && currentWidth + charWidth > currentLimit) {
      lines.push({ text: currentText, width: currentWidth });
      currentText = "";
      currentWidth = 0;
      currentLimit = continuationWidth;
    }

    currentText += char;
    currentWidth += charWidth;
  }

  if (currentText.length > 0 || lines.length === 0) {
    lines.push({ text: currentText, width: currentWidth });
  }

  return lines;
};

export const measureDisplayWidth = (text: string): number => {
  let width = 0;
  for (const char of text) {
    width += isWideCharacter(char) ? 2 : 1;
  }
  return width;
};

export const padDisplayWidth = (text: string, width: number): string => {
  const safeWidth = Math.max(0, width);
  const padding = Math.max(0, safeWidth - measureDisplayWidth(text));
  return `${text}${" ".repeat(padding)}`;
};

export const wrapTextToDisplayWidth = (text: string, width: number): string[] => {
  if (width <= 0) {
    return [""];
  }

  const wrapped: string[] = [];

  for (const sourceLine of text.split("\n")) {
    if (sourceLine.length === 0) {
      wrapped.push("");
      continue;
    }

    let currentLine = "";
    let currentWidth = 0;

    for (const char of Array.from(sourceLine)) {
      const charWidth = isWideCharacter(char) ? 2 : 1;
      if (currentLine.length > 0 && currentWidth + charWidth > width) {
        wrapped.push(currentLine);
        currentLine = "";
        currentWidth = 0;
      }

      currentLine += char;
      currentWidth += charWidth;
    }

    wrapped.push(currentLine);
  }

  return wrapped.length > 0 ? wrapped : [""];
};

const ellipsizeLeft = (text: string, maxWidth: number): string => {
  if (maxWidth <= 0) {
    return "";
  }

  if (measureDisplayWidth(text) <= maxWidth) {
    return text;
  }

  if (maxWidth === 1) {
    return "…";
  }

  const targetWidth = maxWidth - 1;
  const chars = Array.from(text);
  const kept: string[] = [];
  let width = 0;

  for (let i = chars.length - 1; i >= 0; i--) {
    const char = chars[i];
    if (!char) {
      continue;
    }
    const charWidth = isWideCharacter(char) ? 2 : 1;
    if (width + charWidth > targetWidth) {
      break;
    }
    kept.push(char);
    width += charWidth;
  }

  return `…${kept.reverse().join("")}`;
};

const ellipsizeRight = (text: string, maxWidth: number): string => {
  if (maxWidth <= 0) {
    return "";
  }

  if (measureDisplayWidth(text) <= maxWidth) {
    return text;
  }

  if (maxWidth === 1) {
    return "…";
  }

  const targetWidth = maxWidth - 1;
  const chars = Array.from(text);
  const kept: string[] = [];
  let width = 0;

  for (const char of chars) {
    const charWidth = isWideCharacter(char) ? 2 : 1;
    if (width + charWidth > targetWidth) {
      break;
    }
    kept.push(char);
    width += charWidth;
  }

  return `${kept.join("")}…`;
};

export const buildFooterText = (columns: number, footer: FooterContext): string => {
  const sidePadding = columns >= 4 ? 1 : 0;
  const innerColumns = Math.max(0, columns - sidePadding * 2);
  const footerValues = [
    footer.adapter,
    footer.adapterModel,
    footer.adapter === "codex" ? footer.inferenceStrength : undefined,
    footer.tokenSavings,
    footer.cwd,
  ].filter((value): value is string => Boolean(value));

  const fullText = footerValues.join(" | ");

  const finalizeFooter = (content: string): string => {
    const contentWidth = measureDisplayWidth(content);
    const paddedContent = content + " ".repeat(Math.max(0, innerColumns - contentWidth));
    const sideSpace = " ".repeat(sidePadding);
    return `${sideSpace}${paddedContent}${sideSpace}`;
  };

  if (measureDisplayWidth(fullText) <= innerColumns) {
    return finalizeFooter(fullText);
  }

  const compactText = footer.tokenSavings
    ? `${footer.adapter} | ${footer.tokenSavings} | ${footer.cwd}`
    : `${footer.adapter} | ${footer.cwd}`;
  if (measureDisplayWidth(compactText) <= innerColumns) {
    return finalizeFooter(compactText);
  }

  const tokenAwareCwdBudget = footer.tokenSavings
    ? Math.max(
        0,
        innerColumns -
          measureDisplayWidth(footer.adapter) -
          measureDisplayWidth(footer.tokenSavings) -
          6,
      )
    : Math.max(0, innerColumns - measureDisplayWidth(footer.adapter) - 3);
  const tokenAwareShortenedCwd = ellipsizeLeft(footer.cwd, tokenAwareCwdBudget);
  let line = footer.tokenSavings
    ? `${footer.adapter} | ${footer.tokenSavings} | ${tokenAwareShortenedCwd}`
    : `${footer.adapter} | ${tokenAwareShortenedCwd}`;

  if (measureDisplayWidth(line) <= innerColumns) {
    return finalizeFooter(line);
  }

  const cwdBudget = Math.max(0, innerColumns - measureDisplayWidth(footer.adapter) - 3);
  const shortenedCwd = ellipsizeLeft(footer.cwd, cwdBudget);
  line = `${footer.adapter} | ${shortenedCwd}`;

  if (measureDisplayWidth(line) <= innerColumns) {
    return finalizeFooter(line);
  }

  const adapterBudget = Math.max(0, innerColumns - 3 - measureDisplayWidth(shortenedCwd));
  const shortenedAdapter = ellipsizeRight(footer.adapter, adapterBudget);
  line = `${shortenedAdapter} | ${shortenedCwd}`;

  if (measureDisplayWidth(line) <= innerColumns) {
    return finalizeFooter(line);
  }

  const shortened = ellipsizeRight(line, innerColumns);
  return finalizeFooter(shortened);
};

export const measureInputLayout = (dims: ScreenDimensions, input: string): InputLayout => {
  const firstLineWidth = Math.max(0, dims.columns - 2);
  const continuationWidth = Math.max(0, dims.columns);
  const allLines = wrapInputLines(input, firstLineWidth, continuationWidth);
  const maxVisibleLines = Math.max(1, dims.rows - 3);
  const visibleStartIndex = Math.max(0, allLines.length - maxVisibleLines);
  const visibleLines = allLines.slice(visibleStartIndex);
  const separatorRow = Math.max(0, dims.rows - visibleLines.length - 3);
  const inputStartRow = separatorRow + 1;
  const bottomSeparatorRow = dims.rows - 2;
  const inputEndRow = dims.rows - 1;
  const lastVisibleLine = visibleLines[visibleLines.length - 1] ?? { text: "", width: 0 };
  const cursorRow = inputStartRow + visibleLines.length - 1;
  const cursorCol = lastVisibleLine.width + (visibleStartIndex === 0 && visibleLines.length === 1 ? 2 : 0);

  return {
    separatorRow,
    inputStartRow,
    inputEndRow,
    bottomSeparatorRow,
    visibleStartIndex,
    visibleLines,
    cursorRow,
    cursorCol,
  };
};

export const renderScreenBorder = (ctx: RenderContext): void => {
  void ctx;
  // The outer TUI now redraws rows in place. Avoid a full-screen clear on every
  // render pass to prevent flicker and preserve native-CLI pane stability.
};

export const renderHeader = (ctx: RenderContext, title: string): void => {
  const { screen, dims } = ctx;

  screen.cursorMoveTo(0, 0);
  screen.write(title.padEnd(dims.columns));
};

export const renderConfigInfo = (
  ctx: RenderContext,
  configLines: string[],
  startRow: number,
): number => {
  const { screen, dims } = ctx;
  let currentRow = startRow;

  for (const line of configLines) {
    if (currentRow < dims.rows - 3) {
      screen.cursorMoveTo(currentRow, 0);
      const displayLine = line.length > dims.columns
        ? line.slice(0, dims.columns - 3) + "..."
        : line.padEnd(dims.columns);
      screen.write(displayLine);
      currentRow += 1;
    }
  }

  return currentRow;
};

export const renderStatusPanel = (
  ctx: RenderContext,
  status: string[],
  startRow: number,
): number => {
  const { screen, dims } = ctx;
  let currentRow = startRow;

  status.forEach((line) => {
    if (currentRow < dims.rows - 3) {
      screen.cursorMoveTo(currentRow, 0);
      screen.write(line.padEnd(dims.columns));
      currentRow += 1;
    }
  });

  return currentRow;
};

export const renderInputArea = (ctx: RenderContext, input: string): InputLayout => {
  const { screen, dims } = ctx;
  const layout = measureInputLayout(dims, input);

  // Render colored separator line before input area
  for (let row = layout.separatorRow; row <= layout.bottomSeparatorRow; row++) {
    screen.cursorMoveTo(row, 0);
    screen.write(" ".repeat(dims.columns));
  }

  screen.cursorMoveTo(layout.separatorRow, 0);
  const separator = colors.prompt("━".repeat(dims.columns));
  screen.write(separator);

  layout.visibleLines.forEach((line, index) => {
    const row = layout.inputStartRow + index;
    const isFirstPromptLine = layout.visibleStartIndex === 0 && index === 0;
    const prefix = isFirstPromptLine ? "> " : "";
    const availableWidth = isFirstPromptLine ? Math.max(0, dims.columns - 2) : dims.columns;
    const paddingNeeded = Math.max(0, availableWidth - line.width);

    screen.cursorMoveTo(row, 0);
    screen.write(prefix + line.text + " ".repeat(paddingNeeded));
  });

  screen.cursorMoveTo(layout.bottomSeparatorRow, 0);
  screen.write(colors.prompt("━".repeat(dims.columns)));

  screen.cursorMoveTo(layout.cursorRow, layout.cursorCol);

  return layout;
};

export const renderFocusArea = (
  ctx: RenderContext,
  message: string,
): InputLayout => {
  const { screen, dims } = ctx;
  const layout = measureInputLayout(dims, "");
  const displayMessage = message.length > dims.columns
    ? `${message.slice(0, Math.max(0, dims.columns - 3))}...`
    : message;

  for (let row = layout.separatorRow; row <= layout.bottomSeparatorRow; row += 1) {
    screen.cursorMoveTo(row, 0);
    screen.write(" ".repeat(dims.columns));
  }

  screen.cursorMoveTo(layout.separatorRow, 0);
  screen.write(colors.prompt("━".repeat(dims.columns)));

  screen.cursorMoveTo(layout.inputStartRow, 0);
  screen.write(colors.muted(displayMessage.padEnd(dims.columns)));

  screen.cursorMoveTo(layout.bottomSeparatorRow, 0);
  screen.write(colors.prompt("━".repeat(dims.columns)));

  screen.cursorMoveTo(layout.inputStartRow, 0);
  return layout;
};

export const renderFooter = (ctx: RenderContext, footerText: string): void => {
  const { screen, dims } = ctx;

  screen.cursorMoveTo(dims.rows - 1, 0);
  screen.write(colors.footer(footerText));
};
