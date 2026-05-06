import type { ScreenManager, ScreenDimensions } from "./screen-manager.js";

export interface RenderContext {
  screen: ScreenManager;
  dims: ScreenDimensions;
}

export const renderScreenBorder = (ctx: RenderContext): void => {
  const { screen, dims } = ctx;

  // Clear screen
  screen.clear();

  // Top border
  screen.cursorMoveTo(0, 0);
  screen.write("┌" + "─".repeat(dims.columns - 2) + "┐");

  // Bottom border
  screen.cursorMoveTo(dims.rows - 1, 0);
  screen.write("└" + "─".repeat(dims.columns - 2) + "┘");

  // Left and right borders
  for (let i = 1; i < dims.rows - 1; i++) {
    screen.cursorMoveTo(i, 0);
    screen.write("│");
    screen.cursorMoveTo(i, dims.columns - 1);
    screen.write("│");
  }
};

export const renderHeader = (ctx: RenderContext, title: string): void => {
  const { screen, dims } = ctx;

  screen.cursorMoveTo(0, 1);
  screen.write("├" + "─".repeat(dims.columns - 2) + "┤");

  screen.cursorMoveTo(1, 1);
  screen.write("│ " + title.padEnd(dims.columns - 4) + " │");

  screen.cursorMoveTo(2, 1);
  screen.write("├" + "─".repeat(dims.columns - 2) + "┤");
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
      screen.cursorMoveTo(currentRow, 1);
      const displayLine = line.length > dims.columns - 4
        ? line.slice(0, dims.columns - 7) + "..."
        : line.padEnd(dims.columns - 4);
      screen.write("│ " + displayLine + " │");
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
      screen.cursorMoveTo(currentRow, 1);
      screen.write("│ " + line.padEnd(dims.columns - 4) + " │");
      currentRow += 1;
    }
  });

  return currentRow;
};

export const renderInputArea = (ctx: RenderContext, input: string): void => {
  const { screen, dims } = ctx;
  const inputRow = dims.rows - 3;

  // Calculate display width of input (considering CJK characters are 2 columns wide)
  const getDisplayWidth = (str: string): number => {
    let width = 0;
    for (const char of str) {
      // CJK Unified Ideographs range (Chinese, Japanese, Korean characters)
      const code = char.charCodeAt(0);
      if ((code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
          (code >= 0x3040 && code <= 0x309f) || // Hiragana
          (code >= 0x30a0 && code <= 0x30ff) || // Katakana
          (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables (Korean)
          (code >= 0x1100 && code <= 0x11ff)) { // Hangul Jamo
        width += 2;
      } else {
        width += 1;
      }
    }
    return width;
  };

  const displayWidth = getDisplayWidth(input);
  const maxInputWidth = dims.columns - 5;
  const paddingNeeded = Math.max(0, maxInputWidth - displayWidth);

  screen.cursorMoveTo(inputRow - 1, 1);
  screen.write("├" + "─".repeat(dims.columns - 2) + "┤");

  screen.cursorMoveTo(inputRow, 1);
  screen.write("│ > " + input + " ".repeat(paddingNeeded) + " │");

  // Cursor position: start at column 4 (after "│ > "), then add display width
  screen.cursorMoveTo(inputRow, 4 + displayWidth);
};

export const renderFooter = (ctx: RenderContext): void => {
  const { screen, dims } = ctx;
  const helpText = "[q: quit, ctrl+c: exit]";
  const padding = Math.floor((dims.columns - helpText.length - 2) / 2);

  screen.cursorMoveTo(dims.rows - 2, 1);
  screen.write("├" + "─".repeat(dims.columns - 2) + "┤");

  screen.cursorMoveTo(dims.rows - 2, 1);
  screen.write("│" + " ".repeat(padding) + helpText.padEnd(dims.columns - 2 - padding) + "│");
};
