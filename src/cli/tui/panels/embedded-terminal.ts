import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { PtyEvent } from "../../../integrations/subprocess/types.js";
import { getContentArea } from "../layout-manager.js";
import { colors } from "../../colors.js";
import { TerminalEmulatorBuffer } from "../terminal-emulator.js";

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

export class EmbeddedTerminalPane {
  private readonly buffer = new TerminalEmulatorBuffer(80, 24);

  clear(): void {
    this.buffer.reset();
  }

  addEvent(event: PtyEvent): void {
    if (event.type === "resize") {
      if (typeof event.columns === "number" && typeof event.rows === "number") {
        this.buffer.resize(event.columns, event.rows);
      }
      return;
    }

    if (event.type !== "chunk" || typeof event.data !== "string") {
      return;
    }

    this.buffer.write(event.data);
  }

  appendFinalAnswer(text: string): void {
    if (text.trim().length === 0) {
      return;
    }

    this.buffer.write(text.endsWith("\n") ? text : `${text}\n`);
  }

  hasVisibleContent(): boolean {
    return this.buffer.hasContent();
  }

  render(ctx: RenderContext, region: PanelRegion): void {
    const { screen } = ctx;
    const { usableWidth, usableHeight } = getContentArea(region);

    if (usableWidth <= 0 || usableHeight <= 0) {
      return;
    }

    const hasContent = this.buffer.hasContent();
    const rows = [...this.buffer.getScrollbackRows(), ...this.buffer.getVisibleRows()];
    const renderedRows = hasContent
      ? (() => {
          let lastContentIndex = -1;
          for (let i = rows.length - 1; i >= 0; i -= 1) {
            if ((rows[i] ?? "").trim().length > 0) {
              lastContentIndex = i;
              break;
            }
          }
          const startIndex = Math.max(0, lastContentIndex - usableHeight + 1);
          return rows.slice(startIndex, startIndex + usableHeight);
        })()
      : EMPTY_PANE_LINES.slice();

    let currentRow = region.startRow;
    for (const line of renderedRows) {
      if (currentRow >= region.endRow) {
        break;
      }

      const displayLine = hasContent
        ? truncateToWidth(line, usableWidth)
        : colors.muted(truncateToWidth(line, usableWidth));

      screen.cursorMoveTo(currentRow, 0);
      screen.write(displayLine);
      currentRow += 1;
    }

    while (currentRow < region.endRow) {
      screen.cursorMoveTo(currentRow, 0);
      screen.write(" ".repeat(usableWidth));
      currentRow += 1;
    }
  }
}
