import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { PtyEvent } from "../../../integrations/subprocess/types.js";
import { getContentArea, getPanelHeight } from "../layout-manager.js";

export class TranscriptPanel {
  private lines: string[] = [];
  private scrollOffset: number = 0;

  append(chunk: string): void {
    // Split chunk into lines and add each
    const newLines = chunk.split("\n");
    for (const line of newLines) {
      if (line.length > 0) {
        this.lines.push(line);
      }
    }

    // Auto-scroll to bottom when new content arrives
    this.scrollToBottom();
  }

  addEvent(event: PtyEvent): void {
    if (event.type === "chunk" && event.stream === "stdout" && event.data) {
      this.append(event.data);
    } else if (event.type === "chunk" && event.stream === "stderr" && event.data) {
      // Prefix stderr with indicator (could use ANSI color codes later)
      const lines = event.data.split("\n");
      for (const line of lines) {
        if (line.length > 0) {
          this.lines.push(`[ERR] ${line}`);
        }
      }
      this.scrollToBottom();
    }
  }

  scrollUp(): void {
    this.scrollOffset = Math.min(
      this.scrollOffset + 1,
      Math.max(0, this.lines.length - 1),
    );
  }

  scrollDown(): void {
    this.scrollOffset = Math.max(this.scrollOffset - 1, 0);
  }

  scrollToBottom(): void {
    this.scrollOffset = 0;
  }

  clear(): void {
    this.lines = [];
    this.scrollOffset = 0;
  }

  render(ctx: RenderContext, region: PanelRegion): void {
    const { screen } = ctx;
    const { usableWidth, usableHeight } = getContentArea(region);
    const panelHeight = getPanelHeight(region);

    // Header line
    screen.cursorMoveTo(region.startRow, 1);
    screen.write("│ 실시간 출력".padEnd(usableWidth + 2) + "│");

    // Content lines
    const startIdx = Math.max(0, this.lines.length - (usableHeight - 1));
    const visibleLines = this.lines.slice(startIdx);

    let currentRow = region.startRow + 1;
    for (const line of visibleLines) {
      if (currentRow >= region.endRow - 1) break;

      // Truncate line to fit in usable width
      const displayLine = line.length > usableWidth
        ? line.slice(0, usableWidth - 3) + "..."
        : line.padEnd(usableWidth);

      screen.cursorMoveTo(currentRow, 1);
      screen.write(`│ ${displayLine} │`);
      currentRow += 1;
    }

    // Fill remaining rows
    while (currentRow < region.endRow - 1) {
      screen.cursorMoveTo(currentRow, 1);
      screen.write("│" + " ".repeat(usableWidth + 2) + "│");
      currentRow += 1;
    }
  }
}
