import type { ScreenManager, ScreenDimensions } from "./screen-manager.js";
import { colors } from "../colors.js";

export interface RenderContext {
  screen: ScreenManager;
  dims: ScreenDimensions;
}

export const renderScreenBorder = (ctx: RenderContext): void => {
  const { screen, dims } = ctx;

  // Clear screen only
  screen.clear();
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

export const renderInputArea = (ctx: RenderContext, input: string): void => {
  const { screen, dims } = ctx;
  const separatorRow = dims.rows - 3;
  const inputRow = dims.rows - 2;

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

  // Render colored separator line before input area
  screen.cursorMoveTo(separatorRow, 0);
  const separator = colors.prompt("━".repeat(dims.columns));
  screen.write(separator);

  // Calculate available space for input ("> " = 2 chars)
  const availableWidth = dims.columns - 2;
  let displayInput = input;
  let displayWidth = getDisplayWidth(input);
  let displayOffset = 0;

  // If input is too long, truncate from the left and show from the right
  if (displayWidth > availableWidth) {
    // Find where to start from the end to fit in availableWidth
    const chars = Array.from(input);
    let currentWidth = 0;

    // Iterate from the end to find starting position
    for (let i = chars.length - 1; i >= 0; i--) {
      const char = chars[i];
      if (!char) continue;
      const code = char.charCodeAt(0);
      const charWidth = (
        (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
        (code >= 0x3040 && code <= 0x309f) || // Hiragana
        (code >= 0x30a0 && code <= 0x30ff) || // Katakana
        (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables (Korean)
        (code >= 0x1100 && code <= 0x11ff)    // Hangul Jamo
      ) ? 2 : 1;

      if (currentWidth + charWidth > availableWidth) {
        displayOffset = i + 1;
        break;
      }
      currentWidth += charWidth;
    }

    displayInput = input.substring(displayOffset);
    displayWidth = getDisplayWidth(displayInput);
  }

  const paddingNeeded = Math.max(0, availableWidth - displayWidth);

  screen.cursorMoveTo(inputRow, 0);
  screen.write("> " + displayInput + " ".repeat(paddingNeeded));

  // Cursor position after "> " + displayInput
  // Cursor should be at col 2 + displayWidth (for visible portion)
  screen.cursorMoveTo(inputRow, 2 + displayWidth);
};

export const renderFooter = (ctx: RenderContext): void => {
  const { screen, dims } = ctx;
  const helpText = "[q: quit, ↑↓: scroll, Enter: run]";

  screen.cursorMoveTo(dims.rows - 1, 0);
  screen.write(helpText.padEnd(dims.columns));
};
