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
  const padding = Math.floor((dims.columns - title.length - 2) / 2);

  screen.cursorMoveTo(0, 1);
  screen.write("┬" + "─".repeat(dims.columns - 2) + "┐");

  screen.cursorMoveTo(1, 1);
  screen.write("│ " + title.padEnd(dims.columns - 4) + " │");

  screen.cursorMoveTo(2, 1);
  screen.write("├" + "─".repeat(dims.columns - 2) + "┤");
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

  screen.cursorMoveTo(inputRow - 1, 1);
  screen.write("├" + "─".repeat(dims.columns - 2) + "┤");

  screen.cursorMoveTo(inputRow, 1);
  screen.write("│ > " + input.padEnd(dims.columns - 5) + " │");

  screen.cursorMoveTo(inputRow, 4 + input.length);
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
