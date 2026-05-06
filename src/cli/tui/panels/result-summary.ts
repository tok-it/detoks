import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { PipelineExecutionResult } from "../../../core/pipeline/types.js";
import type { TokenReductionSnapshot } from "../../../core/utils/tokenMetrics.js";
import { getContentArea } from "../layout-manager.js";

export class ResultSummaryPanel {
  private result: PipelineExecutionResult | null = null;

  setResult(result: PipelineExecutionResult): void {
    this.result = result;
  }

  clear(): void {
    this.result = null;
  }

  private formatTokenReduction(tokens: TokenReductionSnapshot): string {
    const saved = Math.max(0, tokens.originalTokens - tokens.optimizedTokens);
    const percent = tokens.originalTokens > 0
      ? ((saved / tokens.originalTokens) * 100).toFixed(1)
      : "0.0";
    return `${tokens.originalTokens}토큰 → ${tokens.optimizedTokens}토큰 (절감 ${saved}토큰, ${percent}%)`;
  }

  private buildLines(): string[] {
    if (!this.result) {
      return [];
    }

    const lines: string[] = [];

    // Status line
    const statusIcon = this.result.ok ? "✓" : "✗";
    const statusText = this.result.ok ? "완료" : "실패";
    lines.push(`${statusIcon} ${statusText}  어댑터: ${this.result.adapter}  세션: ${this.result.sessionId}`);

    // Summary
    lines.push(`요약: ${this.result.summary}`);
    lines.push(`다음 작업: ${this.result.nextAction}`);

    // Token metrics
    if (this.result.tokenMetrics) {
      lines.push("");
      lines.push("토큰 절감");
      lines.push(`  입력: ${this.formatTokenReduction(this.result.tokenMetrics.input)}`);
      lines.push(`  출력: ${this.formatTokenReduction(this.result.tokenMetrics.output)}`);
    }

    return lines;
  }

  render(ctx: RenderContext, region: PanelRegion): void {
    const { screen } = ctx;
    const { usableWidth } = getContentArea(region);

    if (!this.result) {
      // Empty state: render blank panel
      for (let row = region.startRow; row < region.endRow; row++) {
        screen.cursorMoveTo(row, 1);
        screen.write("│" + " ".repeat(usableWidth + 2) + "│");
      }
      return;
    }

    // Header line
    screen.cursorMoveTo(region.startRow, 1);
    screen.write("│ 실행 결과".padEnd(usableWidth + 2) + "│");

    // Content lines
    const lines = this.buildLines();
    let currentRow = region.startRow + 1;

    for (const line of lines) {
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
