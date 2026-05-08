import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { PipelineExecutionResult } from "../../../core/pipeline/types.js";
import type { TokenReductionSnapshot } from "../../../core/utils/tokenMetrics.js";
import { getTurnRecapLines } from "../../../core/timeline/action-timeline.js";
import { getContentArea } from "../layout-manager.js";
import { colors } from "../../colors.js";

const EMPTY_RESULT_LINES = [
  "실행 결과가 아직 없습니다.",
  "첫 실행 이후 작업 타임라인 · 다음 작업 · 토큰 절감이 이 영역에 표시됩니다.",
] as const;

const truncateLine = (line: string, maxWidth: number): string => {
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

    const turnRecap = [...(this.result.actionTimeline ?? [])]
      .reverse()
      .find((event) => event.kind === "turn_recap");

    if (turnRecap) {
      lines.push("");
      lines.push("작업 타임라인");
      for (const line of getTurnRecapLines(turnRecap)) {
        lines.push(`  ${line}`);
      }
    }

    // Token metrics
    if (this.result.tokenMetrics) {
      lines.push("");
      lines.push("토큰 절감");
      lines.push(`  입력: ${this.formatTokenReduction(this.result.tokenMetrics.input)}`);
      lines.push(`  작업 결과 요약: ${this.formatTokenReduction(this.result.tokenMetrics.output)}`);
    }

    return lines;
  }

  render(ctx: RenderContext, region: PanelRegion): void {
    const { screen } = ctx;
    const { usableWidth } = getContentArea(region);

    const isEmptyState = this.result === null;
    const lines = isEmptyState ? [...EMPTY_RESULT_LINES] : this.buildLines();
    let currentRow = region.startRow;

    for (const line of lines) {
      if (currentRow >= region.endRow) break;

      const displayLine = isEmptyState
        ? colors.muted(truncateLine(line, usableWidth))
        : truncateLine(line, usableWidth);

      screen.cursorMoveTo(currentRow, 0);
      screen.write(displayLine);
      currentRow += 1;
    }

    // Fill remaining rows
    while (currentRow < region.endRow) {
      screen.cursorMoveTo(currentRow, 0);
      screen.write(" ".repeat(usableWidth));
      currentRow += 1;
    }
  }
}
