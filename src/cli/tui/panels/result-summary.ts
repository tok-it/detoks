import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { PipelineExecutionResult } from "../../../core/pipeline/types.js";
import type { TokenReductionSnapshot } from "../../../core/utils/tokenMetrics.js";
import { getTurnRecapLines } from "../../../core/timeline/action-timeline.js";
import { getContentArea } from "../layout-manager.js";
import { fillRemaining, truncateByLength, writePaddedLine } from "./base.js";
import { glyph, statusColor } from "../design/tokens.js";

const EMPTY_RESULT_LINES = [
  "실행 결과가 아직 없습니다.",
  "첫 실행 이후 작업 타임라인 · 다음 작업 · 사용량/압축 지표가 이 영역에 표시됩니다.",
] as const;

export class ResultSummaryPanel {
  private result: PipelineExecutionResult | null = null;
  private executing = false;

  setResult(result: PipelineExecutionResult): void {
    this.result = result;
    this.executing = false;
  }

  setExecuting(active: boolean): void {
    this.executing = active;
  }

  clear(): void {
    this.result = null;
    this.executing = false;
  }

  private formatTokenReduction(tokens: TokenReductionSnapshot): string {
    const saved = Math.max(0, tokens.originalTokens - tokens.optimizedTokens);
    const percent = tokens.originalTokens > 0
      ? ((saved / tokens.originalTokens) * 100).toFixed(1)
      : "0.0";
    return `${tokens.originalTokens}토큰 → ${tokens.optimizedTokens}토큰 (절감 ${saved}토큰, ${percent}%)`;
  }

  private extractActualTokenUsage(rawOutput: string): string | null {
    const usageMatch = /tokens used\s*\n\s*([0-9][0-9,]*)/i.exec(rawOutput);
    return usageMatch?.[1] ?? null;
  }

  getLines(): string[] {
    if (this.executing) {
      return ["", "  Waiting for adapter CLI to finish…"];
    }

    if (!this.result) {
      return [];
    }

    const lines: string[] = [];

    const statusIcon = this.result.ok ? glyph.success : glyph.failure;
    const statusText = this.result.ok ? "완료" : "실패";
    lines.push(`${statusIcon} ${statusText}  어댑터: ${this.result.adapter}  세션: ${this.result.sessionId}`);

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

    const actualUsage = this.extractActualTokenUsage(this.result.rawOutput);
    if (actualUsage !== null) {
      lines.push("");
      lines.push("사용량");
      lines.push(`  실제 ${this.result.adapter} 사용량: ${actualUsage} tokens`);
    }

    if (this.result.tokenMetrics || this.result.promptTokenSavings) {
      lines.push("");
      lines.push("detoks 압축 지표");
      if (this.result.tokenMetrics) {
        lines.push(`  프롬프트 압축: ${this.formatTokenReduction(this.result.tokenMetrics.input)}`);
        lines.push(`  결과 요약 압축: ${this.formatTokenReduction(this.result.tokenMetrics.output)}`);
      } else if (this.result.promptTokenSavings) {
        lines.push(`  프롬프트 압축: ${this.formatTokenReduction(this.result.promptTokenSavings)}`);
      }
    }

    return lines;
  }

  render(ctx: RenderContext, region: PanelRegion): void {
    const { usableWidth } = getContentArea(region);

    const isEmptyState = this.result === null && !this.executing;
    const lines = isEmptyState ? [...EMPTY_RESULT_LINES] : this.getLines();
    let currentRow = region.startRow;

    for (const line of lines) {
      if (currentRow >= region.endRow) break;

      const truncated = truncateByLength(line, usableWidth);
      if (isEmptyState) {
        writePaddedLine(ctx, currentRow, truncated, usableWidth, statusColor.muted);
      } else {
        writePaddedLine(ctx, currentRow, truncated, usableWidth);
      }
      currentRow += 1;
    }

    fillRemaining(ctx, region, currentRow);
  }
}
